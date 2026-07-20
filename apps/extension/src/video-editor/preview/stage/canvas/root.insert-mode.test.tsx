// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import {
  VideoProjectShapeType,
  type VideoProjectClip,
} from '../../../../features/video/project/types';
import type { PreviewStageRootSurfaceProps } from './types';
import { PreviewStageRootSurface } from './root';
import { createPreviewEffectRuntimeFeedbackTestStub } from '../scene/test-support';
import { createVideoPreviewExactFrameCache } from '../../cache/exact-frame-cache';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  root?.unmount();
  container?.remove();
  root = null;
  container = null;
});

function createCamera(): PreviewStageRootSurfaceProps['camera'] {
  return {
    focusPoint: { x: 100, y: 50 },
    motionBlurAmount: 0,
    regionId: null,
    scale: 1,
    viewportHeight: 100,
    viewportWidth: 200,
    viewportX: 0,
    viewportY: 0,
  };
}

function createProps(
  overrides: Partial<PreviewStageRootSurfaceProps> = {}
): PreviewStageRootSurfaceProps {
  const project = createEmptyVideoProject('Root insert', 200, 100);
  const stageRef = { current: null as HTMLDivElement | null };

  return {
    activeClips: [],
    activeInsertKind: 'shape',
    assetUrls: {},
    audioBankClips: [],
    audioRefs: { current: {} },
    beginInteraction: vi.fn(),
    cachedVideo: null,
    camera: createCamera(),
    canvasRef: { current: null },
    currentTime: 0,
    effectRuntimeFeedback: createPreviewEffectRuntimeFeedbackTestStub(),
    mode: 'editor',
    isPlaying: false,
    onAddShapeOverlay: vi.fn(() => 'shape-clip'),
    onAddTextOverlay: vi.fn(() => 'text-clip'),
    onClearActiveInsertKind: vi.fn(),
    onClearPlacementMode: vi.fn(),
    onGuideChange: vi.fn(),
    onSelectClip: vi.fn(),
    onUpdateActionEventDetails: vi.fn(),
    onUpdateAnnotationClipTemplate: vi.fn(),
    onUpdateClipTransform: vi.fn(),
    onUpdateMotionRegion: vi.fn(),
    placementMode: null,
    previewCacheBypass: false,
    previewExactFrameCache: createVideoPreviewExactFrameCache(1024),
    previewMode: 'live',
    previewRasterSize: { height: 100, width: 200 },
    project,
    selectedActionEvent: null,
    selectedClipId: null,
    selectedMotionRegion: null,
    selectionOverlay: null,
    stageRef,
    stageSizeStyle: { height: 100, width: 200 },
    targetOverlay: null,
    videoBankClips: [],
    videoRefs: { current: {} },
    ...overrides,
  };
}

function pointerEvent(type: string, clientX: number, clientY: number) {
  const event = new MouseEvent(type, {
    bubbles: true,
    clientX,
    clientY,
  });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  return event;
}

function renderRoot(props: PreviewStageRootSurfaceProps) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<PreviewStageRootSurface {...props} />);
  });
  const stage = container.querySelector<HTMLDivElement>('[data-ui="video.preview.stage.root"]');
  vi.spyOn(stage!, 'getBoundingClientRect').mockReturnValue({
    bottom: 200,
    height: 200,
    left: 0,
    right: 400,
    top: 0,
    width: 400,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  return stage!;
}

it('prioritizes active insert tools over existing preview overlays', () => {
  const beginInteraction = vi.fn();
  const props = createProps({
    beginInteraction,
    selectionOverlay: (
      <button
        data-ui="video.preview.existing-overlay"
        onPointerDown={(event) => beginInteraction(event, {} as VideoProjectClip, 'move')}
      />
    ),
  });
  const stage = renderRoot(props);
  const overlay = container?.querySelector<HTMLButtonElement>(
    '[data-ui="video.preview.existing-overlay"]'
  );

  act(() => {
    overlay?.dispatchEvent(pointerEvent('pointerdown', 200, 100));
    stage.dispatchEvent(pointerEvent('pointerup', 220, 120));
  });

  expect(beginInteraction).not.toHaveBeenCalled();
  expect(props.onAddShapeOverlay).toHaveBeenCalledWith(VideoProjectShapeType.RECTANGLE);
});

it('drops pending video insert sessions when active insert is cleared externally', () => {
  const props = createProps();
  const stage = renderRoot(props);

  act(() => {
    stage.dispatchEvent(pointerEvent('pointerdown', 20, 10));
    stage.dispatchEvent(pointerEvent('pointermove', 220, 110));
  });
  expect(
    container?.querySelector('[data-ui="video-editor.preview.insert-preview"]')
  ).not.toBeNull();

  renderRoot({ ...props, activeInsertKind: null });
  expect(container?.querySelector('[data-ui="video-editor.preview.insert-preview"]')).toBeNull();

  act(() => {
    stage.dispatchEvent(pointerEvent('pointerup', 220, 110));
  });
  expect(props.onAddShapeOverlay).not.toHaveBeenCalled();
  expect(props.onUpdateClipTransform).not.toHaveBeenCalled();
});

it('cancels pending video insert sessions when Escape is pressed', () => {
  const props = createProps();
  const stage = renderRoot(props);

  act(() => {
    stage.dispatchEvent(pointerEvent('pointerdown', 20, 10));
    stage.dispatchEvent(pointerEvent('pointermove', 220, 110));
  });
  expect(
    container?.querySelector('[data-ui="video-editor.preview.insert-preview"]')
  ).not.toBeNull();

  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key: 'Escape',
  });
  const preventDefault = vi.spyOn(event, 'preventDefault');
  const stopPropagation = vi.spyOn(event, 'stopPropagation');

  act(() => {
    stage.dispatchEvent(event);
  });

  expect(props.onClearActiveInsertKind).toHaveBeenCalledTimes(1);
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(stopPropagation).toHaveBeenCalledOnce();
  expect(container?.querySelector('[data-ui="video-editor.preview.insert-preview"]')).toBeNull();

  act(() => {
    stage.dispatchEvent(pointerEvent('pointerup', 220, 110));
  });
  expect(props.onAddShapeOverlay).not.toHaveBeenCalled();
  expect(props.onUpdateClipTransform).not.toHaveBeenCalled();
});
