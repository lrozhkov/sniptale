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

it.each([
  ['scale', 'videoEditor.sidebar.motionScaleLabel'],
  ['duration', 'videoEditor.sidebar.motionDurationLabel'],
  ['enter', 'gallery.videoReview.zoomTransitionDuration'],
  ['exit', 'gallery.videoReview.zoomTransitionDuration'],
] as const)('keeps %s gestures local until one commit and discards Escape', async (kind, label) => {
  const { MotionCameraFields, MotionTimingFields, MotionBehaviorFields } =
    await import('./content');
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const panel = createMotionPanelProps();
  panel.onUpdateMotionRegion = vi.fn();
  const region = panel.selectedMotionRegion!;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    const Fields =
      kind === 'scale'
        ? MotionCameraFields
        : kind === 'duration'
          ? MotionTimingFields
          : MotionBehaviorFields;
    act(() => root.render(<Fields motionRegion={region} panel={panel} />));
    const owner =
      kind === 'enter' || kind === 'exit' ? host.querySelector(`[data-phase="${kind}"]`)! : host;
    const input = owner.querySelector<HTMLInputElement>(
      `input[aria-label="${translate(label)} range"]`
    )!;
    expect(input).not.toBeNull();
    const baseline = input.value;
    const key = (type: string, key: string) =>
      act(() => input.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true })));
    key('keydown', 'ArrowRight');
    key('keydown', 'ArrowRight');
    expect(panel.onUpdateMotionRegion).not.toHaveBeenCalled();
    expect(input.value).not.toBe(baseline);
    key('keydown', 'Escape');
    key('keyup', 'ArrowRight');
    expect(input.value).toBe(baseline);
    expect(panel.onUpdateMotionRegion).not.toHaveBeenCalled();
    key('keydown', 'ArrowRight');
    const accepted = Number(input.value);
    key('keyup', 'ArrowRight');
    key('keyup', 'ArrowRight');
    expect(panel.onUpdateMotionRegion).toHaveBeenCalledExactlyOnceWith(
      region.id,
      kind === 'scale'
        ? { scale: accepted / 100 }
        : kind === 'duration'
          ? { duration: accepted }
          : { motionTransitionPhase: { phase: kind, duration: accepted } }
    );
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
