import React, { useEffect, useState } from 'react';
import {
  EuiBadge,
  EuiBasicTable,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFlexGrid,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiPanel,
  EuiSpacer,
  EuiStat,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { Agent } from '../endpoints-summary/types';
import NavigationService from '../../react-services/navigation-service';
import { DeviceGroup } from './service';
import { getStationSecurity, SecuritySummary } from './security-service';

type Result = { value?: SecuritySummary; failed: boolean };
const categories = [
  { label: 'High / critical vulnerabilities', category: undefined },
  { label: 'Configuration failure alerts', category: 'configuration' as const },
  {
    label: 'Failed authentication alerts',
    category: 'authentication' as const,
  },
  { label: 'File integrity alerts', category: 'integrity' as const },
  { label: 'USB alerts', category: 'usb' as const },
];

export function OfficeOverview({
  agents,
  group,
  title,
  refresh,
}: {
  agents?: Agent[];
  group: DeviceGroup;
  title: string;
  refresh: number;
}) {
  const [results, setResults] = useState<Result[]>();
  const [onlyRisk, setOnlyRisk] = useState(true);
  const [page, setPage] = useState(0);
  const [updated, setUpdated] = useState<Date>();
  useEffect(() => {
    let active = true;
    setResults(undefined);
    setUpdated(undefined);
    if (!agents) {
      return () => {
        active = false;
      };
    }
    const ids = agents.map(agent => agent.id);
    const queries = [
      getStationSecurity('threats', ids, 24, 12),
      ...categories.map((item, index) =>
        getStationSecurity(
          index === 0 ? 'vulnerabilities' : 'threats',
          ids,
          24,
          0,
          0,
          item.category,
        ),
      ),
    ];
    Promise.all(
      queries.map(query =>
        query.then(
          value => ({ value, failed: false }),
          () => ({ failed: true }),
        ),
      ),
    ).then(value => {
      if (active) {
        setResults(value);
        setUpdated(new Date());
      }
    });
    return () => {
      active = false;
    };
  }, [agents, group, refresh]);
  const alerts = new Set(results?.[0]?.value?.affectedDeviceIds || []);
  const vulnerabilities = new Set(results?.[1]?.value?.affectedDeviceIds || []);
  const risky = new Set([...alerts, ...vulnerabilities]);
  const complete = Boolean(results && !results[0].failed && !results[1].failed);
  const online = agents?.filter(agent => agent.status === 'active').length;
  const offline = agents?.filter(
    agent => agent.status === 'disconnected',
  ).length;
  const awaiting = agents?.filter(agent =>
    ['pending', 'never_connected'].includes(agent.status),
  ).length;
  const devices = (agents || []).filter(
    agent => !onlyRisk || risky.has(agent.id),
  );
  const visiblePage = Math.min(
    page,
    Math.max(0, Math.ceil(devices.length / 10) - 1),
  );
  const metrics = [
    {
      label: 'Registered devices',
      value: agents?.length,
      help: 'Devices assigned to this office',
      color: '#006BB4',
    },
    {
      label: 'Online devices',
      value: online,
      help: 'Agent connected to Wazuh',
      color: '#017D73',
    },
    {
      label: 'Offline devices',
      value: offline,
      help: 'Previously connected; now disconnected',
      color: '#BD6A00',
    },
    {
      label: 'High-risk devices',
      value: complete ? risky.size : undefined,
      help: 'Unique devices with priority findings',
      color: '#BD271E',
    },
  ];
  return (
    <>
      <EuiPanel paddingSize='l'>
        <EuiFlexGroup alignItems='center'>
          <EuiFlexItem>
            <EuiTitle size='m'>
              <h2>Office Endpoint Security Centre</h2>
            </EuiTitle>
            <EuiText size='s'>
              <p>{title} · Office devices and security priorities</p>
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiBadge color='hollow'>Wazuh data</EuiBadge>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer />
        <EuiFlexGrid columns={4} gutterSize='m'>
          {metrics.map(metric => (
            <EuiFlexItem key={metric.label}>
              <EuiPanel
                hasShadow={false}
                style={{
                  borderTop: `3px solid ${metric.color}`,
                  height: '100%',
                }}
              >
                <EuiStat
                  title={metric.value ?? '—'}
                  description={metric.label}
                  titleSize='l'
                />
                <EuiSpacer size='s' />
                <EuiText size='xs'>
                  <p>{metric.help}</p>
                </EuiText>
              </EuiPanel>
            </EuiFlexItem>
          ))}
        </EuiFlexGrid>
        <EuiSpacer size='m' />
        <EuiText size='s'>
          <p>
            {awaiting !== undefined
              ? `${awaiting} awaiting first connection or enrollment completion. `
              : ''}
            High risk: a rule level 12+ alert in the last 24 hours or an indexed
            High/Critical vulnerability. Devices are counted once. Offline
            results may be outdated; other devices are not confirmed safe.
            {updated
              ? ` Retrieved ${updated.toLocaleString()}.`
              : ' Loading security summary…'}
          </p>
        </EuiText>
        {results?.some(result => result.failed) && (
          <>
            <EuiSpacer size='s' />
            <EuiCallOut
              color='warning'
              title='Some security sources are unavailable'
            >
              <p>
                Unavailable counts are shown as —. Device risk may be
                incomplete. Check collection and permissions, then refresh.
              </p>
            </EuiCallOut>
          </>
        )}
      </EuiPanel>
      <EuiSpacer />
      <EuiTitle size='s'>
        <h3>Security findings</h3>
      </EuiTitle>
      <EuiSpacer size='s' />
      <EuiFlexGrid columns={3} gutterSize='m'>
        {categories.map((item, index) => (
          <EuiFlexItem key={item.label}>
            <EuiPanel paddingSize='m'>
              <EuiStat
                title={results?.[index + 1]?.value?.findings ?? '—'}
                description={item.label}
                titleSize='m'
              />
              <EuiSpacer size='s' />
              <EuiText size='xs'>
                <p>
                  {index === 0
                    ? 'Latest indexed state · not a scan timestamp'
                    : 'Alert events · last 24 hours'}
                </p>
              </EuiText>
            </EuiPanel>
          </EuiFlexItem>
        ))}
      </EuiFlexGrid>
      <EuiSpacer size='s' />
      <EuiText size='xs'>
        <p>
          Alert counts can include repeated events. Configuration failures use
          failed SCA check alerts; authentication uses failure rule groups; file
          integrity uses syscheck; USB uses the usb rule group. Zero means no
          matching indexed events, and does not confirm collection is enabled.
          Review current configuration checks below.
        </p>
      </EuiText>
      <EuiSpacer />
      <EuiPanel>
        <EuiFlexGroup alignItems='center'>
          <EuiFlexItem>
            <EuiTitle size='s'>
              <h3>Device security status</h3>
            </EuiTitle>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              onClick={() => {
                setOnlyRisk(!onlyRisk);
                setPage(0);
              }}
            >
              {onlyRisk ? 'Show all devices' : 'Show high-risk devices'}
            </EuiButtonEmpty>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiText size='s'>
          <p>
            {onlyRisk
              ? 'Devices with priority findings. Open a device to investigate.'
              : 'All office devices. Connection and risk are shown separately.'}
          </p>
        </EuiText>
        <EuiSpacer size='s' />
        <EuiBasicTable
          items={devices.slice(visiblePage * 10, visiblePage * 10 + 10)}
          loading={!agents || !results}
          noItemsMessage={
            !results
              ? 'Loading security status…'
              : complete
              ? 'No devices match this view.'
              : 'Risk information is incomplete. Show all devices to review connectivity.'
          }
          pagination={{
            pageIndex: visiblePage,
            pageSize: 10,
            totalItemCount: devices.length,
            pageSizeOptions: [10],
          }}
          onChange={({ page: next }) => setPage(next.index)}
          columns={[
            {
              field: 'name',
              name: 'Device',
              render: (name: string, agent: Agent) => (
                <EuiLink
                  onClick={() =>
                    NavigationService.getInstance().navigate(
                      `/agents?tab=welcome&agent=${encodeURIComponent(
                        agent.id,
                      )}`,
                    )
                  }
                >
                  {name}
                </EuiLink>
              ),
            },
            { name: 'Office', render: () => title },
            {
              name: 'Risk',
              render: (agent: Agent) => (
                <EuiBadge color={risky.has(agent.id) ? 'danger' : 'hollow'}>
                  {risky.has(agent.id)
                    ? 'High'
                    : complete
                    ? 'No priority findings'
                    : 'Unknown'}
                </EuiBadge>
              ),
            },
            {
              name: 'Reason for attention',
              render: (agent: Agent) =>
                [
                  alerts.has(agent.id) ? 'Level 12+ alert' : '',
                  vulnerabilities.has(agent.id)
                    ? 'High/Critical vulnerability'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' · ') ||
                (complete
                  ? 'No matching priority findings'
                  : 'Assessment incomplete'),
            },
            {
              field: 'status',
              name: 'Status',
              render: (status: string) => (
                <EuiBadge color={status === 'active' ? 'success' : 'hollow'}>
                  {{
                    active: 'Online',
                    disconnected: 'Offline',
                    pending: 'Pending',
                    ['never_connected']: 'Never connected',
                  }[status] || 'Unknown'}
                </EuiBadge>
              ),
            },
          ]}
        />
      </EuiPanel>
      <EuiSpacer />
    </>
  );
}
