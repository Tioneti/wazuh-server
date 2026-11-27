/* eslint-disable camelcase -- OpenSearch request fields use their API names. */
import { GenericRequest } from '../../react-services/generic-request';
import { AppState } from '../../react-services/app-state';
import { WazuhConfig } from '../../react-services/wazuh-config';
import { WAZUH_VULNERABILITIES_PATTERN } from '../../../common/constants';
import { DeviceGroup, getStationAgents } from './service';
import { Agent } from '../endpoints-summary/types';

export type SecurityFinding = {
  id: string;
  agentId: string;
  device: string;
  issue: string;
  severity: string;
  detected: string;
  package?: string;
  version?: string;
  score?: number;
  reference?: string;
  condition?: string;
};
export type SecuritySummary = {
  findings: number;
  affectedDevices: number;
  affectedDeviceIds?: string[];
  items: SecurityFinding[];
};

export function safeReference(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

// Resolve membership from the manager, rather than relying on optional event group fields.
export async function getStationMembers(
  group: DeviceGroup = 'pso-station',
): Promise<Agent[]> {
  const agents = new Map<string, Agent>();
  let offset = 0;
  while (offset < 10000) {
    // Each page depends on the previous response.
    // eslint-disable-next-line no-await-in-loop
    const page = await getStationAgents({ offset, limit: 500 }, group);
    page.affected_items.forEach(agent => agents.set(agent.id, agent));
    offset += page.affected_items.length;
    if (offset >= page.total_affected_items) {
      return [...agents.values()];
    }
    if (!page.affected_items.length || offset >= 10000) {
      throw new Error('Unable to resolve complete device group membership.');
    }
  }
  throw new Error('Device group exceeds the supported membership limit.');
}

export async function getStationAgentIds(
  group: DeviceGroup = 'pso-station',
): Promise<string[]> {
  return (await getStationMembers(group)).map(agent => agent.id);
}

export async function getStationSecurity(
  kind: 'threats' | 'vulnerabilities',
  ids: string[],
  hours: number,
  minimumLevel = 12,
  offset = 0,
  category:
    | 'configuration'
    | 'authentication'
    | 'integrity'
    | 'usb'
    | undefined = undefined,
): Promise<SecuritySummary> {
  if (!Number.isInteger(offset) || offset < 0 || offset > 9990) {
    throw new Error('Security result page is outside the supported range.');
  }
  if (!ids.length) {
    return { findings: 0, affectedDevices: 0, items: [] };
  }
  const cluster = AppState.getClusterInfo();
  const clustered = cluster.status === 'enabled';
  const manager = clustered ? cluster.cluster : cluster.manager;
  if (!manager) {
    throw new Error('The selected Wazuh manager could not be identified.');
  }
  const threats = kind === 'threats';
  const pattern = new WazuhConfig().getConfig()?.pattern;
  if (threats && !pattern) {
    throw new Error('The alert index pattern is unavailable.');
  }
  const scopeField = threats
    ? clustered
      ? 'cluster.name'
      : 'manager.name'
    : 'wazuh.cluster.name';
  const response = await GenericRequest.request('POST', '/elastic/alerts', {
    index: threats ? pattern : WAZUH_VULNERABILITIES_PATTERN,
    allow_no_indices: false,
    ignore_unavailable: false,
    body: {
      size: 10,
      from: offset,
      track_total_hits: true,
      query: {
        bool: {
          filter: [
            { terms: { 'agent.id': ids } },
            { term: { [scopeField]: manager } },
            ...(threats
              ? [
                  {
                    range: { timestamp: { gte: `now-${hours}h`, lte: 'now' } },
                  },
                  { range: { 'rule.level': { gte: minimumLevel } } },
                  ...(category
                    ? [
                        {
                          terms: {
                            'rule.groups': {
                              configuration: ['sca'],
                              authentication: [
                                'authentication_failed',
                                'authentication_failures',
                                'win_authentication_failed',
                              ],
                              integrity: ['syscheck'],
                              usb: ['usb'],
                            }[category],
                          },
                        },
                        ...(category === 'configuration'
                          ? [{ term: { 'data.sca.check.result': 'failed' } }]
                          : []),
                      ]
                    : []),
                ]
              : [
                  { terms: { 'vulnerability.severity': ['Critical', 'High'] } },
                ]),
          ],
        },
      },
      sort: [
        {
          [threats ? 'timestamp' : 'vulnerability.detected_at']: {
            order: 'desc',
            unmapped_type: 'date',
          },
        },
      ],
      aggs: { devices: { terms: { field: 'agent.id', size: ids.length } } },
    },
  });
  const data = response?.data;
  const total = data?.hits?.total;
  if (
    data?.timed_out ||
    data?._shards?.failed ||
    !Array.isArray(data?.hits?.hits) ||
    !Array.isArray(data?.aggregations?.devices?.buckets) ||
    typeof total?.value !== 'number' ||
    total.relation !== 'eq'
  ) {
    throw new Error('Incomplete security search results.');
  }
  return {
    findings: total.value,
    affectedDevices: data.aggregations.devices.buckets.length,
    affectedDeviceIds: data.aggregations.devices.buckets.map(bucket =>
      String(bucket.key),
    ),
    items: data.hits.hits.map(hit => {
      const source = hit._source;
      return {
        id: hit._id,
        agentId: source.agent.id,
        device: source.agent.name || source.agent.id,
        issue: threats
          ? source.rule?.description || 'Security alert'
          : source.vulnerability?.id || 'Vulnerability',
        severity: threats
          ? `Level ${source.rule?.level}`
          : source.vulnerability?.severity || 'Unknown',
        detected: threats
          ? source.timestamp
          : source.vulnerability?.detected_at,
        package: source.package?.name,
        version: source.package?.version,
        score: source.vulnerability?.score?.base,
        reference: safeReference(source.vulnerability?.reference),
        condition: source.vulnerability?.scanner?.condition,
      };
    }),
  };
}
