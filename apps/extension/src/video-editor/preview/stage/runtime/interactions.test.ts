// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { beginPreviewStageInteraction } from './interactions';
import {
  createLockedOverlayScenario,
  createLockedStageScenario,
  createPointerEvent,
  createStageRectSpy,
  createUnlockedStageScenario,
  dispatchPointerMove,
} from './interactions.test-support';

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('commits the latest clip transform once when the pointer interaction ends', () => {
  const {
    camera,
    cleanupRef,
    clip,
    interactionRef,
    onSelectClip,
    onUpdateClipTransform,
    project,
    stage,
  } = createUnlockedStageScenario();
  createStageRectSpy(stage);

  beginPreviewStageInteraction({
    camera,
    clip,
    cleanupRef,
    event: createPointerEvent(100, 60),
    interactionRef: interactionRef as never,
    mode: 'move',
    onSelectClip,
    onUpdateClipTransform,
    project,
    stage,
    tracks: project.tracks,
  });

  act(() => {
    dispatchPointerMove(140, 90);
  });
  expect(onUpdateClipTransform).not.toHaveBeenCalled();

  act(() => {
    window.dispatchEvent(new Event('pointerup'));
  });

  expect(onSelectClip).toHaveBeenCalledWith('clip-1');
  expect(onUpdateClipTransform).toHaveBeenCalledWith(
    'clip-1',
    expect.objectContaining({
      x: 30,
      y: 30,
    })
  );
  expect(onUpdateClipTransform).toHaveBeenCalledTimes(1);
  expect(interactionRef.current).toBeNull();
});

it('skips interaction setup for locked tracks', () => {
  const { camera, clip, onUpdateClipTransform, project } = createLockedStageScenario();
  const onSelectClip = vi.fn();

  beginPreviewStageInteraction({
    camera,
    clip,
    cleanupRef: { current: null } as never,
    event: createPointerEvent(10, 10),
    interactionRef: { current: null } as never,
    mode: 'move',
    onSelectClip,
    onUpdateClipTransform,
    project,
    stage: document.createElement('div'),
    tracks: project.tracks,
  });

  dispatchPointerMove(40, 40);

  expect(onUpdateClipTransform).not.toHaveBeenCalled();
  expect(onSelectClip).not.toHaveBeenCalled();
});

it('clears interaction state without committing after preview cleanup runs', () => {
  const { camera, cleanupRef, clip, interactionRef, onUpdateClipTransform, project, stage } =
    createUnlockedStageScenario();
  createStageRectSpy(stage);

  const gestureHooks = {
    onCacheBypassChange: vi.fn(),
    onRestore: vi.fn(),
    onSettle: vi.fn(),
  };
  beginPreviewStageInteraction({
    camera,
    clip,
    cleanupRef,
    event: createPointerEvent(100, 60),
    gestureHooks,
    interactionRef: interactionRef as never,
    mode: 'move',
    onSelectClip: vi.fn(),
    onUpdateClipTransform,
    project,
    stage,
    tracks: project.tracks,
  });
  cleanupRef.current?.();
  act(() => {
    dispatchPointerMove(140, 90);
  });

  expect(onUpdateClipTransform).not.toHaveBeenCalled();
  expect(interactionRef.current).toBeNull();
  expect(gestureHooks.onRestore).toHaveBeenCalledWith(clip.id);
  expect(gestureHooks.onCacheBypassChange.mock.calls).toEqual([[true], [false]]);
  expect(gestureHooks.onSettle).toHaveBeenCalledWith('cancel');
});

it('uses the fitted viewport scale for fullscreen-like interaction deltas', () => {
  const { camera, cleanupRef, clip, interactionRef, onUpdateClipTransform, project, stage } =
    createUnlockedStageScenario();
  createStageRectSpy(stage, 220, 140);

  beginPreviewStageInteraction({
    camera,
    clip,
    cleanupRef,
    event: createPointerEvent(88, 59),
    interactionRef: interactionRef as never,
    mode: 'move',
    onSelectClip: vi.fn(),
    onUpdateClipTransform,
    project,
    stage,
    tracks: project.tracks,
  });

  act(() => {
    dispatchPointerMove(132, 81);
    window.dispatchEvent(new Event('pointerup'));
  });

  expect(onUpdateClipTransform).toHaveBeenCalledWith(
    'clip-1',
    expect.objectContaining({
      x: 50,
      y: 35,
    })
  );
});

it('keeps locked overlay interactions on viewport-fixed deltas even when the camera zooms', () => {
  const { camera, cleanupRef, clip, interactionRef, onUpdateClipTransform, project, stage } =
    createLockedOverlayScenario();
  createStageRectSpy(stage, 220, 140);

  beginPreviewStageInteraction({
    camera,
    clip,
    cleanupRef,
    event: createPointerEvent(132, 88),
    interactionRef: interactionRef as never,
    mode: 'move',
    onSelectClip: vi.fn(),
    onUpdateClipTransform,
    project,
    stage,
    tracks: project.tracks,
  });

  act(() => {
    dispatchPointerMove(154, 102);
    window.dispatchEvent(new Event('pointerup'));
  });

  expect(onUpdateClipTransform).toHaveBeenCalledWith(
    clip.id,
    expect.objectContaining({
      x: 140,
      y: expect.closeTo(72.727273, 6),
    })
  );
});

it('uses unequal inverse-projected move deltas across the tilted plane', () => {
  const xs: number[] = [];
  for (const startX of [100, 300]) {
    const f = createUnlockedStageScenario();
    createStageRectSpy(f.stage);
    const radians = (35 * Math.PI) / 180;
    const camera = {
      ...f.camera,
      spatial: {
        reference: { x: 0, y: 0, width: 200, height: 100 },
        rotation: [0, Math.sin(radians / 2), 0, Math.cos(radians / 2)] as const,
        perspective: 1,
        windowMotion: 1,
        lockBackground: false,
        focus: [],
      },
    };
    beginPreviewStageInteraction({
      ...f,
      camera,
      event: createPointerEvent(startX, 60),
      mode: 'move',
      interactionRef: { current: null },
      tracks: f.project.tracks,
    });
    act(() => {
      dispatchPointerMove(startX + 40, 90);
      window.dispatchEvent(new Event('pointerup'));
    });
    const inverse = (x: number, y: number) => {
      const g = (0.7 * Math.sin(radians)) / Math.hypot(200, 100);
      const dx = (x / 2 - 100) / (Math.cos(radians) - g * (x / 2 - 100));
      return { x: 100 + dx, y: 50 + (y / 2 - 50) * (1 + g * dx) };
    };
    const origin = inverse(startX, 60),
      end = inverse(startX + 40, 90);
    expect(f.onUpdateClipTransform).toHaveBeenCalledExactlyOnceWith(
      f.clip.id,
      expect.objectContaining({
        x: expect.closeTo(f.clip.transform.x + end.x - origin.x, 9),
        y: expect.closeTo(f.clip.transform.y + end.y - origin.y, 9),
      })
    );
    xs.push(end.x - origin.x);
  }
  expect(Math.abs(xs[0]! - xs[1]!)).toBeGreaterThan(5);
});

it('does not start a spatial transform gesture when the camera inverse is singular', () => {
  const f = createUnlockedStageScenario();
  createStageRectSpy(f.stage);
  const onBegin = vi.fn();
  beginPreviewStageInteraction({
    ...f,
    camera: {
      ...f.camera,
      scale: 0,
      spatial: {
        reference: { x: 0, y: 0, width: 200, height: 100 },
        rotation: [0, 0, 0, 1],
        perspective: 1,
        windowMotion: 1,
        lockBackground: false,
        focus: [],
      },
    },
    event: createPointerEvent(100, 60),
    mode: 'move',
    gestureHooks: { onBegin },
    interactionRef: { current: null },
    tracks: f.project.tracks,
  });
  expect(onBegin).not.toHaveBeenCalled();
  expect(f.cleanupRef.current).toBeNull();
  dispatchPointerMove(140, 90);
  window.dispatchEvent(new Event('pointerup'));
  expect(f.onUpdateClipTransform).not.toHaveBeenCalled();
});
