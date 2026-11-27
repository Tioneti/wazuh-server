import React, { useEffect, useState } from 'react';
import {
  EuiBasicTable,
  EuiCallOut,
  EuiLink,
  EuiPanel,
  EuiSelect,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { Agent } from '../endpoints-summary/types';
import NavigationService from '../../react-services/navigation-service';
import {
  assessmentFreshness,
  AssessmentPolicy,
  getDeviceAssessments,
} from './assessment-service';

export function DeviceAssessments({
  ids,
  devices,
  refresh,
}: {
  ids?: string[];
  devices?: Agent[];
  refresh: number;
}) {
  const [selected, setSelected] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const [thresholdHours, setThresholdHours] = useState(24);
  const [result, setResult] = useState<{
    policies: AssessmentPolicy[];
    total: number;
  }>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retrieved, setRetrieved] = useState<Date>();
  const agent = selected && ids?.includes(selected) ? selected : ids?.[0] || '';
  useEffect(() => {
    let active = true;
    setResult(undefined);
    setRetrieved(undefined);
    setError(false);
    setLoading(Boolean(agent));
    if (agent && ids) {
      getDeviceAssessments(agent, ids, pageIndex * 10)
        .then(value => {
          if (active) {
            if (pageIndex > 0 && pageIndex * 10 >= value.total) {
              setPageIndex(0);
              return;
            }
            setResult(value);
            setRetrieved(new Date());
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
    }
    return () => {
      active = false;
    };
  }, [agent, ids, refresh, pageIndex]);
  const numberOrUnknown = (value?: number) =>
    Number.isFinite(value) ? value : 'Unknown';
  return (
    <EuiPanel>
      <EuiTitle size='s'>
        <h3>Security configuration assessment</h3>
      </EuiTitle>
      <EuiText size='s'>
        <p>
          Review policy results for one permitted device at a time. Failed
          checks indicate configuration weaknesses. Scan age is marked against a
          selected review threshold; it is not a compliance verdict.
        </p>
      </EuiText>
      <EuiSpacer size='s' />
      <EuiSelect
        aria-label='Device for configuration assessment'
        value={agent}
        disabled={!ids?.length}
        options={
          ids?.length
            ? ids.map(id => ({
                value: id,
                text: `${
                  devices?.find(device => device.id === id)?.name || 'Agent'
                } (${id})`,
              }))
            : [{ value: '', text: 'No device available' }]
        }
        onChange={event => {
          setSelected(event.target.value);
          setPageIndex(0);
        }}
      />
      <EuiSpacer size='s' />
      <EuiSelect
        aria-label='Assessment freshness threshold'
        value={String(thresholdHours)}
        options={[24, 48, 168].map(hours => ({
          value: String(hours),
          text: `Review scans older than ${hours} hours`,
        }))}
        onChange={event => setThresholdHours(Number(event.target.value))}
      />
      <EuiSpacer size='s' />
      {error && (
        <EuiCallOut
          color='warning'
          title='Configuration assessment unavailable'
        >
          <p>
            Check SCA collection and assessment-read permissions. Unknown
            results do not mean the device passed.
          </p>
        </EuiCallOut>
      )}
      <EuiBasicTable
        pagination={{
          pageIndex,
          pageSize: 10,
          totalItemCount: result?.total || 0,
          pageSizeOptions: [10],
        }}
        onChange={({ page }) => setPageIndex(page.index)}
        items={result?.policies || []}
        loading={loading || !ids}
        noItemsMessage={
          error
            ? 'Assessment data unavailable'
            : !ids
            ? 'Loading device scope…'
            : loading
            ? 'Loading assessments…'
            : 'No assessment results reported. Security posture is unknown.'
        }
        columns={[
          {
            field: 'name',
            name: 'Policy',
            render: (value: string) => (
              <EuiLink
                onClick={() =>
                  NavigationService.getInstance().navigate(
                    `/agents?agent=${encodeURIComponent(
                      agent,
                    )}&tab=sca&tabView=inventory`,
                  )
                }
              >
                {value || 'Unnamed policy'}
              </EuiLink>
            ),
          },
          { field: 'pass', name: 'Passed', render: numberOrUnknown },
          { field: 'fail', name: 'Failed', render: numberOrUnknown },
          { field: 'invalid', name: 'Not applicable', render: numberOrUnknown },
          {
            field: 'score',
            name: 'Score',
            render: (value?: number) =>
              Number.isFinite(value) ? `${value}%` : 'Unknown',
          },
          {
            field: 'end_scan',
            name: 'Last completed scan',
            render: (value: string) =>
              value && Number.isFinite(Date.parse(value))
                ? new Date(value).toLocaleString()
                : 'Unknown',
          },
          {
            name: 'Scan age',
            render: (policy: AssessmentPolicy) =>
              assessmentFreshness(policy.end_scan, Date.now(), thresholdHours),
          },
        ]}
      />
      <EuiText size='xs'>
        <p>
          Showing 10 policies per page for the selected device.
          {result ? ` Reported policies: ${result.total}.` : ''}
          {retrieved
            ? ` Retrieved: ${retrieved.toLocaleString()}. Retrieval time is not scan time.`
            : ''}
        </p>
      </EuiText>
    </EuiPanel>
  );
}
