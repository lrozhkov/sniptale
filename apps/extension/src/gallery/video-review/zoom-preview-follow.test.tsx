// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewZoomPreview } from './zoom-preview';
import * as previewCanvas from './zoom-preview-canvas';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { resolveQuickEditEffectiveState } from '../../features/video/review/advanced/effective';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import { evaluateQuickEditCameraAtTime } from '../../features/video/review/advanced/scene';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';

let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  root = createRoot(document.createElement('div'));
});
afterEach(() => {
  act(() => root.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([2, 4])('uses the retained camera slice after a cut at paused time %s', async (time) => {
  const state = createQuickEditAdvancedState();
  state.ui.mode = 'advanced';
  state.zoom.enabled = true;
  state.ui.tracks.zoom = true;
  state.cursorFocusPath = {
    version: 1,
    smoothing: 0.5,
    sensitivity: 0.5,
    mode: 'fixed',
    gapPolicy: 'hold',
    segments: [
      {
        id: 'before',
        binding: { kind: 'project' },
        start: 0,
        end: 2,
        keys: [{ id: 'left', time: 0, x: 0.2, y: 0.3, anchor: 'manual', interpolation: 'hold' }],
      },
      {
        id: 'after',
        binding: { kind: 'project' },
        start: 4,
        end: 10,
        keys: [{ id: 'right', time: 4, x: 0.8, y: 0.7, anchor: 'manual', interpolation: 'hold' }],
      },
    ],
  };
  const camera = {
    ...createQuickEditZoomRegion({ id: 'camera', at: 0, duration: 8, endMax: 10 }),
    transform: { scale: 2, centerX: 0.5, centerY: 0.5 },
    start: 0,
    end: 8,
    sourceAnchor: { start: 0, end: 10 },
    followCursor: true,
  };
  state.zoom.regions = [camera];
  state.audio.voiceoverSegments = buildReviewTimeMap(10, [
    { id: 'cut', kind: 'cut', start: 2, end: 4, requestedStart: 2, requestedEnd: 4 },
  ]);
  const regions = resolveQuickEditEffectiveState(state).zoomRegions;
  expect(regions.map((item) => item.id)).toEqual([camera.id, `${camera.id}:slice:1`]);
  const paint = vi.spyOn(previewCanvas, 'ZoomPreviewCanvas').mockImplementation(() => <canvas />);
  act(() =>
    root.render(
      <ReviewZoomPreview
        region={camera}
        cursorFollowing
        background={state.background}
        source={{ width: 640, height: 360 }}
        sourceTime={time + 2}
        focus={{ regions, time }}
        onChange={vi.fn()}
        loadFrame={async () => ({
          image: document.createElement('canvas'),
          width: 640,
          height: 360,
        })}
      />
    )
  );
  await act(async () => Promise.resolve());
  const expected = evaluateQuickEditCameraAtTime(regions, time, {
    source: { width: 640, height: 360 },
    background: state.background,
  });
  const shown = paint.mock.lastCall![0].camera;
  expect(shown.centerX).toBeCloseTo(expected.centerX);
  expect(shown.centerY).toBeCloseTo(expected.centerY);
});
