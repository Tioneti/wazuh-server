import { WzRequest } from '../../react-services/wz-request';

export type AssessmentPolicy = {
  policy_id: string;
  name: string;
  pass?: number;
  fail?: number;
  invalid?: number;
  score?: number;
  end_scan?: string;
};

export function assessmentFreshness(
  value?: string,
  now = Date.now(),
  thresholdHours = 24,
): string {
  const timestamp = value ? Date.parse(value) : NaN;
  if (!Number.isFinite(timestamp) || timestamp > now) {
    return 'Unknown';
  }
  return now - timestamp > thresholdHours * 60 * 60 * 1000
    ? `Older than ${thresholdHours} hours`
    : `Within ${thresholdHours} hours`;
}

export async function getDeviceAssessments(
  agentId: string,
  permittedIds: string[],
  offset = 0,
) {
  if (!permittedIds.includes(agentId)) {
    throw new Error('Device is outside the current dashboard scope.');
  }
  const response = await WzRequest.apiReq(
    'GET',
    `/sca/${encodeURIComponent(agentId)}`,
    {
      params: { limit: 10, offset, sort: '-end_scan' },
    },
  );
  const data = response?.data?.data;
  if (
    !Array.isArray(data?.affected_items) ||
    !Number.isInteger(data?.total_affected_items) ||
    data.total_affected_items < 0 ||
    data.failed_items?.length
  ) {
    throw new Error('Configuration assessment results are unavailable.');
  }
  return {
    policies: data.affected_items as AssessmentPolicy[],
    total: data.total_affected_items as number,
  };
}
