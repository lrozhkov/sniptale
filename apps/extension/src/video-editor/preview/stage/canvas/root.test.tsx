// @vitest-environment jsdom
import { VideoMotionOverlayZoomMode } from '../../../../features/video/project/types';
import { expect, it } from 'vitest';
import { isValidElement } from 'react';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { createPreviewStageSelectionOverlay } from './root';
import { PreviewEffectEditorRegion } from './editor-region';
it('routes FX selection to its region instead of a source-clip transform, only in editor mode', () => {
  const props: Parameters<typeof createPreviewStageSelectionOverlay>[0] = {
    mode: 'editor',
    project: createEmptyVideoProject('region'),
    currentTime: 1,
    selectedEffectInstanceId: 'fx',
    selectedClip: null,
    selectedClipLocked: false,
    stageRef: { current: null },
    beginInteraction: () => {},
    camera: {
      scale: 1,
      viewportX: 0,
      viewportY: 0,
      viewportWidth: 1920,
      viewportHeight: 1080,
      focusPoint: { x: 960, y: 540 },
      motionBlurAmount: 0,
      regionId: null,
      overlayZoomMode: VideoMotionOverlayZoomMode.LOCK_OVERLAYS,
    },
  };
  props.project.effectInstances = [
    {
      id: 'fx',
      kind: 'targetEffect',
      target: { kind: 'video-group' },
      snapshotId: 'snapshot',
      startTime: 0,
      duration: 4,
      playbackRate: 1,
      controls: {},
      enabled: true,
    },
  ];
  const result = createPreviewStageSelectionOverlay(props);
  expect(isValidElement(result) && result.type).toBe(PreviewEffectEditorRegion);
  expect(createPreviewStageSelectionOverlay({ ...props, mode: 'player' })).toBeNull();
  props.project.effectInstances[0]!.kind = 'standalone';
  const annotation = createPreviewStageSelectionOverlay(props);
  expect(isValidElement(annotation) && annotation.type).not.toBe(PreviewEffectEditorRegion);
});
