import { PRIVACY_ERASURE_RUNTIME_OWNER_MAPPINGS } from './privacy-erasure-runtime.mjs';
import { PRIVACY_ERASURE_VIDEO_PREVIEW_OWNER_MAPPINGS } from './privacy-erasure-video-preview.mjs';

const SETTINGS_ROOT = 'apps/extension/src/settings';
const SETTINGS_PRIVACY_TEST = `${SETTINGS_ROOT}/sections/privacy/index.test.tsx`;
const SETTINGS_SECTION_TEST = `${SETTINGS_ROOT}/shell/page/sections.test.tsx`;
const MESSAGE_TYPES_CONTRACT_TEST =
  'packages/runtime-contracts/src/messaging/message-types/index.test.ts';
const APP_MESSAGING_ROOT = 'apps/extension/src/contracts/messaging';
const PERSISTENCE_INFRA_ROOT = 'apps/extension/src/composition/persistence/infrastructure';
const BACKGROUND_ROOT = 'apps/extension/src/background';
const DIAGNOSTICS_ROOT = `${BACKGROUND_ROOT}/diagnostics`;
const LOCAL_DATA_ERASURE_CONTRACT_OWNER = {
  allowCrossOwner: true,
  owner: 'local-data-erasure-contract-owner',
  testFiles: [MESSAGE_TYPES_CONTRACT_TEST],
};

export const PRIVACY_ERASURE_OWNER_MAPPINGS = [
  ...PRIVACY_ERASURE_VIDEO_PREVIEW_OWNER_MAPPINGS,
  {
    owner: 'local-data-erasure-persistent-mutation-barrier-owner',
    productionFile: `${PERSISTENCE_INFRA_ROOT}/mutation-barrier.ts`,
    reason: 'A live cross-context Web Lock drains shared mutations before exclusive erasure.',
    testFiles: [
      `${PERSISTENCE_INFRA_ROOT}/mutation-barrier.test.ts`,
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/mutation-inventory.test.ts',
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/mutation.test.ts',
    ],
  },
  {
    owner: 'local-data-erasure-indexed-db-mutation-owner',
    productionFile: `${PERSISTENCE_INFRA_ROOT}/indexed-db/mutation.ts`,
    reason: 'IndexedDB mutation admission remains held through each read-write operation.',
    testFiles: [
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/core.test.ts',
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/mutation-inventory.test.ts',
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/mutation.test.ts',
    ],
  },
  {
    allowCrossOwner: true,
    owner: 'local-data-erasure-browser-storage-area-adapter-owner',
    productionFile: `${PERSISTENCE_INFRA_ROOT}/browser-storage/area-adapter.ts`,
    reason: 'The canonical storage adapter gates normal writes and exposes no erasure bypass.',
    testFiles: [
      'apps/extension/src/composition/persistence/infrastructure/browser-storage.test.ts',
      `${PERSISTENCE_INFRA_ROOT}/mutation-barrier.test.ts`,
    ],
  },
  {
    owner: 'local-data-erasure-browser-storage-bypass-owner',
    productionFile: `${PERSISTENCE_INFRA_ROOT}/browser-storage/privacy-erasure.ts`,
    reason: 'Only the erasure participant receives the narrow unguarded storage adapter.',
    testFiles: [`${PERSISTENCE_INFRA_ROOT}/browser-storage/privacy-erasure.test.ts`],
  },
  {
    allowCrossOwner: true,
    owner: 'local-data-erasure-persistence-owner',
    productionPrefix: 'apps/extension/src/composition/persistence/privacy-erasure/',
    reason: 'Storage inventory and erase verification have owner-local tests.',
    testFiles: [
      'apps/extension/src/composition/persistence/privacy-erasure/cleanup.default.test.ts',
      'apps/extension/src/composition/persistence/privacy-erasure/cleanup.test.ts',
      'apps/extension/src/composition/persistence/privacy-erasure/inventory.test.ts',
      'apps/extension/src/composition/persistence/privacy-erasure/page-local-storage.test.ts',
    ],
  },
  {
    allowCrossOwner: true,
    owner: 'local-data-erasure-settings-runtime-owner',
    productionPrefix: `${SETTINGS_ROOT}/runtime/privacy-erasure-client`,
    reason: 'Settings erasure request client has owner-local tests.',
    testFiles: [`${SETTINGS_ROOT}/runtime/privacy-erasure-client/index.test.ts`],
  },
  {
    allowCrossOwner: true,
    owner: 'local-data-erasure-application-owner',
    productionPrefix: 'apps/extension/src/background/application/privacy-erasure/',
    reason: 'Application ordering, retry, aggregation, and policy have focused proof.',
    testFiles: [
      'apps/extension/src/background/application/privacy-erasure/composition.test.ts',
      'apps/extension/src/background/application/privacy-erasure/page-local-storage.test.ts',
      'apps/extension/src/background/application/privacy-erasure/route.test.ts',
      'apps/extension/src/background/application/privacy-erasure/runtime-cleanup.test.ts',
      'apps/extension/src/background/application/privacy-erasure/use-case.native-ingestion.test.ts',
      'apps/extension/src/background/application/privacy-erasure/use-case.test.ts',
      'apps/extension/src/background/runtime/routing/authorization/background-owned-route.test.ts',
      'apps/extension/src/background/runtime/routing/authorization/background-owned.matrix.test.ts',
    ],
  },
  {
    allowCrossOwner: true,
    owner: 'local-data-erasure-native-ingestion-gate-owner',
    productionFile: 'apps/extension/src/background/capture/native-app/lifecycle-gate.ts',
    reason: 'Native exclusion drains admitted transfers and rotates authority generations.',
    testFiles: [
      'apps/extension/src/background/application/privacy-erasure/use-case.test.ts',
      'apps/extension/src/background/capture/native-app/controller.lifecycle-gate.test.ts',
      'apps/extension/src/background/capture/native-app/lifecycle-gate.test.ts',
      'apps/extension/src/background/runtime/native-app/service.privacy-erasure.test.ts',
    ],
  },
  {
    allowCrossOwner: true,
    owner: 'local-data-erasure-native-runtime-owner',
    productionFile: 'apps/extension/src/background/runtime/native-app/privacy-erasure.ts',
    reason: 'Native runtime cleanup revokes the connected port before storage deletion.',
    testFiles: [
      'apps/extension/src/background/runtime/native-app/privacy-erasure.test.ts',
      'apps/extension/src/background/runtime/native-app/service.privacy-erasure.test.ts',
    ],
  },
  {
    allowCrossOwner: true,
    owner: 'local-data-erasure-native-runtime-authority-owner',
    productionFile: 'apps/extension/src/background/runtime/native-app/service-authority.ts',
    reason: 'Native authority generations reject leases that cross an erasure boundary.',
    testFiles: [
      'apps/extension/src/background/runtime/native-app/service-authority.test.ts',
      'apps/extension/src/background/runtime/native-app/service.privacy-erasure.test.ts',
    ],
  },
  {
    allowCrossOwner: true,
    owner: 'local-data-erasure-native-runtime-service-owner',
    productionFile: 'apps/extension/src/background/runtime/native-app/service.ts',
    reason: 'Native runtime service quiescence disconnects stale ports and clears authority.',
    testFiles: [
      'apps/extension/src/background/runtime/native-app/service-lifecycle.test.ts',
      'apps/extension/src/background/runtime/native-app/service.privacy-erasure.test.ts',
    ],
  },
  {
    allowCrossOwner: true,
    owner: 'local-data-erasure-media-lifecycle-owner',
    productionFile: 'apps/extension/src/background/media/lifecycle-gate.ts',
    reason: 'Media lifecycle proof covers mutation drain and capability denial.',
    testFiles: [
      'apps/extension/src/background/application/privacy-erasure/use-case.test.ts',
      'apps/extension/src/background/media/lifecycle-gate.test.ts',
      'apps/extension/src/background/media/video/application/export/use-case.test.ts',
      'apps/extension/src/background/media/video/manager/start-owner.test.ts',
    ],
  },
  {
    allowCrossOwner: true,
    owner: 'local-data-erasure-media-owner',
    productionPrefix: 'apps/extension/src/background/media/privacy-erasure/',
    reason: 'Media recording and export cleanup have owner-local tests.',
    testFiles: [
      'apps/extension/src/background/media/privacy-erasure/cleanup.recovery.test.ts',
      'apps/extension/src/background/media/privacy-erasure/cleanup.test.ts',
    ],
  },
  {
    allowCrossOwner: true,
    owner: 'local-data-erasure-media-stop-failure-logging-owner',
    productionFile: `${BACKGROUND_ROOT}/media/video/runtime/manager/controls.stop/failure-logging.ts`,
    reason: 'Privacy stop logging drops raw transport errors and recording metadata.',
    testFiles: [
      'apps/extension/src/background/media/video/runtime/manager/controls.stop/failure-logging.test.ts',
      'apps/extension/src/background/media/video/runtime/manager/controls.stop/flow.privacy-erasure.test.ts',
    ],
  },
  ...PRIVACY_ERASURE_RUNTIME_OWNER_MAPPINGS,
  {
    allowCrossOwner: true,
    owner: 'local-data-erasure-diagnostics-owner',
    productionPrefix: `${DIAGNOSTICS_ROOT}/privacy-erasure/`,
    reason: 'Diagnostics-owned runtime reset is covered by its cleanup adapter test.',
    testFiles: ['apps/extension/src/background/diagnostics/privacy-erasure/cleanup.test.ts'],
  },
  {
    allowCrossOwner: true,
    owner: 'local-data-erasure-runtime-route-owner',
    productionFile: 'apps/extension/src/background/runtime/routing/boundary/preflight.ts',
    reason: 'Runtime listener handoff to the local erasure route is covered by preflight guards.',
    testFiles: [
      'apps/extension/src/background/runtime/routing/boundary/preflight.local-erasure.test.ts',
      'apps/extension/src/background/runtime/routing/boundary/preflight.test.ts',
    ],
  },
  {
    allowCrossOwner: true,
    owner: 'local-data-erasure-runtime-state-owner',
    productionPrefix: 'apps/extension/src/background/application/runtime-state/',
    reason: 'Background runtime reset behavior is covered by runtime-state owner tests.',
    testFiles: ['apps/extension/src/background/application/runtime-state/index.test.ts'],
  },
  {
    allowCrossOwner: true,
    owner: 'background-runtime-state-authority-flows',
    productionFile:
      'apps/extension/src/background/application/runtime-state/authority-flows-core.ts',
    reason: 'Runtime state authority flows are covered by proof tests.',
    testFiles: ['apps/extension/src/background/application/runtime-state/authority-flows.test.ts'],
  },
  {
    allowCrossOwner: true,
    owner: 'background-runtime-state-authority-flows',
    productionFile:
      'apps/extension/src/background/application/runtime-state/authority-flows-support.ts',
    reason: 'Runtime state authority flows are covered by proof tests.',
    testFiles: ['apps/extension/src/background/application/runtime-state/authority-flows.test.ts'],
  },
  {
    allowCrossOwner: true,
    owner: 'background-runtime-job-state-authority',
    productionFile:
      'apps/extension/src/background/application/runtime-state/job-state-authority.ts',
    reason: 'Job state authority behavior is covered by focused authority tests.',
    testFiles: [
      'apps/extension/src/background/application/runtime-state/job-state-authority.test.ts',
    ],
  },
  {
    allowCrossOwner: true,
    owner: 'background-debugger-activation',
    productionFile: 'apps/extension/src/background/debugger/session/activation.ts',
    reason: 'Debugger activation proof behavior is exercised through attach owner tests.',
    testFiles: ['apps/extension/src/background/debugger/session/attach.test.ts'],
  },
  {
    allowCrossOwner: true,
    owner: 'local-data-erasure-diagnostics-reset-owner',
    productionPrefix: `${DIAGNOSTICS_ROOT}/`,
    reason: 'Diagnostics reset, exclusion, finalization, and recovery have focused proof.',
    testFiles: [
      'apps/extension/src/background/debugger/diagnostics.test.ts',
      'apps/extension/src/background/debugger/session/detach.test.ts',
      'apps/extension/src/background/diagnostics/export-har-collector/privacy-erasure.test.ts',
      'apps/extension/src/background/diagnostics/export-har-collector/session-lifecycle.test.ts',
      'apps/extension/src/background/diagnostics/export-har-collector/session.test.ts',
      'apps/extension/src/background/diagnostics/export-har-collector/start-capability.privacy-erasure.test.ts',
      'apps/extension/src/background/diagnostics/handlers.test.ts',
      'apps/extension/src/background/diagnostics/index.test.ts',
      'apps/extension/src/background/diagnostics/lifecycle-gate.test.ts',
      'apps/extension/src/background/diagnostics/privacy-erasure/cleanup.test.ts',
      'apps/extension/src/background/diagnostics/recovery.test.ts',
      'apps/extension/src/background/diagnostics/runtime.privacy-erasure.test.ts',
      'apps/extension/src/background/diagnostics/state.test.ts',
    ],
  },
  {
    allowCrossOwner: true,
    owner: 'local-data-erasure-settings-ui-owner',
    productionPrefix: `${SETTINGS_ROOT}/sections/privacy`,
    reason: 'Settings privacy navigation, section wiring, and destructive flow are covered.',
    testFiles: [SETTINGS_PRIVACY_TEST, SETTINGS_SECTION_TEST],
  },
  {
    allowCrossOwner: true,
    owner: 'local-data-erasure-settings-entry-owner',
    productionFile: `${SETTINGS_ROOT}/shell/navigation/index.tsx`,
    reason: 'Settings privacy tab wiring is covered by settings section rendering tests.',
    testFiles: [`${SETTINGS_ROOT}/shell/navigation/index.test.ts`, SETTINGS_SECTION_TEST],
  },
  {
    allowCrossOwner: true,
    owner: 'local-data-erasure-settings-entry-owner',
    productionFile: `${SETTINGS_ROOT}/shell/page/sections.tsx`,
    reason: 'Settings privacy section lazy wiring is covered by settings section tests.',
    testFiles: [SETTINGS_SECTION_TEST],
  },
  {
    ...LOCAL_DATA_ERASURE_CONTRACT_OWNER,
    productionFile: 'packages/runtime-contracts/src/messaging/message-types/index.ts',
    reason: 'Local erasure message type stability is covered by contract tests.',
  },
  {
    ...LOCAL_DATA_ERASURE_CONTRACT_OWNER,
    productionFile: `${APP_MESSAGING_ROOT}/privacy-erasure.ts`,
    reason: 'Local erasure request and response contracts are covered by contract tests.',
  },
  {
    ...LOCAL_DATA_ERASURE_CONTRACT_OWNER,
    productionFile: `${APP_MESSAGING_ROOT}/contracts/privacy-erasure-schemas.ts`,
    reason: 'Local erasure runtime schemas are covered by message contract tests.',
  },
  {
    ...LOCAL_DATA_ERASURE_CONTRACT_OWNER,
    productionFile: `${APP_MESSAGING_ROOT}/contracts/runtime-message/core.ts`,
    reason: 'Local erasure runtime message registration is covered by contract tests.',
  },
  {
    ...LOCAL_DATA_ERASURE_CONTRACT_OWNER,
    productionFile: `${APP_MESSAGING_ROOT}/contracts/runtime/actions/core.ts`,
    reason: 'Local erasure runtime action registration is covered by contract tests.',
  },
  {
    allowCrossOwner: true,
    owner: 'extension-page-authority-owner',
    productionPrefix: 'apps/extension/src/platform/navigation/extension-pages/',
    reason: 'Settings page ownership predicate is covered by extension page helper tests.',
    testFiles: ['apps/extension/src/platform/navigation/extension-pages/index.test.ts'],
  },
];
