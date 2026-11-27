import { compose } from 'redux';
import { StationDashboard } from '../group-dashboard';
import { PSO_GROUP } from '../group-dashboard/service';
import {
  withErrorBoundary,
  withGlobalBreadcrumb,
  withRouteResolvers,
  withUserAuthorizationPrompt,
} from '../common/hocs';
import {
  enableMenu,
  ip,
  nestedResolve,
  savedSearch,
} from '../../services/resolves';

export const PsoStation = compose(
  withErrorBoundary,
  withRouteResolvers({ enableMenu, ip, nestedResolve, savedSearch }),
  withGlobalBreadcrumb([{ text: 'PSO Station' }]),
  withUserAuthorizationPrompt([
    [
      { action: 'agent:read', resource: `agent:group:${PSO_GROUP}` },
      { action: 'agent:read', resource: 'agent:id:*' },
    ],
  ]),
)(StationDashboard);
