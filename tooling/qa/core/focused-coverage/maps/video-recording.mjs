import { VIDEO_RECORDING_LEASE_OWNER_MAPPINGS } from './video-recording-lease.mjs';
import { VIDEO_RECORDING_RUNTIME_ROUTING_OWNER_MAPPINGS } from './video-runtime-routing.mjs';
import { SHARED_CONTRACT_OWNER_MAPPINGS } from './video-recording-shared-contract.mjs';

const POPUP_RUNTIME_ROOT = 'apps/extension/src/popup/shell/runtime';
const POPUP_BOOTSTRAP_ROOT = 'apps/extension/src/popup/shell/bootstrap';
const POPUP_LIFECYCLE_ROOT = 'apps/extension/src/popup/shell/lifecycle';

export const VIDEO_RECORDING_OWNER_MAPPINGS = [
  ...VIDEO_RECORDING_LEASE_OWNER_MAPPINGS,
  ...VIDEO_RECORDING_RUNTIME_ROUTING_OWNER_MAPPINGS,
  {
    owner: 'background-video-recording-start-watchdog',
    productionFile:
      'apps/extension/src/background/media/video/manager/start-activation-watchdog.ts',
    reason: 'Recording start activation timeout ordering is covered by the focused watchdog suite.',
    testFiles: [
      'apps/extension/src/background/media/video/manager/start-activation-watchdog.test.ts',
    ],
  },
  {
    owner: 'background-video-recording-start-owner',
    productionFile: 'apps/extension/src/background/media/video/manager/start.ts',
    reason:
      'Recording start owner/capability creation is covered by focused start and owner suites.',
    testFiles: [
      'apps/extension/src/background/media/video/manager/start.test.ts',
      'apps/extension/src/background/media/video/manager/start-owner.test.ts',
    ],
  },
  {
    owner: 'background-video-recording-start-delivery-owner',
    productionFile: 'apps/extension/src/background/media/video/manager/start-delivery.ts',
    exclusive: true,
    reason:
      'Recording delivery acceptance, camera launch, timeout, and rollback branches have focused proof.',
    testFiles: [
      'apps/extension/src/background/media/video/manager/start.camera.test.ts',
      'apps/extension/src/background/media/video/manager/start.cleanup.test.ts',
      'apps/extension/src/background/media/video/manager/start-owner.test.ts',
      'apps/extension/src/background/media/video/manager/start.test.ts',
    ],
  },
  {
    owner: 'background-video-recording-start-owner',
    productionFile: 'apps/extension/src/background/media/video/manager/transport.finalize.ts',
    reason:
      'Recording start handoff cancellation is covered by focused start owner and transport finalize suites.',
    testFiles: [
      'apps/extension/src/background/media/video/manager/start-owner.test.ts',
      'apps/extension/src/background/media/video/manager/transport.finalize.test.ts',
    ],
  },
  {
    owner: 'offscreen-recording-start-runtime',
    productionFile: 'apps/extension/src/offscreen/runtime/index.ts',
    reason:
      'Offscreen recording start runtime fallback and duplicate error suppression are covered ' +
      'by focused runtime suites.',
    testFiles: [
      'apps/extension/src/offscreen/runtime/index.error.test.ts',
      'apps/extension/src/offscreen/runtime/index.export.test.ts',
      'apps/extension/src/offscreen/runtime/index.start-error.test.ts',
      'apps/extension/src/offscreen/runtime/index.test.ts',
    ],
  },
  {
    owner: 'offscreen-recording-lifecycle-controller',
    productionFile: 'apps/extension/src/offscreen/recording/controller.ts',
    reason:
      'Offscreen start/stop exclusion and delayed activation draining are covered by controller suites.',
    testFiles: [
      'apps/extension/src/offscreen/recording/controller.test.ts',
      'apps/extension/src/offscreen/recording/controller.start-stop.test.ts',
      'apps/extension/src/offscreen/recording/controller.stop.test.ts',
      'apps/extension/src/offscreen/recording/controller.multi-source.lifecycle.test.ts',
    ],
  },
  {
    owner: 'offscreen-recording-start',
    productionPrefix: 'apps/extension/src/offscreen/recording/start/',
    reason:
      'Offscreen recording start, request-scoped failures, and reported-error markers are ' +
      'covered by focused start suites.',
    testFiles: [
      'apps/extension/src/offscreen/recording/start/helpers.notifications.test.ts',
      'apps/extension/src/offscreen/recording/start/helpers.test.ts',
      'apps/extension/src/offscreen/recording/start/index.test.ts',
      'apps/extension/src/offscreen/recording/start/recorder.error.test.ts',
      'apps/extension/src/offscreen/runtime/index.start-error.test.ts',
    ],
  },
  {
    owner: 'shared-video-recording-start-timeouts',
    productionFile: 'packages/runtime-contracts/src/video/types/timeouts.ts',
    reason:
      'Recording start timeout ordering is covered by the focused activation watchdog invariant.',
    testFiles: [
      'apps/extension/src/background/media/video/manager/start-activation-watchdog.test.ts',
    ],
  },
  {
    owner: 'background-video-runtime-state-handlers',
    productionPrefix: 'apps/extension/src/background/media/video/runtime/handlers/state/',
    reason:
      'Recording lifecycle state handlers are covered by focused state handler and aggregate suites.',
    testFiles: [
      'apps/extension/src/background/media/video/runtime/handlers/state.test.ts',
      'apps/extension/src/background/media/video/runtime/handlers/state/root.test.ts',
      'apps/extension/src/background/media/video/runtime/handlers/state/recording-state.test.ts',
      'apps/extension/src/background/media/video/runtime/handlers/state/offscreen-lifecycle.test.ts',
    ],
  },
  {
    owner: 'background-video-recording-session-lifecycle',
    productionPrefix: 'apps/extension/src/background/media/video/session-state/',
    reason:
      'Recording preparation, accepted dispatch, stop, and reset phases are covered by session suites.',
    testFiles: [
      'apps/extension/src/background/media/video/session-state/index.test.ts',
      'apps/extension/src/background/media/video/session-state/state.behavior.test.ts',
      'apps/extension/src/background/media/video/session-state/stop.test.ts',
    ],
  },
  {
    owner: 'background-video-runtime-handler-shared',
    productionFile: 'apps/extension/src/background/media/video/runtime/handlers/shared.ts',
    reason: 'Runtime handler shared response helpers are covered by the shared handler suite.',
    testFiles: ['apps/extension/src/background/media/video/runtime/handlers/shared.test.ts'],
  },
  {
    owner: 'background-video-runtime-control-router',
    productionFile: 'apps/extension/src/background/media/video/runtime/manager/control-route.ts',
    exclusive: true,
    reason:
      'Recording control route authority is covered by focused control router capability suites.',
    testFiles: [
      'apps/extension/src/background/media/video/runtime/manager/control-route.test.ts',
      'apps/extension/src/background/media/video/runtime/manager/control-route.capability.test.ts',
      'apps/extension/src/background/media/video/runtime/manager/control-route.responses.test.ts',
    ],
  },
  {
    owner: 'background-video-runtime-router',
    productionFile: 'apps/extension/src/background/media/video/runtime/router.ts',
    reason:
      'Runtime video routing is covered by focused router branch, lifecycle, and fallback suites.',
    testFiles: [
      'apps/extension/src/background/media/video/runtime/router.branches.test.ts',
      'apps/extension/src/background/media/video/runtime/router.extended.test.ts',
      'apps/extension/src/background/media/video/runtime/router.lifecycle.test.ts',
      'apps/extension/src/background/media/video/runtime/router.test.ts',
    ],
  },
  {
    owner: 'background-video-runtime-sender-policy',
    productionFile: 'apps/extension/src/background/media/video/runtime/sender-policy.ts',
    exclusive: true,
    reason: 'Runtime recording sender policy is covered by the focused sender-policy suite.',
    testFiles: ['apps/extension/src/background/media/video/runtime/sender-policy.test.ts'],
  },
  {
    owner: 'background-runtime-recording-startup-reconcile',
    productionFile: 'apps/extension/src/background/runtime/routing/runtime-wiring/startup.ts',
    reason:
      'Recording startup reconciliation is covered by startup wiring and recording lease hydration tests.',
    testFiles: [
      'apps/extension/src/background/runtime/routing/runtime-wiring/startup.test.ts',
      'apps/extension/src/background/media/video/recording-control-lease.test.ts',
    ],
  },
  {
    owner: 'background-context-menu-recording-owner',
    productionFile: 'apps/extension/src/background/runtime/context-menu/action-helpers.ts',
    reason:
      'Context-menu recording starts reuse the popup recording owner and are covered by action helpers.',
    testFiles: [
      'apps/extension/src/background/runtime/context-menu/action-helpers.test.ts',
      'apps/extension/src/background/media/video/manager/start-owner.test.ts',
    ],
  },
  {
    owner: 'popup-recording-start',
    productionFile: `${POPUP_RUNTIME_ROOT}/start-recording.ts`,
    exclusive: true,
    reason:
      'Popup recording start message construction and response handling are covered by focused start suites.',
    testFiles: [
      `${POPUP_RUNTIME_ROOT}/start-recording.test.ts`,
      `${POPUP_RUNTIME_ROOT}/start-recording.capability.test.ts`,
      `${POPUP_RUNTIME_ROOT}/start-recording.multi-source.test.ts`,
      `${POPUP_RUNTIME_ROOT}/start-recording.webcam.test.ts`,
    ],
  },
  {
    owner: 'popup-recording-control-capability',
    productionPrefix: POPUP_RUNTIME_ROOT,
    reason:
      'Popup recording control capability propagation is covered by start, effect, and transport suites.',
    testFiles: [
      `${POPUP_RUNTIME_ROOT}/effects.test.tsx`,
      `${POPUP_RUNTIME_ROOT}/actions.test.tsx`,
      `${POPUP_RUNTIME_ROOT}/start-recording.test.ts`,
      `${POPUP_RUNTIME_ROOT}/start-recording.capability.test.ts`,
      `${POPUP_RUNTIME_ROOT}/start-recording.multi-source.test.ts`,
      `${POPUP_RUNTIME_ROOT}/start-recording.webcam.test.ts`,
      `${POPUP_RUNTIME_ROOT}/state.test.tsx`,
      `${POPUP_RUNTIME_ROOT}/start/params.test.ts`,
      `${POPUP_RUNTIME_ROOT}/transport/pause.test.tsx`,
      `${POPUP_RUNTIME_ROOT}/transport/stop.test.tsx`,
    ],
  },
  {
    owner: 'popup-recording-bootstrap-capability',
    productionPrefix: POPUP_BOOTSTRAP_ROOT,
    reason: 'Popup bootstrap recording capability hydration is covered by bootstrap suites.',
    testFiles: [
      `${POPUP_BOOTSTRAP_ROOT}/index.test.ts`,
      `${POPUP_LIFECYCLE_ROOT}/bootstrap.test.ts`,
    ],
  },
  {
    owner: 'popup-recording-lifecycle-capability',
    productionPrefix: POPUP_LIFECYCLE_ROOT,
    reason: 'Popup lifecycle capability hydration is covered by bootstrap/setup/index suites.',
    testFiles: [
      `${POPUP_LIFECYCLE_ROOT}/bootstrap.test.ts`,
      `${POPUP_LIFECYCLE_ROOT}/index.test.ts`,
      `${POPUP_LIFECYCLE_ROOT}/setup.test.ts`,
    ],
  },
  ...SHARED_CONTRACT_OWNER_MAPPINGS,
];
