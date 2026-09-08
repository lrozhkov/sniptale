// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { createEffectHostClip } from '../../../../features/video/project/factories/overlay-clip';
import { VideoMotionOverlayZoomMode } from '../../../../features/video/project/types';
import { createVideoPreviewExactFrameCache } from '../../cache/exact-frame-cache';
import { PreviewStageCanvas } from './index';
import { createPreviewStageSelectionOverlay } from './root';
import type { PreviewStageCanvasProps } from '../types';
vi.mock('./root', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./root')>()),
  PreviewStageRoot: (props: ComponentProps<typeof import('./root').PreviewStageRoot>) => (
    <div>{props.selectionOverlay}</div>
  ),
}));
let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.restoreAllMocks();
});
function fixture(): PreviewStageCanvasProps {
  const project = createEmptyVideoProject('Handles');
  const clip = createEffectHostClip({
    effectInstanceId: 'effect',
    name: 'Callout',
    duration: 4,
    startTime: 0,
    trackId: project.tracks[0]!.id,
    projectWidth: 1920,
    projectHeight: 1080,
    objectLayout: { width: 380, height: 120, resize: 'scale' },
  });
  const source = readFileSync(
    new URL(
      '../../../../../../../packages/runtime-contracts/src/effect-v1/fixtures/collection/' +
        'sniptale-callout-light.sniptale-effect.json',
      import.meta.url
    ),
    'utf8'
  );
  project.clips = [clip];
  project.effectSnapshots = [
    {
      id: 'snapshot',
      sha256: '0'.repeat(64),
      source,
      assets: [],
      documentId: 'sniptale-callout-light',
      kind: 'standalone',
      schemaVersion: 'sniptale.effect.v1',
      retainedByteLength: source.length,
    },
  ];
  project.effectInstances = [
    {
      id: 'effect',
      snapshotId: 'snapshot',
      kind: 'standalone',
      target: { kind: 'scene' },
      duration: 4,
      startTime: 0,
      playbackRate: 1,
      enabled: true,
      controls: {},
      sceneAnchors: { tip: { x: 100, y: 80 } },
    },
  ];
  const stage = document.createElement('div');
  vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1920, 1080));
  return {
    project,
    selectedClip: clip,
    selectedClipId: clip.id,
    selectedClipLocked: false,
    mode: 'editor',
    camera: {
      focusPoint: { x: 960, y: 540 },
      scale: 1,
      viewportWidth: 1920,
      viewportHeight: 1080,
      viewportX: 0,
      viewportY: 0,
      motionBlurAmount: 0,
      overlayZoomMode: VideoMotionOverlayZoomMode.LOCK_OVERLAYS,
      regionId: null,
    },
    stageRef: { current: stage },
    stageSizeStyle: {},
    activeInsertKind: null,
    activeClips: [clip],
    audioBankClips: [],
    videoBankClips: [],
    audioRefs: { current: {} },
    videoRefs: { current: {} },
    assetUrls: {},
    beginInteraction: vi.fn(),
    cachedVideo: null,
    currentTime: 0,
    isPlaying: false,
    effectRuntimeFeedback: {
      failed: false,
      onFailure: vi.fn(),
      onRecovery: vi.fn(),
      onRetry: vi.fn(),
      retryVersion: 0,
    },
    onClearActiveInsertKind: vi.fn(),
    onClearPlacementMode: vi.fn(),
    onSelectClip: vi.fn(),
    onUpdateActionEventDetails: vi.fn(),
    onUpdateMotionRegion: vi.fn(),
    onAddShapeOverlay: () => null,
    onAddTextOverlay: () => null,
    onUpdateClipTransform: vi.fn(),
    onUpdateAnnotationClipTemplate: vi.fn(),
    onUpdateEffectInstance: vi.fn(),
    onPreviewEffectAnchors: vi.fn(),
    placementMode: null,
    previewRasterSize: { width: 1920, height: 1080 },
    previewMode: 'live',
    previewCacheBypass: false,
    previewExactFrameCache: createVideoPreviewExactFrameCache(),
    selectedActionOccurrence: null,
    selectedMotionRegion: null,
  };
}
function render(props: PreviewStageCanvasProps) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root!.render(<PreviewStageCanvas {...props} />));
}
function pointer(target: EventTarget, type: string, x: number, y: number) {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  act(() => target.dispatchEvent(event));
}
it('previews an independent handle gesture and commits once without changing the body', () => {
  const props = fixture();
  render(props);
  const handle = container!.querySelector<HTMLButtonElement>('[data-effect-handle="tip"]')!;
  expect(handle).not.toBeNull();
  expect(parseFloat(handle.style.left)).toBeCloseTo((100 / 1920) * 100, 8);
  handle.setPointerCapture = vi.fn();
  handle.hasPointerCapture = () => false;
  pointer(handle, 'pointerdown', 100, 80);
  pointer(window, 'pointermove', 200, 120);
  expect(props.onPreviewEffectAnchors).toHaveBeenCalledWith('effect', { tip: { x: 200, y: 120 } });
  expect(props.onUpdateEffectInstance).not.toHaveBeenCalled();
  pointer(window, 'pointerup', 200, 120);
  expect(props.onUpdateEffectInstance).toHaveBeenCalledExactlyOnceWith('effect', {
    sceneAnchors: { tip: { x: 200, y: 120 } },
  });
  expect(props.onUpdateClipTransform).not.toHaveBeenCalled();
  expect(props.onPreviewEffectAnchors).toHaveBeenLastCalledWith('effect', null);
});
it('cancels a handle gesture with Escape and hides editing handles in a player or locked track', () => {
  const props = fixture();
  render(props);
  const handle = container!.querySelector<HTMLButtonElement>('[data-effect-handle="tip"]')!;
  handle.setPointerCapture = vi.fn();
  handle.hasPointerCapture = () => false;
  pointer(handle, 'pointerdown', 100, 80);
  pointer(window, 'pointermove', 400, 200);
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(props.onUpdateEffectInstance).not.toHaveBeenCalled();
  expect(props.onPreviewEffectAnchors).toHaveBeenLastCalledWith('effect', null);
  act(() => root!.render(<PreviewStageCanvas {...props} selectedClipLocked />));
  expect(container!.querySelector('[data-effect-handle]')).toBeNull();
  expect(createPreviewStageSelectionOverlay({ ...props, mode: 'player' })).toBeNull();
});
