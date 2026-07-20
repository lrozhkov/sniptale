// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../../features/video/project/factories/creation';
import { mapSliderValueToPlaybackRate } from '../../../../runtime/playback/rate-slider';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoProjectClipType,
  type VideoProjectVideoClip,
} from '../../../../../features/video/project/types';
import { ClipTimingControls } from './clip-timing';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
type UpdatePlaybackRate = (clipId: string, playbackRate: number) => void;

function createClip(): VideoProjectVideoClip {
  const project = createEmptyVideoProject('Clip timing');

  return {
    assetId: 'asset-1',
    duration: 10,
    fadeInMs: 0,
    fadeOutMs: 0,
    fitMode: VideoMediaFitMode.CONTAIN,
    fitScalePercent: 100,
    groupId: null,
    id: 'clip-1',
    linkMode: VideoClipLinkMode.DETACHED,
    muted: false,
    name: 'Clip 1',
    playbackRate: 1,
    shadowIntensity: 0,
    sourceDuration: 10,
    sourceStart: 0,
    startTime: 0,
    trackId: project.tracks[0]!.id,
    transform: { height: 100, opacity: 1, rotation: 0, width: 100, x: 0, y: 0 },
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    type: VideoProjectClipType.VIDEO,
    volume: 1,
  };
}

function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

async function renderHarness(onUpdateClipPlaybackRate: UpdatePlaybackRate, locked = false) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  const clip = createClip();

  await act(async () => {
    root?.render(
      <ClipTimingControls {...createPanelProps(clip, onUpdateClipPlaybackRate)} locked={locked} />
    );
  });
}

function createPanelActionProps(onUpdateClipPlaybackRate: UpdatePlaybackRate) {
  return {
    onAddActionEvent: vi.fn(),
    onAddMotionRegion: vi.fn(),
    onApplyMediaClipVisualsToTrack: vi.fn(),
    onClearCursorSampleSkinOverride: vi.fn(),
    onClearPlacementMode: vi.fn(),
    onDeleteActionEvent: vi.fn(),
    onDeleteCursorSample: vi.fn(),
    onDeleteMotionRegion: vi.fn(),
    onDetachClipGroup: vi.fn(),
    onEnableCursorTrack: vi.fn(),
    onInsertCursorSample: vi.fn(),
    onPreviewSceneBackground: vi.fn(),
    onResizeProject: vi.fn(),
    onRememberRecentColor: vi.fn(async () => undefined),
    onResetSceneBackgroundPreview: vi.fn(),
    onSetCursorCaptureMode: vi.fn(),
    onSetSceneBackground: vi.fn(),
    onStartActionPointPlacement: vi.fn(),
    onStartMotionAreaPlacement: vi.fn(),
    onStartMotionFocusPlacement: vi.fn(),
    onUpdateActionEventDetails: vi.fn(),
    onUpdateClipAudioEnvelope: vi.fn(),
    onUpdateClipFades: vi.fn(),
    onUpdateClipMuted: vi.fn(),
    onUpdateClipPlaybackRate,
    onUpdateClipTransform: vi.fn(),
    onUpdateClipVolume: vi.fn(),
    onUpdateCursorSampleInterpolation: vi.fn(),
    onUpdateCursorSampleSkinOverride: vi.fn(),
    onUpdateCursorSampleVisibility: vi.fn(),
    onUpdateCursorSkin: vi.fn(),
    onUpdateMediaClipFitMode: vi.fn(),
    onUpdateMediaClipFitScalePercent: vi.fn(),
    onUpdateMediaClipShadowIntensity: vi.fn(),
    onUpdateMediaClipShadowMode: vi.fn(),
    onUpdateMotionRegion: vi.fn(),
    onUpdateShapeStyle: vi.fn(),
    onUpdateTextContent: vi.fn(),
    onUpdateTextStyle: vi.fn(),
    onUpdateTransitionDuration: vi.fn(),
    onUpdateTransitionEasing: vi.fn(),
    onUpdateTransitionTemplate: vi.fn(),
  };
}

function createPanelProps(
  clip: VideoProjectVideoClip,
  onUpdateClipPlaybackRate: UpdatePlaybackRate
) {
  return {
    ...createPanelActionProps(onUpdateClipPlaybackRate),
    clip,
    locked: false,
    placementMode: null,
    project: createEmptyVideoProject('Clip timing'),
    recentColors: [],
    selectedActionEvent: null,
    selectedClip: clip,
    selectedCursorSample: null,
    selectedMotionRegion: null,
    selectedTrack: null,
    selectedTransition: null,
    selection: { kind: 'scene' } as const,
  };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('workspace-sidebar/selection/clip-timing', () => {
  it('keeps media frame controls out of the timing section', async () => {
    await renderHarness(vi.fn());

    expect(container?.textContent).not.toContain('Вписывание');
    expect(container?.textContent).not.toContain('Масштаб');
    expect(container?.textContent).not.toContain('Тень');
    expect(container?.textContent).not.toContain('Режим тени');
  });

  it('commits manual playback rates below 1x through the canonical slider', async () => {
    const onUpdateClipPlaybackRateMock = vi.fn();
    const onUpdateClipPlaybackRate: UpdatePlaybackRate = onUpdateClipPlaybackRateMock;

    await renderHarness(onUpdateClipPlaybackRate);

    const playbackRateInput = Array.from(
      container?.querySelectorAll<HTMLInputElement>('input[type="range"]') ?? []
    ).find((input) => input.getAttribute('max') === '100');
    const playbackRateValueInput = Array.from(
      container?.querySelectorAll<HTMLInputElement>('input[type="text"]') ?? []
    ).find((input) => input.value === '1');
    expect(playbackRateInput).toBeDefined();
    expect(playbackRateValueInput?.value).toBe('1');
    expect(container?.textContent).toContain('x');

    await act(async () => {
      setInputValue(playbackRateInput!, '0');
    });

    expect(mapSliderValueToPlaybackRate(0)).toBe(0.1);
    expect(onUpdateClipPlaybackRateMock).toHaveBeenCalledWith('clip-1', 0.1);
  });
});
