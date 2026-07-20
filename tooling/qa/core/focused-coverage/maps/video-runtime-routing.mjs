export const VIDEO_RECORDING_RUNTIME_ROUTING_OWNER_MAPPINGS = [
  {
    owner: 'background-media-public-routes',
    productionFile: 'apps/extension/src/background/media/routes.ts',
    reason:
      'The public media route entrypoint is covered by video runtime and control route suites.',
    testFiles: [
      'apps/extension/src/background/media/video/runtime/router.export.test.ts',
      'apps/extension/src/background/media/video/runtime/manager/control-route.test.ts',
      'apps/extension/src/background/media/video/runtime/manager/control-route.start.test.ts',
      'apps/extension/src/background/runtime/routing/action-kernel/handlers.project-export.test.ts',
    ],
  },
  {
    owner: 'background-media-public-lifecycle',
    productionFile: 'apps/extension/src/background/media/lifecycle.ts',
    reason:
      'The public media lifecycle entrypoint is covered by runtime wiring and recording owner suites.',
    testFiles: [
      'apps/extension/src/background/runtime/routing/runtime-wiring/startup.test.ts',
      'apps/extension/src/background/runtime/routing/runtime-wiring/navigation.test.ts',
      'apps/extension/src/background/runtime/routing/runtime-wiring/debugger.test.ts',
      'apps/extension/src/background/media/video/runtime/manager/control-route.test.ts',
    ],
  },
  {
    owner: 'background-runtime-video-control-boundary',
    productionFile: 'apps/extension/src/background/runtime/routing/boundary/listener.ts',
    reason:
      'Runtime video-control boundary listener propagation is covered by listener and tab-dispatch suites.',
    testFiles: [
      'apps/extension/src/background/runtime/routing/boundary/listener.test.ts',
      'apps/extension/src/background/runtime/routing/boundary/listener.tab-routing.test.ts',
      'apps/extension/src/background/runtime/routing/tab-dispatch/video-control.test.ts',
    ],
  },
  {
    owner: 'background-runtime-video-control-tab-dispatch',
    productionFile: 'apps/extension/src/background/runtime/routing/tab-dispatch/video-control.ts',
    reason: 'Runtime video-control dispatch is covered by focused tab-dispatch route tests.',
    testFiles: ['apps/extension/src/background/runtime/routing/tab-dispatch/video-control.test.ts'],
  },
  {
    owner: 'background-runtime-video-control-tab-dispatch',
    productionFile:
      'apps/extension/src/background/runtime/routing/tab-dispatch/adapters/video-control-adapter.ts',
    reason: 'Runtime video-control adapter routing is covered by focused tab-dispatch route tests.',
    testFiles: ['apps/extension/src/background/runtime/routing/tab-dispatch/video-control.test.ts'],
  },
];
