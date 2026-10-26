/** Narrow proof for the two camera editors and their shared compositor. */
export const CAMERA_SPLIT_OWNER_MAPPINGS = [
  {
    owner: 'review-camera-split-persistence',
    productionFile: 'apps/extension/src/features/video/review/advanced/webcam.ts',
    allowCrossOwner: true,
    reason:
      'Camera screen behavior uses canonical workspace history, stale-write refusal and restore admission.',
    testFiles: [
      'apps/extension/src/features/video/review/advanced/webcam.test.ts',
      'apps/extension/src/composition/persistence/review-workspaces/store.test.ts',
      'apps/extension/src/composition/persistence/review-workspaces/store-advanced.test.ts',
    ],
  },
  {
    owner: 'review-camera-split-conversion',
    productionFile: 'apps/extension/src/features/video/review/project-camera.ts',
    reason: 'Gallery camera positions retain their panel geometry after native project conversion.',
    testFiles: ['apps/extension/src/features/video/review/project-conversion.camera.test.ts'],
  },
  {
    owner: 'review-camera-split-inspector',
    productionFile: 'apps/extension/src/gallery/video-review/webcam-inspector.tsx',
    reason:
      'The Gallery inspector persists split layout and returns to the authored dock placement.',
    testFiles: ['apps/extension/src/gallery/video-review/webcam-ui.test.tsx'],
  },
  {
    owner: 'native-camera-split-layout-buttons',
    productionFile:
      'apps/extension/src/video-editor/workspace/sidebar/selection/inputs/camera-split-layout-buttons.tsx',
    reason: 'The native inspector selects split sides and restores saved overlay placement.',
    testFiles: [
      'apps/extension/src/video-editor/workspace/sidebar/selection/inputs/camera-layout.test.tsx',
    ],
  },
  {
    owner: 'review-camera-split-compositor',
    productionFile: 'apps/extension/src/workflows/video-review/camera-split-screen.ts',
    reason: 'Gallery preview paints the existing scene into the split pane before the camera.',
    testFiles: ['apps/extension/src/workflows/video-review/camera-split-screen.test.ts'],
  },
];
