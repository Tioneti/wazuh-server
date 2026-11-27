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

export const ObStation = compose(
  withErrorBoundary,
  withRouteResolvers({ enableMenu, ip, nestedResolve, savedSearch }),
  withGlobalBreadcrumb([{ text: 'OB Station' }]),
  withUserAuthorizationPrompt([
    [
      { action: 'agent:read', resource: 'agent:group:ob-station' },
      { action: 'agent:read', resource: 'agent:id:*' },
    ],
  ]),
)(() => (
  <StationDashboard
    group='ob-station'
    title='OB Station'
    description='Desktops and laptops assigned to the OB Station agent group.'
  />
));
