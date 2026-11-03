// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { MotionFocusModeField } from './fields';
import { createMotionPanelProps } from './test-support';
import {
  DEFAULT_CAMERA_PERSPECTIVE,
  DEFAULT_CURSOR_COMPOSITION,
} from '../../../../../features/video/project/motion/spatial';
import { VideoMotionFocusMode } from '../../../../../features/video/project/types';
import { translate } from '../../../../../platform/i18n';

it('switches legacy Manual to Cursor with default orbit in one command and preserves authored angles', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const panel = createMotionPanelProps({
    focusMode: VideoMotionFocusMode.MANUAL,
    perspective: { ...DEFAULT_CAMERA_PERSPECTIVE, enabled: true, rotateY: 25 },
  });
  const region = panel.selectedMotionRegion!;
  delete region.cursorComposition;
  panel.project.cursorFocusPath = {
    version: 1,
    mode: 'fixed',
    gapPolicy: 'hold',
    smoothing: 0.5,
    sensitivity: 0.5,
    segments: [
      {
        id: 'cursor',
        binding: { kind: 'project' },
        start: 0,
        end: 8,
        keys: [
          {
            id: 'point',
            time: 0,
            x: 0.5,
            y: 0.5,
            anchor: 'manual',
            authored: true,
            interpolation: 'hold',
          },
        ],
      },
    ],
  };
  const change = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <MotionFocusModeField
          panel={{ ...panel, onUpdateMotionRegion: change }}
          motionRegion={region}
        />
      )
    );
    const cursor = [
      ...host.querySelectorAll<HTMLButtonElement>('[data-ui="camera.followTarget"] button'),
    ].find((button) => button.textContent === translate('editor.scene.cameraFollowCursor'))!;
    expect(cursor.disabled).toBe(false);
    await act(async () => cursor.click());
    expect(change).toHaveBeenCalledExactlyOnceWith(region.id, {
      focusMode: VideoMotionFocusMode.CURSOR,
      focusPoint: region.focusPoint,
      spatialEdit: { kind: 'cursor-composition', ...DEFAULT_CURSOR_COMPOSITION },
    });
    expect(region.perspective?.rotateY).toBe(25);
    expect(region.focusMode).toBe(VideoMotionFocusMode.MANUAL);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
