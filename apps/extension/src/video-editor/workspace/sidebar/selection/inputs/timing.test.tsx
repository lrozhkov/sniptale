// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoProjectClipType,
  type VideoProjectAudioClip,
  type VideoProjectVideoClip,
} from '../../../../../features/video/project/types';
import {
  getPlaybackRateSliderProps,
  mapSliderValueToPlaybackRate,
} from '../../../../runtime/playback/rate-slider';
import { renderAudioFields, renderClipTimingFields, renderTransformFields } from './timing';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function createVideoClip(): VideoProjectVideoClip {
  return {
    id: 'video-1',
    trackId: 'track-1',
    type: VideoProjectClipType.VIDEO,
    name: 'Video',
    assetId: 'asset-1',
    fitMode: VideoMediaFitMode.CONTAIN,
    sourceStart: 0,
    sourceDuration: 10,
    groupId: null,
    linkMode: VideoClipLinkMode.LINKED,
    startTime: 0,
    duration: 10,
    muted: false,
    volume: 80,
    fadeInMs: 0,
    fadeOutMs: 0,
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    transform: { x: 0, y: 0, width: 640, height: 360, rotation: 0, opacity: 1 },
  };
}

function createAudioClip(): VideoProjectAudioClip {
  return {
    id: 'audio-1',
    trackId: 'track-a',
    type: VideoProjectClipType.AUDIO,
    name: 'Audio',
    assetId: 'asset-a',
    sourceStart: 0,
    sourceDuration: 10,
    groupId: null,
    linkMode: VideoClipLinkMode.LINKED,
    startTime: 0,
    duration: 10,
    muted: false,
    volume: 50,
    fadeInMs: 0,
    fadeOutMs: 0,
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    transform: { x: 0, y: 0, width: 640, height: 360, rotation: 0, opacity: 1 },
  };
}

async function renderNode(node: ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<div>{node}</div>);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('HTMLElement', class HTMLElement {});
  vi.stubGlobal('ShadowRoot', class ShadowRoot {});
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

async function verifyTransformFields() {
  const onUpdateClipTransform = vi.fn();
  await renderNode(renderTransformFields(createVideoClip(), false, onUpdateClipTransform));

  const input = container?.querySelector('input[value="640"]') as HTMLInputElement | null;
  const opacityRange = Array.from(
    container?.querySelectorAll<HTMLInputElement>('input[type="range"]') ?? []
  ).find((item) => item.getAttribute('max') === '100');
  expect(input).not.toBeNull();
  expect(container?.textContent).toContain('Поворот');
  expect(opacityRange?.getAttribute('max')).toBe('100');

  await act(async () => {
    setInputValue(input!, '700');
    input!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  });

  expect(onUpdateClipTransform).toHaveBeenCalledWith('video-1', { width: 700 });

  await act(async () => {
    setInputValue(opacityRange!, '55');
  });

  expect(onUpdateClipTransform).toHaveBeenCalledWith('video-1', { opacity: 0.55 });
}

async function verifyTimingFields() {
  const onUpdateClipPlaybackRate = vi.fn();
  await renderNode(
    renderClipTimingFields(createVideoClip(), false, vi.fn(), onUpdateClipPlaybackRate)
  );

  const fitModeButton = container?.querySelector(
    'button[aria-haspopup="listbox"]'
  ) as HTMLButtonElement | null;
  const playbackRateInput = container?.querySelector(
    'input[type="range"][max="100"]'
  ) as HTMLInputElement | null;
  expect(fitModeButton).toBeNull();
  expect(playbackRateInput).not.toBeNull();
  expect(container?.textContent).not.toContain('Вписывание');

  await act(async () => {
    setInputValue(playbackRateInput!, String(getPlaybackRateSliderProps(2.4).value));
  });

  expect(onUpdateClipPlaybackRate).toHaveBeenCalledWith('video-1', 2.4);

  await act(async () => {
    setInputValue(playbackRateInput!, '0');
  });

  expect(mapSliderValueToPlaybackRate(0)).toBe(0.1);
  expect(onUpdateClipPlaybackRate).toHaveBeenCalledWith('video-1', 0.1);
}

async function verifyAudioControls() {
  const onUpdateClipMuted = vi.fn();
  await renderNode(
    renderAudioFields(
      createAudioClip(),
      null,
      {
        ...createVideoClip(),
        trackId: 'track-video',
      },
      false,
      onUpdateClipMuted,
      vi.fn(),
      vi.fn()
    )
  );

  const muteToggle = container?.querySelector<HTMLButtonElement>(
    '[data-ui="shared.ui.compact-inspector.option-row"]'
  );
  expect(muteToggle).not.toBeNull();

  await act(async () => {
    muteToggle!.click();
  });

  expect(onUpdateClipMuted).toHaveBeenCalledWith('audio-1', true);
}

describe('workspace sidebar timing/audio helpers', () => {
  it('renders transform fields for visual clips', verifyTransformFields);

  it('renders timing fields without media frame controls', verifyTimingFields);

  it('renders audio controls for linked audio clips', verifyAudioControls);
});
