import React, { useEffect, useRef, useState } from 'react';
import {
  EuiBasicTable,
  EuiButton,
  EuiCallOut,
  EuiEmptyPrompt,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiPage,
  EuiPageBody,
  EuiPanel,
  EuiSelect,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import NavigationService from '../../react-services/navigation-service';
import { Agent } from '../endpoints-summary/types';
import { StationSecurity } from './security';
import {
  DeviceGroup,
  getStationAgents,
  PSO_GROUP,
  STATION_STATUSES,
} from './service';

export function StationDashboard({
  group = PSO_GROUP,
  title = 'PSO Station',
  description = 'Desktops and laptops assigned to the PSO Station agent group.',
}: {
  group?: DeviceGroup;
  title?: string;
  description?: string;
}) {
  const [page, setPage] = useState({ index: 0, size: 10 });
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [refreshSeconds, setRefreshSeconds] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [result, setResult] = useState<{
    items: Agent[];
    total: number;
    counts: number[];
    updated: Date;
  }>();
  const request = useRef(0);

  useEffect(() => {
    const current = ++request.current;
    setLoading(true);
    setError(false);
    // Commit table and counters together, so partial failures never appear as zeros.
    Promise.all([
      getStationAgents(
        {
          offset: page.index * page.size,
          limit: page.size,
          ...(search ? { search } : {}),
          ...(status ? { status } : {}),
        },
        group,
      ),
      ...['', ...STATION_STATUSES.map(item => item.value)].map(value =>
        getStationAgents(
          { limit: 1, ...(value ? { status: value } : {}) },
          group,
        ),
      ),
    ])
      .then(([devices, ...counts]) => {
        if (current !== request.current) {
          return;
        }
        if (
          page.index > 0 &&
          page.index * page.size >= devices.total_affected_items
        ) {
          setPage(previous => ({ ...previous, index: 0 }));
          return;
        }
        setResult({
          items: devices.affected_items,
          total: devices.total_affected_items,
          counts: counts.map(item => item.total_affected_items),
          updated: new Date(),
        });
      })
      .catch(() => {
        if (current === request.current) {
          setError(true);
        }
      })
      .finally(() => {
        if (current === request.current) {
          setLoading(false);
        }
      });
    return () => {
      request.current++;
    };
  }, [page.index, page.size, search, status, refresh, group]);

  useEffect(() => {
    if (!refreshSeconds || loading) {
      return;
    }
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        setRefresh(value => value + 1);
      }
    }, refreshSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [refreshSeconds, loading]);

  const applyStatus = (value: string) => {
    setStatus(value);
    setPage(previous => ({ ...previous, index: 0 }));
  };

  return (
    <EuiPage paddingSize='m'>
      <EuiPageBody>
        <EuiFlexGroup alignItems='center'>
          <EuiFlexItem>
            <EuiTitle>
              <h1>{title}</h1>
            </EuiTitle>
            <EuiText size='s'>
              <p>{description}</p>
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiSelect
              aria-label='Automatic dashboard refresh'
              value={String(refreshSeconds)}
              options={[
                { value: '0', text: 'Auto-refresh: off' },
                { value: '60', text: 'Refresh every minute' },
                { value: '300', text: 'Refresh every 5 minutes' },
              ]}
              onChange={event => setRefreshSeconds(Number(event.target.value))}
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton
              iconType='refresh'
              isLoading={loading}
              onClick={() => setRefresh(value => value + 1)}
            >
              Refresh
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer />
        {error && (
          <>
            <EuiCallOut
              color='danger'
              title={`Unable to load ${title} devices`}
            >
              <p>
                Check your Wazuh connection, group configuration, and
                permissions, then refresh.
                {result
                  ? ' Previously retrieved data is stale and remains visible below.'
                  : ' Device counts are unavailable.'}
              </p>
            </EuiCallOut>
            <EuiSpacer />
          </>
        )}
        <StationSecurity refresh={refresh} group={group} title={title} />
        <EuiTitle size='m'>
          <h2>Device connectivity</h2>
        </EuiTitle>
        <EuiSpacer />
        <EuiText size='s'>
          <p>
            {result
              ? `Last successful refresh: ${result.updated.toLocaleString()}. `
              : ''}
            Counts cover permitted devices in this group. Connection status does
            not indicate security health.
          </p>
        </EuiText>
        <EuiSpacer />
        <EuiFlexGroup>
          <EuiFlexItem>
            <EuiFieldSearch
              aria-label={`Search ${title} devices`}
              placeholder='Search devices'
              value={draft}
              onChange={event => setDraft(event.target.value)}
              onSearch={value => {
                setSearch(value.trim());
                setPage(previous => ({ ...previous, index: 0 }));
              }}
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiSelect
              aria-label='Connection status'
              value={status}
              options={[
                { value: '', text: 'All connection statuses' },
                ...STATION_STATUSES.map(item => ({
                  value: item.value,
                  text: item.label,
                })),
              ]}
              onChange={event => applyStatus(event.target.value)}
            />
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer />
        <EuiPanel>
          <EuiBasicTable
            items={result?.items || []}
            loading={loading}
            noItemsMessage={
              error
                ? 'Device data is unavailable. Refresh to retry.'
                : loading
                ? 'Loading devices…'
                : `No matching ${title} devices.`
            }
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
              {
                field: 'os.name',
                name: 'Operating system',
                render: (value: string) => value || 'Unknown',
              },
              {
                field: 'status',
                name: 'Connection',
                render: (value: string) =>
                  STATION_STATUSES.find(item => item.value === value)?.label ||
                  'Unknown',
              },
              {
                field: 'lastKeepAlive',
                name: 'Last seen',
                render: (value: string) => {
                  const date = value ? new Date(value) : undefined;
                  return date && !Number.isNaN(date.getTime())
                    ? date.toLocaleString()
                    : 'Not reported';
                },
              },
              {
                field: 'version',
                name: 'Agent version',
                render: (value: string) => value || 'Unknown',
              },
            ]}
            pagination={{
              pageIndex: page.index,
              pageSize: page.size,
              totalItemCount: result?.total || 0,
              pageSizeOptions: [10, 25, 50],
            }}
            onChange={({ page: next }) =>
              setPage({ index: next.index, size: next.size })
            }
          />
        </EuiPanel>
        {!loading && !error && result?.counts[0] === 0 && (
          <EuiEmptyPrompt
            title={<h2>No monitored {title} devices</h2>}
            body={
              <p>
                Ask an administrator to create the {group} agent group if
                needed, enroll your devices, and assign them to this group. Then
                refresh this page. Devices outside this group are excluded.
              </p>
            }
          />
        )}
      </EuiPageBody>
    </EuiPage>
  );
}
