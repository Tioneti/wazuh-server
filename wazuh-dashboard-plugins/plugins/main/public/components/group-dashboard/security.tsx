import React, { useEffect, useMemo, useState } from 'react';
import {
  EuiBasicTable,
  EuiButton,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiPanel,
  EuiSelect,
  EuiSpacer,
  EuiStat,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { OfficeOverview } from './office-overview';
import { DeviceAssessments } from './assessments';
import { Agent } from '../endpoints-summary/types';
import { DeviceGroup } from './service';
import NavigationService from '../../react-services/navigation-service';
import {
  getStationMembers,
  getStationSecurity,
  SecurityFinding,
  SecuritySummary,
} from './security-service';

function FindingPanel({
  kind,
  ids,
  hours,
  refresh,
  title,
  minimumLevel,
}: {
  title: string;
  minimumLevel: number;
  kind: 'threats' | 'vulnerabilities';
  ids?: string[];
  hours: number;
  refresh: number;
}) {
  const [data, setData] = useState<SecuritySummary>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [updated, setUpdated] = useState<Date>();
  const [pageIndex, setPageIndex] = useState(0);
  const threats = kind === 'threats';
  useEffect(() => {
    let active = true;
    setLoading(true);
    setData(undefined);
    setError(false);
    setUpdated(undefined);
    if (!ids) {
      return () => {
        active = false;
      };
    }
    getStationSecurity(kind, ids, hours, minimumLevel, pageIndex * 10)
      .then(result => {
        if (active) {
          if (pageIndex > 0 && pageIndex * 10 >= result.findings) {
            setPageIndex(0);
            return;
          }
          setData(result);
          setUpdated(new Date());
        }
      })
      .catch(() => {
        if (active) {
          setError(true);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [kind, ids, hours, refresh, minimumLevel, pageIndex]);
  return (
    <EuiPanel>
      <EuiTitle size='s'>
        <h3>
          {threats
            ? 'Threats requiring attention'
            : 'Critical and high vulnerabilities'}
        </h3>
      </EuiTitle>
      <EuiText size='s'>
        <p>
          {threats
            ? `Alerts with rule level ${minimumLevel} or higher in the last ${hours} hours. ` +
              'Detections require investigation.'
            : 'Latest indexed vulnerability state, independent of the alert time range. ' +
              'Findings may be outdated for disconnected devices.'}
        </p>
      </EuiText>
      {error && (
        <EuiCallOut color='warning' title='Security data unavailable'>
          <p>
            Check index availability, collection settings, and your search
            permissions. Use Refresh security to retry. Missing data does not
            mean no findings.
          </p>
        </EuiCallOut>
      )}
      <EuiSpacer size='s' />
      <EuiFlexGroup>
        <EuiFlexItem>
          <EuiStat
            title={data?.findings ?? '—'}
            description={threats ? 'Alert events' : 'Vulnerability findings'}
            isLoading={loading}
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiStat
            title={data?.affectedDevices ?? '—'}
            description='Affected devices'
            isLoading={loading}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer />
      <EuiBasicTable
        pagination={{
          pageIndex,
          pageSize: 10,
          totalItemCount: Math.min(data?.findings || 0, 10000),
          pageSizeOptions: [10],
        }}
        onChange={({ page }) => setPageIndex(page.index)}
        items={data?.items || []}
        loading={loading}
        noItemsMessage={
          error
            ? 'Unavailable'
            : loading
            ? 'Loading security findings…'
            : `No matching findings for the permitted ${title} devices.`
        }
        columns={[
          {
            field: 'device',
            name: 'Device',
            render: (name: string, item: SecurityFinding) => (
              <EuiLink
                onClick={() =>
                  NavigationService.getInstance().navigate(
                    `/agents?agent=${encodeURIComponent(item.agentId)}&tab=${
                      threats ? 'general' : 'vuls'
                    }&tabView=${threats ? 'events' : 'inventory'}`,
                  )
                }
              >
                {name}
              </EuiLink>
            ),
          },
          { field: 'issue', name: 'Finding' },
          { field: 'severity', name: 'Severity' },
          ...(!threats
            ? [
                {
                  field: 'package',
                  name: 'Software',
                  render: (value: string) => value || 'Not reported',
                },
                {
                  field: 'version',
                  name: 'Installed version',
                  render: (value: string) => value || 'Unknown',
                },
                {
                  field: 'score',
                  name: 'CVSS base',
                  render: (value?: number) =>
                    Number.isFinite(value) ? value : 'Unknown',
                },
                {
                  field: 'condition',
                  name: 'Detection condition',
                  render: (value: string) => value || 'Not reported',
                },
                {
                  field: 'reference',
                  name: 'Advisory',
                  render: (value?: string) =>
                    value ? (
                      <EuiLink
                        href={value}
                        target='_blank'
                        rel='noopener noreferrer'
                      >
                        Review advisory
                      </EuiLink>
                    ) : (
                      'Not reported'
                    ),
                },
              ]
            : []),
          {
            field: 'detected',
            name: threats ? 'Detected' : 'First detected',
            render: (value: string) => {
              const date = new Date(value);
              return Number.isNaN(date.getTime())
                ? 'Not reported'
                : date.toLocaleString();
            },
          },
        ]}
      />
      <EuiText size='xs'>
        <p>
          10 findings per page; browsing is limited to the first 10,000 results.
          Click a device to investigate its findings.
          {updated ? ` Retrieved: ${updated.toLocaleString()}.` : ''}
          {' Retrieval time is not a device scan time. ' +
            'Vulnerability assessment freshness is unknown without a collection timestamp. ' +
            'Review the advisory and vendor guidance before patching.'}
        </p>
      </EuiText>
    </EuiPanel>
  );
}

export function StationSecurity({
  refresh,
  group = 'pso-station',
  title = 'PSO Station',
}: {
  refresh: number;
  group?: DeviceGroup;
  title?: string;
}) {
  const [agents, setAgents] = useState<Agent[]>();
  const ids = useMemo(() => agents?.map(agent => agent.id), [agents]);
  const [error, setError] = useState(false);
  const [hours, setHours] = useState(24);
  const [minimumLevel, setMinimumLevel] = useState(12);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setAgents(undefined);
    setError(false);
    getStationMembers(group)
      .then(value => {
        if (active) {
          setAgents(value);
        }
      })
      .catch(() => {
        if (active) {
          setError(true);
        }
      });
    return () => {
      active = false;
    };
  }, [refresh, retry, group]);
  return (
    <>
      <OfficeOverview
        agents={agents}
        group={group}
        title={title}
        refresh={refresh + retry}
      />
      <EuiFlexGroup alignItems='center'>
        <EuiFlexItem>
          <EuiTitle size='m'>
            <h2>Security monitoring</h2>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiSelect
            aria-label='Threat alert period'
            value={String(hours)}
            options={[
              { value: '24', text: 'Alerts: last 24 hours' },
              { value: '168', text: 'Alerts: last 7 days' },
            ]}
            onChange={event => setHours(Number(event.target.value))}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiSelect
            aria-label='Minimum alert level'
            value={String(minimumLevel)}
            options={[
              { value: '12', text: 'Rule level 12+' },
              { value: '7', text: 'Rule level 7+' },
              { value: '0', text: 'All indexed alerts' },
            ]}
            onChange={event => setMinimumLevel(Number(event.target.value))}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton
            iconType='refresh'
            onClick={() => setRetry(value => value + 1)}
          >
            Refresh security
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer />
      {agents?.some(agent => agent.status !== 'active') && (
        <>
          <EuiCallOut color='warning' title='Some devices are not connected'>
            <p>
              Their recorded security and assessment results may be outdated.
              Check each device’s last seen time.
            </p>
          </EuiCallOut>
          <EuiSpacer />
        </>
      )}
      {error ? (
        <EuiCallOut
          color='warning'
          title={`${title} security scope unavailable`}
        >
          <p>
            Unable to retrieve group membership. Security searches were not run.
            Refresh security to retry.
          </p>
        </EuiCallOut>
      ) : (
        <>
          <FindingPanel
            title={title}
            minimumLevel={minimumLevel}
            kind='threats'
            ids={ids}
            hours={hours}
            refresh={refresh + retry}
          />
          <EuiSpacer />
          <FindingPanel
            title={title}
            minimumLevel={minimumLevel}
            kind='vulnerabilities'
            ids={ids}
            hours={hours}
            refresh={refresh + retry}
          />
          <EuiSpacer />
          <DeviceAssessments
            ids={ids}
            devices={agents}
            refresh={refresh + retry}
          />
        </>
      )}
      <EuiSpacer />
    </>
  );
}
