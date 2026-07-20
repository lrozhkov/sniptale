// @vitest-environment jsdom

import type React from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

const { handleStageAreaPlacementMock, handleStagePointPlacementMock, handleStagePointerDownMock } =
  vi.hoisted(() => ({
    handleStageAreaPlacementMock: vi.fn(),
    handleStagePointPlacementMock: vi.fn(),
    handleStagePointerDownMock: vi.fn(),
  }));

vi.mock('../area-overlay/index', () => ({
  PreviewStageMotionAreaOverlay: () => null,
  handleStageAreaPlacement: handleStageAreaPlacementMock,
}));

vi.mock('../motion-path/index', () => ({
  PreviewStageMotionPathOverlay: () => null,
}));

vi.mock('../point-overlay/index', () => ({
  PreviewStagePointOverlay: () => null,
  handleStagePointPlacement: handleStagePointPlacementMock,
}));

vi.mock('./selection-overlay', () => ({
  PreviewStageSelectionOverlay: () => null,
  handleStagePointerDown: handleStagePointerDownMock,
}));
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { handlePreviewStageRootPointerDown } from './layers';

beforeEach(() => {
  vi.clearAllMocks();
});

function createPointerParams(
  overrides: Partial<Parameters<typeof handlePreviewStageRootPointerDown>[1]> = {}
): Parameters<typeof handlePreviewStageRootPointerDown>[1] {
  return {
    activeClips: [],
    beginInteraction: vi.fn(),
    camera: {
      focusPoint: { x: 0, y: 0 },
      motionBlurAmount: 0,
      regionId: null,
      scale: 1,
      viewportHeight: 100,
      viewportWidth: 100,
      viewportX: 0,
      viewportY: 0,
    },
    mode: 'editor',
    onClearPlacementMode: vi.fn(),
    onSelectClip: vi.fn(),
    onUpdateActionEventDetails: vi.fn(),
    onUpdateMotionRegion: vi.fn(),
    placementMode: null,
    project: createEmptyVideoProject('Canvas', 100, 100),
    selectedActionEvent: null,
    selectedMotionRegion: null,
    stageRef: { current: document.createElement('div') },
    ...overrides,
  };
}

function createPointerEvent() {
  return {
    clientX: 10,
    clientY: 20,
    target: document.createElement('div'),
  } as unknown as React.PointerEvent<HTMLDivElement>;
}

it('stops pointer routing in player mode', () => {
  handlePreviewStageRootPointerDown(createPointerEvent(), createPointerParams({ mode: 'player' }));

  expect(handleStageAreaPlacementMock).not.toHaveBeenCalled();
  expect(handleStagePointPlacementMock).not.toHaveBeenCalled();
  expect(handleStagePointerDownMock).not.toHaveBeenCalled();
});

it('stops after the area placement handler consumes the pointer event', () => {
  handleStageAreaPlacementMock.mockReturnValue(true);

  handlePreviewStageRootPointerDown(createPointerEvent(), createPointerParams());

  expect(handleStageAreaPlacementMock).toHaveBeenCalledOnce();
  expect(handleStagePointPlacementMock).not.toHaveBeenCalled();
  expect(handleStagePointerDownMock).not.toHaveBeenCalled();
});

it('falls through to the selection handler after area and point handlers decline', () => {
  handleStageAreaPlacementMock.mockReturnValue(false);
  handleStagePointPlacementMock.mockReturnValue(false);

  handlePreviewStageRootPointerDown(createPointerEvent(), createPointerParams());

  expect(handleStageAreaPlacementMock).toHaveBeenCalledOnce();
  expect(handleStagePointPlacementMock).toHaveBeenCalledOnce();
  expect(handleStagePointerDownMock).toHaveBeenCalledOnce();
});
