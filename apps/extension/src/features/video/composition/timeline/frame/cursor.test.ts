import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../../project/factories/creation';
import { normalizeVideoProjectCursorSkin } from '../../../project/cursor';
import { VideoCursorCaptureMode } from '../../../project/types';
import { resolveCursorSample, resolveVideoCompositionCursor } from './cursor';

it.each([VideoCursorCaptureMode.SEPARATE, VideoCursorCaptureMode.EMBEDDED_FALLBACK])(
  'switches cursor visibility at its key time in %s mode',
  (captureMode) => {
    const project = createEmptyVideoProject('Cursor keys');
    project.cursorTrack = {
      captureMode,
      skin: normalizeVideoProjectCursorSkin(undefined),
      samples: [
        { id: 'show', time: 1, x: 10, y: 20, visible: true },
        { id: 'hide', time: 3, x: 30, y: 40, visible: false },
        { id: 'restore', time: 5, x: 50, y: 60, visible: true },
      ],
    };
    expect(resolveCursorSample(project, 0.5)).toBeNull();
    for (const time of [1, 2, 2.999]) {
      expect(resolveVideoCompositionCursor(project, time, [])?.visible).toBe(true);
    }
    for (const time of [3, 4, 4.999]) {
      expect(resolveVideoCompositionCursor(project, time, [])).toBeNull();
    }
    expect(resolveVideoCompositionCursor(project, 5, [])?.visible).toBe(true);
    if (captureMode === VideoCursorCaptureMode.SEPARATE) {
      expect(resolveCursorSample(project, 2)).toMatchObject({ x: 20, y: 30 });
    }
  }
);

it('compresses a separate cursor only during click feedback and is stable on seek', () => {
  const project = createEmptyVideoProject('Click cursor');
  project.duration = 4;
  project.cursorTrack = {
    captureMode: VideoCursorCaptureMode.SEPARATE,
    skin: { ...normalizeVideoProjectCursorSkin(undefined), animationPreset: 'PRESS' },
    samples: [{ id: 'one', time: 0, x: 40, y: 50, visible: true }],
  };
  project.actionEvents = [
    {
      id: 'click',
      kind: 'CLICK',
      anchor: { kind: 'project', time: 1 },
      label: 'Click',
      data: {},
      point: null,
      presentation: { preset: 'NONE' },
    },
  ];
  expect(resolveVideoCompositionCursor(project, 0.5, [])?.scale).toBe(1);
  expect(resolveVideoCompositionCursor(project, 1.125, [])?.scale).toBeCloseTo(0.82);
  expect(resolveVideoCompositionCursor(project, 2, [])?.scale).toBe(1);
  expect(resolveVideoCompositionCursor(project, 1.125, [])?.scale).toBeCloseTo(0.82);
});
