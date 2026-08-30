export const POPUP_PAGE_ACCESS_OWNER_MAPPINGS = [
  {
    allowCrossOwner: true,
    owner: 'popup-export-page-access-routing',
    productionFile: 'apps/extension/src/popup/shell/export/runtime/tab-message-routing.ts',
    exclusive: true,
    reason: 'Popup export tab routing is covered by focused export routing tests.',
    testFiles: ['apps/extension/src/popup/shell/export/runtime/tab-message-routing.test.ts'],
  },
  {
    owner: 'popup-runtime-page-access-hook',
    productionFile: 'apps/extension/src/popup/shell/runtime/page-access.ts',
    exclusive: true,
    reason: 'Popup page-access request and rollback behavior is covered by its hook suite.',
    testFiles: ['apps/extension/src/popup/shell/runtime/page-access.test.tsx'],
  },
  {
    owner: 'popup-runtime-page-access-grants',
    productionFile: 'apps/extension/src/popup/shell/runtime/page-access-grants.ts',
    exclusive: true,
    reason: 'Popup page-access grant helpers are covered by the hook suite.',
    testFiles: ['apps/extension/src/popup/shell/runtime/page-access.test.tsx'],
  },
  {
    owner: 'popup-runtime-page-access-types',
    productionPrefix: 'apps/extension/src/popup/shell/runtime/types',
    exclusive: true,
    reason: 'Popup runtime page-access type projections are covered by consumer tests.',
    testFiles: [
      'apps/extension/src/popup/shell/export/controller.test.tsx',
      'apps/extension/src/popup/shell/home/page-shell/index.page-access.test.tsx',
      'apps/extension/src/popup/recording/video/setup/view-model.test.ts',
    ],
  },
  {
    owner: 'popup-page-access-app-shell',
    productionFile: 'apps/extension/src/popup/shell/app/index.tsx',
    exclusive: true,
    reason: 'Popup shell route composition is covered by the app-shell surface suite.',
    testFiles: ['apps/extension/src/popup/shell/app/index.test.tsx'],
  },
];
