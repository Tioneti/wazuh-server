import React from 'react';
import { compose } from 'redux';
import { StationDashboard } from '../group-dashboard';
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

export const Servers = compose(
  withErrorBoundary,
  withRouteResolvers({ enableMenu, ip, nestedResolve, savedSearch }),
  withGlobalBreadcrumb([{ text: 'Servers' }]),
  withUserAuthorizationPrompt([
    [
      { action: 'agent:read', resource: 'agent:group:servers' },
      { action: 'agent:read', resource: 'agent:id:*' },
    ],
  ]),
)(() => (
  <StationDashboard
    group='servers'
    title='Servers'
    description={
      'Security and monitoring coverage for the servers group. ' +
      'Agent connectivity does not confirm application availability.'
    }
  />
));
