export const BG_RUNTIME_MESSAGING_OWNER_MAPPINGS = [
  {
    owner: 'background-routing-runtime-messaging-services',
    productionPrefix: 'apps/extension/src/background/routing-contracts/runtime-messaging/',
    exclusive: true,
    reason:
      'Background runtime messaging service injection is covered by its adjacent service suite.',
    testFiles: [
      'apps/extension/src/background/routing-contracts/runtime-messaging/services.test.ts',
    ],
  },
  {
    owner: 'background-page-access-readiness-messaging',
    productionFile: 'apps/extension/src/background/runtime/page-access/readiness.ts',
    exclusive: true,
    reason: 'Content runtime readiness probes are covered by the page-access readiness suite.',
    testFiles: ['apps/extension/src/background/runtime/page-access/readiness.test.ts'],
  },
  {
    owner: 'background-context-menu-messaging',
    productionPrefix: 'apps/extension/src/background/runtime/context-menu/',
    exclusive: true,
    reason: 'Context-menu tab messaging flows are covered by action helper and page-link suites.',
    testFiles: [
      'apps/extension/src/background/runtime/context-menu/action-helpers.test.ts',
      'apps/extension/src/background/runtime/context-menu/page-link/actions.test.ts',
    ],
  },
  {
    owner: 'background-capture-page-preparation-messaging',
    productionPrefix: 'apps/extension/src/background/capture/page-preparation/',
    exclusive: true,
    reason:
      'Page preparation content/viewer routing is covered by the page-preparation route suite.',
    testFiles: ['apps/extension/src/background/capture/page-preparation/route.test.ts'],
  },
  {
    owner: 'background-capture-page-style-messaging',
    productionFile: 'apps/extension/src/background/capture/page-style-runtime/route.ts',
    exclusive: true,
    reason: 'Page style tab dispatch is covered by the page-style route suite.',
    testFiles: ['apps/extension/src/background/capture/page-style-runtime/route.test.ts'],
  },
  {
    owner: 'background-quick-actions-messaging',
    productionPrefix: 'apps/extension/src/background/capture/quick-actions/',
    exclusive: true,
    reason:
      'Quick-action tab messaging, finalization, and notification flows are covered by owner suites.',
    testFiles: [
      'apps/extension/src/background/capture/quick-actions/notifications.test.ts',
      'apps/extension/src/background/capture/quick-actions/flow/flows.test.ts',
      'apps/extension/src/background/capture/quick-actions/flow/finalize.test.ts',
      'apps/extension/src/background/capture/quick-actions/flow/finalize.job.test.ts',
    ],
  },
  {
    owner: 'background-video-manager-messaging',
    productionPrefix: 'apps/extension/src/background/media/video/manager/',
    exclusive: true,
    reason:
      'Video manager preflight, start, watchdog, and announcement messaging are covered by focused manager suites.',
    testFiles: [
      'apps/extension/src/background/media/video/manager/preflight.annotations.test.ts',
      'apps/extension/src/background/media/video/manager/preflight.annotations.controlled.test.ts',
      'apps/extension/src/background/media/video/manager/preflight.resolve.test.ts',
      'apps/extension/src/background/media/video/manager/preflight.resolve.multi-source.test.ts',
      'apps/extension/src/background/media/video/manager/preflight.resolve.multi-source-failure.test.ts',
      'apps/extension/src/background/media/video/manager/session.facade.test.ts',
      'apps/extension/src/background/media/video/manager/start-activation-watchdog.test.ts',
      'apps/extension/src/background/media/video/manager/start-helpers.test.ts',
      'apps/extension/src/background/media/video/manager/start.test.ts',
      'apps/extension/src/background/media/video/manager/start.cleanup.test.ts',
      'apps/extension/src/background/media/video/manager/start-owner.test.ts',
      'apps/extension/src/background/media/video/manager/transport.announce.test.ts',
      'apps/extension/src/background/media/video/manager/transport.finalize.test.ts',
    ],
  },
  {
    owner: 'background-video-ui-messaging',
    productionPrefix: 'apps/extension/src/background/media/video/ui/',
    exclusive: true,
    reason:
      'Desktop media, region selection, and recording overlay messaging are covered by video UI suites.',
    testFiles: [
      'apps/extension/src/background/media/video/ui/desktop-media.test.ts',
      'apps/extension/src/background/media/video/ui/requests.test.ts',
      'apps/extension/src/background/media/video/ui/region-selection.binding.test.ts',
      'apps/extension/src/background/media/video/ui/shared.test.ts',
    ],
  },
  {
    owner: 'background-video-runtime-manager-messaging',
    productionPrefix: 'apps/extension/src/background/media/video/runtime/manager/',
    exclusive: true,
    reason:
      'Video runtime manager control and controlled-cursor messaging is covered by focused runtime manager suites.',
    testFiles: [
      'apps/extension/src/background/media/video/runtime/manager/controlled-cursor/messages.test.ts',
      'apps/extension/src/background/media/video/runtime/manager/controlled-cursor/navigation.test.ts',
      'apps/extension/src/background/media/video/runtime/manager/controlled-cursor/navigation.stale-continuation.test.ts',
      'apps/extension/src/background/media/video/runtime/manager/controlled-cursor/navigation.stale-epoch.test.ts',
      'apps/extension/src/background/media/video/runtime/manager/controls.pause-resume.test.ts',
      'apps/extension/src/background/media/video/runtime/manager/controls.start-failure.test.ts',
      'apps/extension/src/background/media/video/runtime/manager/controls.stop/flow.privacy-erasure.test.ts',
      'apps/extension/src/background/media/video/runtime/manager/controls.stop/flow.test.ts',
      'apps/extension/src/background/media/video/runtime/manager/controls.stop/effects.test.ts',
    ],
  },
];
