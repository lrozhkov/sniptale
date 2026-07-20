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

  beginPreviewStageInteraction({
    camera,
    clip,
    cleanupRef: { current: null } as never,
    event: createPointerEvent(10, 10),
    interactionRef: { current: null } as never,
    mode: 'move',
    onSelectClip: vi.fn(),
    onUpdateClipTransform,
    project,
    stage: document.createElement('div'),
    tracks: project.tracks,
  });

  dispatchPointerMove(40, 40);

  expect(onUpdateClipTransform).not.toHaveBeenCalled();
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
