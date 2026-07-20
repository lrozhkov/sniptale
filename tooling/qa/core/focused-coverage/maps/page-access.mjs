import { POPUP_PAGE_ACCESS_OWNER_MAPPINGS } from './popup-page-access.mjs';

const SETTINGS_PERMISSION_REQUESTS_ROOT =
  'apps/extension/src/settings/sections/permissions/useSettingsPermissions/requests';

export const PAGE_ACCESS_OWNER_MAPPINGS = [
  {
    owner: 'background-page-access-lifecycle',
    productionFile: 'apps/extension/src/background/runtime/page-access/lifecycle.ts',
    exclusive: true,
    reason: 'Page-access lifecycle cleanup is covered by the focused lifecycle suite.',
    testFiles: ['apps/extension/src/background/runtime/page-access/lifecycle.test.ts'],
  },
  {
    owner: 'background-page-access-route',
    productionFile: 'apps/extension/src/background/runtime/page-access/route.ts',
    exclusive: true,
    reason: 'PAGE_ACCESS route dispatch is covered by the focused route suite.',
    testFiles: ['apps/extension/src/background/runtime/page-access/route.test.ts'],
  },
  {
    owner: 'background-page-access-registration',
    productionFile: 'apps/extension/src/background/runtime/page-access/registration.ts',
    exclusive: true,
    reason: 'Dynamic content runtime registration is covered by site/all-sites grant suites.',
    testFiles: [
      'apps/extension/src/background/runtime/page-access/registration.test.ts',
      'apps/extension/src/background/runtime/page-access/service.all-sites-grants.test.ts',
      'apps/extension/src/background/runtime/page-access/service.site-grants.test.ts',
    ],
  },
  {
    owner: 'background-page-access-service',
    productionFile: 'apps/extension/src/background/runtime/page-access/service.ts',
    exclusive: true,
    reason: 'Page-access activation, grants, and rollback are covered by focused service suites.',
    testFiles: [
      'apps/extension/src/background/runtime/page-access/service.all-sites-grants.test.ts',
      'apps/extension/src/background/runtime/page-access/service.site-grants.test.ts',
      'apps/extension/src/background/runtime/page-access/service.test.ts',
    ],
  },
  {
    owner: 'background-page-access-status',
    productionFile: 'apps/extension/src/background/runtime/page-access/status.ts',
    exclusive: true,
    reason: 'Page-access status resolution is covered through route and service suites.',
    testFiles: [
      'apps/extension/src/background/runtime/page-access/route.test.ts',
      'apps/extension/src/background/runtime/page-access/service.test.ts',
    ],
  },
  {
    owner: 'background-page-access-tab-activation',
    productionFile: 'apps/extension/src/background/runtime/page-access/tab-activation.ts',
    exclusive: true,
    reason: 'Temporary tab activation storage is covered by service and lifecycle suites.',
    testFiles: [
      'apps/extension/src/background/runtime/page-access/lifecycle.test.ts',
      'apps/extension/src/background/runtime/page-access/service.test.ts',
    ],
  },
  {
    owner: 'background-page-access-target',
    productionFile: 'apps/extension/src/background/runtime/page-access/target.ts',
    exclusive: true,
    reason: 'Page-access target parsing is covered by the focused target suite.',
    testFiles: ['apps/extension/src/background/runtime/page-access/target.test.ts'],
  },
  {
    owner: 'shared-page-access-runtime-contract',
    productionFile:
      'apps/extension/src/contracts/messaging/contracts/runtime/actions/page-access.ts',
    exclusive: true,
    reason:
      'PAGE_ACCESS request/response parser contracts are covered by runtime action core tests.',
    testFiles: ['apps/extension/src/contracts/messaging/contracts/runtime/actions/core.test.ts'],
  },
  ...POPUP_PAGE_ACCESS_OWNER_MAPPINGS,
  {
    owner: 'settings-page-access-permission-disclosures',
    productionFile:
      'apps/extension/src/settings/sections/permissions/permissions-lib/required-disclosures.ts',
    exclusive: true,
    reason: 'Permission disclosure rows are covered by their focused disclosure suite.',
    testFiles: [
      'apps/extension/src/settings/sections/permissions/permissions-lib/required-disclosures.test.ts',
    ],
  },
  {
    owner: 'settings-page-access-permission-types',
    productionFile: 'apps/extension/src/settings/sections/permissions/permissions-lib/types.ts',
    exclusive: true,
    reason: 'Permission library type changes are covered through content/request/runtime suites.',
    testFiles: [
      'apps/extension/src/settings/sections/permissions/permissions-lib/content.test.ts',
      'apps/extension/src/settings/sections/permissions/permissions-lib/request.test.ts',
      'apps/extension/src/settings/sections/permissions/permissions-lib/runtime.test.ts',
    ],
  },
  {
    owner: 'settings-page-access-permission-index',
    productionFile: 'apps/extension/src/settings/sections/permissions/permissions-lib/index.ts',
    exclusive: true,
    reason: 'Permission library facade exports are covered by content/subscription integration.',
    testFiles: [
      'apps/extension/src/settings/sections/permissions/permissions-lib/content-and-subscriptions.test.ts',
    ],
  },
  {
    owner: 'settings-page-access-request-dispatch',
    productionFile: `${SETTINGS_PERMISSION_REQUESTS_ROOT}/dispatch.ts`,
    exclusive: true,
    reason: 'Settings permission request dispatch is covered by its focused dispatch suite.',
    testFiles: [`${SETTINGS_PERMISSION_REQUESTS_ROOT}/dispatch.test.ts`],
  },
  {
    owner: 'settings-page-access-revokes',
    productionFile: `${SETTINGS_PERMISSION_REQUESTS_ROOT}/use-permission-revokes.ts`,
    exclusive: true,
    reason: 'Settings permission revoke behavior is covered by the focused revoke hook suite.',
    testFiles: [`${SETTINGS_PERMISSION_REQUESTS_ROOT}/use-permission-revokes.test.tsx`],
  },
];
