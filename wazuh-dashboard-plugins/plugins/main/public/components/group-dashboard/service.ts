import { WzRequest } from '../../react-services/wz-request';
import { Agent } from '../endpoints-summary/types';

export type DeviceGroup = 'pso-station' | 'ob-station' | 'servers';

export const PSO_GROUP = 'pso-station';
export const STATION_STATUSES = [
  { value: 'active', label: 'Connected' },
  { value: 'disconnected', label: 'Disconnected' },
  { value: 'never_connected', label: 'Never connected' },
  { value: 'pending', label: 'Pending connection' },
];

// Group is always a separate API parameter: user filters cannot remove this scope.
export async function getStationAgents(
  params: {
    offset?: number;
    limit?: number;
    search?: string;
    status?: string;
  },
  group: DeviceGroup = PSO_GROUP,
) {
  const response = await WzRequest.apiReq('GET', '/agents', {
    params: {
      ...params,
      group,
      q: 'id!=000',
      sort: '+name',
      select: 'id,name,os.name,os.version,status,lastKeepAlive,version',
    },
  });
  const data = response?.data?.data;
  if (
    !Array.isArray(data?.affected_items) ||
    !Number.isInteger(data?.total_affected_items) ||
    data.total_affected_items < 0 ||
    data.failed_items?.length
  ) {
    throw new Error(`Could not retrieve a complete device list for ${group}.`);
  }
  return data as { affected_items: Agent[]; total_affected_items: number };
}
