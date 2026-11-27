// Run with: node plugins/main/test/public/pso-station/security.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('../../../node_modules/typescript');
const root = path.resolve(
  __dirname,
  '../../../public/components/group-dashboard',
);
function load({
  page,
  search,
  cluster = { status: 'disabled', manager: 'manager-a' },
} = {}) {
  const calls = [];
  const exports = {};
  const modules = {
    '../../react-services/generic-request': {
      GenericRequest: {
        request: async (...args) => {
          calls.push(args);
          return search();
        },
      },
    },
    '../../react-services/app-state': {
      AppState: { getClusterInfo: () => cluster },
    },
    '../../react-services/wazuh-config': {
      WazuhConfig: class {
        getConfig() {
          return { pattern: 'alerts-*' };
        }
      },
    },
    '../../../common/constants': {
      WAZUH_VULNERABILITIES_PATTERN: 'vulnerabilities-*',
    },
    './service': { getStationAgents: page },
  };
  const result = ts.transpileModule(
    fs.readFileSync(path.join(root, 'security-service.ts'), 'utf8'),
    {
      reportDiagnostics: true,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2019,
      },
    },
  );
  assert.deepEqual(result.diagnostics, []);
  vm.runInNewContext(result.outputText, {
    exports,
    URL,
    require: name => {
      assert(name in modules, name);
      return modules[name];
    },
  });
  return { api: exports, calls };
}
const valid = () => ({
  data: {
    hits: {
      total: { value: 2, relation: 'eq' },
      hits: [
        {
          _id: 'x',
          _source: {
            agent: { id: '001', name: 'Laptop' },
            rule: { description: 'Test detection', level: 12 },
            vulnerability: { id: 'CVE-test', severity: 'Critical' },
            package: { name: 'test' },
          },
        },
      ],
    },
    aggregations: { devices: { buckets: [{ key: '001' }] } },
    _shards: { failed: 0 },
  },
});
test('membership paginates and excludes duplicate IDs', async () => {
  const offsets = [];
  const { api } = load({
    page: async ({ offset }) => {
      offsets.push(offset);
      return {
        affected_items: offset ? [{ id: '002' }] : [{ id: '001' }],
        total_affected_items: 2,
      };
    },
  });
  assert.equal((await api.getStationAgentIds()).join(','), '001,002');
  assert.deepEqual(offsets, [0, 1]);
});
test('membership failure cannot trigger broad searches', async () => {
  const { api, calls } = load({
    page: async () => {
      throw Error('Forbidden');
    },
  });
  await assert.rejects(() => api.getStationAgentIds(), /Forbidden/);
  assert.equal(calls.length, 0);
});
test('empty membership performs no security search', async () => {
  const { api, calls } = load();
  assert.equal((await api.getStationSecurity('threats', [], 24)).findings, 0);
  assert.equal(calls.length, 0);
});
test('alerts are scoped by IDs, manager, severity and selected period', async () => {
  const { api, calls } = load({ search: valid });
  const result = await api.getStationSecurity('threats', ['001'], 168);
  const request = calls[0][2];
  assert.equal(request.index, 'alerts-*');
  assert.equal(request.allow_no_indices, false);
  const filters = JSON.stringify(request.body.query.bool.filter);
  assert.match(filters, /"agent.id":\["001"\]/);
  assert.match(filters, /"manager.name":"manager-a"/);
  assert.match(filters, /now-168h/);
  assert.match(filters, /"rule.level":\{"gte":12\}/);
  assert.equal(result.findings, 2);
  assert.equal(result.affectedDevices, 1);
});
test('vulnerabilities use state index and cluster scope without alert time range', async () => {
  const { api, calls } = load({
    search: valid,
    cluster: { status: 'enabled', cluster: 'cluster-a' },
  });
  await api.getStationSecurity('vulnerabilities', ['001'], 24);
  const request = calls[0][2];
  assert.equal(request.index, 'vulnerabilities-*');
  const filters = JSON.stringify(request.body.query.bool.filter);
  assert.match(filters, /"wazuh.cluster.name":"cluster-a"/);
  assert.match(filters, /Critical/);
  assert.match(filters, /High/);
  assert.doesNotMatch(filters, /timestamp/);
});
test('incomplete and failed searches are unavailable, never healthy zeros', async () => {
  for (const data of [
    {},
    { ...valid().data, timed_out: true },
    { ...valid().data, _shards: { failed: 1 } },
    {
      ...valid().data,
      hits: { total: { value: 2, relation: 'gte' }, hits: [] },
    },
  ]) {
    const { api } = load({ search: () => ({ data }) });
    await assert.rejects(() => api.getStationSecurity('threats', ['001'], 24));
  }
  const { api } = load({
    search: () => {
      throw Error('Missing index');
    },
  });
  await assert.rejects(
    () => api.getStationSecurity('threats', ['001'], 24),
    /Missing index/,
  );
});
test('missing manager refuses the search', async () => {
  const { api, calls } = load({ cluster: {} });
  await assert.rejects(() => api.getStationSecurity('threats', ['001'], 24));
  assert.equal(calls.length, 0);
});

test('servers membership uses the servers group on every page', async () => {
  const groups = [];
  const { api } = load({
    page: async ({ offset }, group) => {
      groups.push(group);
      return {
        affected_items: [{ id: offset ? '102' : '101' }],
        total_affected_items: 2,
      };
    },
  });
  assert.equal((await api.getStationAgentIds('servers')).join(','), '101,102');
  assert.deepEqual(groups, ['servers', 'servers']);
});

test('inventory defaults to PSO Station and explicitly scopes servers', async () => {
  const calls = [];
  const api = {};
  const source = ts.transpileModule(
    fs.readFileSync(path.join(root, 'service.ts'), 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2019,
      },
    },
  ).outputText;
  vm.runInNewContext(source, {
    exports: api,
    require: () => ({
      WzRequest: {
        apiReq: async (...args) => {
          calls.push(args);
          return {
            data: { data: { affected_items: [], total_affected_items: 0 } },
          };
        },
      },
    }),
  });
  await api.getStationAgents({ limit: 10 });
  await api.getStationAgents(
    { limit: 10, group: 'pso-station', q: 'id=000' },
    'servers',
  );
  assert.equal(calls[0][2].params.group, 'pso-station');
  assert.equal(calls[1][2].params.group, 'servers');
  assert.equal(calls[1][2].params.q, 'id!=000');
});

test('alert severity selection changes the query threshold', async () => {
  const { api, calls } = load({ search: valid });
  await api.getStationSecurity('threats', ['001'], 24, 7);
  assert.match(
    JSON.stringify(calls[0][2].body.query),
    /"rule.level":\{"gte":7\}/,
  );
});

test('advisories allow HTTP(S) and reject executable or invalid URLs', () => {
  const { api } = load();
  assert.equal(
    api.safeReference('https://example.com/CVE-1'),
    'https://example.com/CVE-1',
  );
  for (const value of [
    'javascript:alert(1)',
    'data:text/html,test',
    '/relative',
    undefined,
    [],
  ]) {
    assert.equal(api.safeReference(value), undefined);
  }
});

function assessmentApi(request) {
  const exports = {};
  const source = ts.transpileModule(
    fs.readFileSync(path.join(root, 'assessment-service.ts'), 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2019,
      },
    },
  );
  vm.runInNewContext(source.outputText, {
    exports,
    require: () => ({ WzRequest: { apiReq: request } }),
  });
  return exports;
}

test('assessments reject out-of-scope devices before API access', async () => {
  let called = false;
  const api = assessmentApi(async () => {
    called = true;
  });
  await assert.rejects(
    () => api.getDeviceAssessments('002', ['001']),
    /outside/,
  );
  assert.equal(called, false);
});

test('assessment freshness distinguishes recent, older, missing and future scans', () => {
  const api = assessmentApi();
  const now = Date.parse('2026-11-25T12:00:00Z');
  assert.equal(
    api.assessmentFreshness('2026-11-25T11:00:00Z', now),
    'Within 24 hours',
  );
  assert.equal(
    api.assessmentFreshness('2026-11-23T11:00:00Z', now),
    'Older than 24 hours',
  );
  for (const value of [undefined, 'bad', '2026-11-26T12:00:00Z']) {
    assert.equal(api.assessmentFreshness(value, now), 'Unknown');
  }
});

test('assessments preserve scan time and unknown fields; failures do not become zero', async () => {
  const calls = [];
  let response = {
    data: {
      data: {
        affected_items: [
          {
            policy_id: 'cis',
            name: 'CIS',
            fail: 4,
            end_scan: '2026-11-25T10:00:00Z',
          },
        ],
        total_affected_items: 1,
      },
    },
  };
  const api = assessmentApi(async (...args) => {
    calls.push(args);
    return response;
  });
  const result = await api.getDeviceAssessments('001', ['001']);
  assert.equal(calls[0][1], '/sca/001');
  assert.equal(result.policies[0].fail, 4);
  assert.equal(result.policies[0].pass, undefined);
  assert.equal(result.policies[0].end_scan, '2026-11-25T10:00:00Z');
  response = {
    data: {
      data: { affected_items: [], total_affected_items: 0, failed_items: [{}] },
    },
  };
  await assert.rejects(() => api.getDeviceAssessments('001', ['001']));
  response = {
    data: { data: { affected_items: [], total_affected_items: 0 } },
  };
  assert.equal((await api.getDeviceAssessments('001', ['001'])).total, 0);
});

test('security pagination forwards offsets and refuses invalid pages', async () => {
  const { api, calls } = load({ search: valid });
  await api.getStationSecurity('threats', ['001'], 24, 12, 20);
  assert.equal(calls[0][2].body.from, 20);
  assert.equal(calls[0][2].body.size, 10);
  for (const offset of [-1, 0.5, 10000]) {
    await assert.rejects(() =>
      api.getStationSecurity('threats', ['001'], 24, 12, offset),
    );
  }
  assert.equal(calls.length, 1);
});

test('assessment pagination forwards offset and configurable scan-age threshold', async () => {
  let params;
  const api = assessmentApi(async (_method, _path, payload) => {
    params = payload.params;
    return { data: { data: { affected_items: [], total_affected_items: 20 } } };
  });
  await api.getDeviceAssessments('001', ['001'], 10);
  assert.equal(params.offset, 10);
  assert.equal(params.limit, 10);
  assert.equal(
    api.assessmentFreshness(
      '2026-11-24T00:00:00Z',
      Date.parse('2026-11-25T12:00:00Z'),
      48,
    ),
    'Within 48 hours',
  );
});

test('membership retains names and connection state for assessment selection', async () => {
  const { api } = load({
    page: async () => ({
      affected_items: [
        { id: '001', name: 'office-test', status: 'disconnected' },
      ],
      total_affected_items: 1,
    }),
  });
  const agents = await api.getStationMembers('servers');
  assert.equal(agents[0].name, 'office-test');
  assert.equal(agents[0].status, 'disconnected');
});

test('development down preserves containers and up does not renew volumes', async () => {
  const exports = {};
  const filename = path.resolve(
    root,
    '../../../../../docker/osd-dev/scripts/src/services/dockerComposeRunner.ts',
  );
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
    },
  }).outputText;
  const modules = {
    fs: { existsSync: () => false },
    '../errors': { ValidationError: Error },
    chalk: {},
    '../constants/app': {
      ACTIONS: {
        UP: 'up',
        DOWN: 'down',
        STOP: 'stop',
        START: 'start',
        MANAGER_LOCAL_UP: 'manager-local-up',
      },
      SERVICE_NAMES: { WAZUH_MANAGER_LOCAL: 'wazuh.manager.local' },
    },
    '../constants/messages': { msgActionMustBe: () => 'Invalid action' },
  };
  vm.runInNewContext(source, {
    exports,
    process: { env: {} },
    require: name => {
      assert(name in modules, name);
      return modules[name];
    },
  });
  const calls = [];
  const runner = {
    spawn: (_cmd, args) => {
      calls.push(args);
      return { on: (_event, callback) => callback(0) };
    },
  };
  for (const action of ['down', 'up']) {
    assert.equal(
      await exports.runDockerCompose(
        { action },
        ['server'],
        ['dev.yml'],
        {},
        { info: () => {} },
        runner,
      ),
      0,
    );
  }
  assert.equal(calls[0].at(-1), 'stop');
  assert(!calls[0].includes('down'));
  assert(!calls[0].includes('-v'));
  assert(!calls[1].some(arg => arg.includes('V')));
});

test('OB Station membership and findings retain only the requested group scope', async () => {
  const groups = [];
  const { api, calls } = load({
    page: async (_params, group) => {
      groups.push(group);
      return {
        affected_items: [{ id: '003', name: 'OB-Test' }],
        total_affected_items: 1,
      };
    },
    search: valid,
  });
  const ids = await api.getStationAgentIds('ob-station');
  assert.deepEqual(groups, ['ob-station']);
  assert.equal(ids.join(','), '003');
  await api.getStationSecurity('threats', ids, 24);
  const filter = calls[0][2].body.query.bool.filter[0];
  assert.equal(JSON.stringify(filter), '{"terms":{"agent.id":["003"]}}');
});

test('office risk summary returns complete affected IDs rather than only the visible findings', async () => {
  const response = valid();
  response.data.aggregations.devices.buckets = [{ key: '001' }, { key: '002' }];
  const { api } = load({ search: () => response });
  const result = await api.getStationSecurity('threats', ['001', '002'], 24);
  assert.equal(result.affectedDeviceIds.join(','), '001,002');
  assert.equal(result.items.length, 1);
});

test('office finding categories keep device and manager scope and count only failed configuration alerts', async () => {
  for (const category of [
    'configuration',
    'authentication',
    'integrity',
    'usb',
  ]) {
    const { api, calls } = load({ search: valid });
    await api.getStationSecurity('threats', ['001'], 24, 0, 0, category);
    const filters = JSON.stringify(calls[0][2].body.query.bool.filter);
    assert.match(filters, /"agent.id":\["001"\]/);
    assert.match(filters, /"manager.name":"manager-a"/);
    assert.match(filters, /now-24h/);
    assert.match(filters, /"rule.groups"/);
    if (category === 'configuration') {
      assert.match(filters, /"data.sca.check.result":"failed"/);
    }
  }
});
