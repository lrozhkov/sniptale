// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../../../features/video/project/factories/creation';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoMediaShadowMode,
  VideoProjectClipType,
  type VideoProjectVideoClip,
  type VideoProjectImageClip,
} from '../../../../../features/video/project/types';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import { MediaFrameControls } from './media-frame';
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
import { acquireWindowHeaderFavicon } from '../../../../../workflows/browser-frame/favicon';

vi.mock('../../../../../workflows/browser-frame/favicon', () => ({
  acquireWindowHeaderFavicon: vi.fn(),
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createClip(): VideoProjectVideoClip {
  const project = createEmptyVideoProject('Media frame');

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

async function renderHarness(
  handlers: Partial<WorkspaceSidebarSelectionPanelProps> = {},
  locked = false,
  clip: VideoProjectVideoClip | VideoProjectImageClip = createClip()
) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  const project = createEmptyVideoProject();
  project.assets = [
    {
      ...createVideoProjectAsset(
        'Source',
        'VIDEO',
        { kind: 'project-asset', projectAssetId: 'source' },
        {
          width: 1920,
          height: 1080,
          duration: 10,
          size: 100,
          mimeType: 'video/mp4',
          hasAudio: false,
          audioPeaks: null,
        }
      ),
      id: clip.assetId,
    },
  ];
  await act(async () => {
    root?.render(
      <MediaFrameControls
        project={project}
        clip={clip}
        locked={locked}
        onApplyMediaClipVisualsToTrack={handlers.onApplyMediaClipVisualsToTrack ?? vi.fn()}
        onUpdateMediaClipFitMode={handlers.onUpdateMediaClipFitMode ?? vi.fn()}
        onUpdateMediaClipFitScalePercent={handlers.onUpdateMediaClipFitScalePercent ?? vi.fn()}
        onUpdateMediaClipShadowIntensity={handlers.onUpdateMediaClipShadowIntensity ?? vi.fn()}
        onUpdateMediaClipShadowMode={handlers.onUpdateMediaClipShadowMode ?? vi.fn()}
        onUpdateMediaClipShadowColor={handlers.onUpdateMediaClipShadowColor ?? vi.fn()}
        {...(handlers.recentColors ? { recentColors: handlers.recentColors } : {})}
        {...(handlers.onRememberRecentColor
          ? { onRememberRecentColor: handlers.onRememberRecentColor }
          : {})}
        onUpdateMediaClipWindowHeader={handlers.onUpdateMediaClipWindowHeader ?? vi.fn()}
      />
    );
  });
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

describe('workspace-sidebar/selection/media-frame', () => {
  it('renders media apply-to-track as a shared compact secondary action', async () => {
    const onApplyMediaClipVisualsToTrack = vi.fn();
    await renderHarness({ onApplyMediaClipVisualsToTrack });

    const applyButton = Array.from(container?.querySelectorAll('button') ?? []).find(
      (button) =>
        button.closest('[data-ui="video-editor.inspector.actions"]') !== null &&
        button.textContent?.includes('Применить к дорожке')
    );

    expect(container?.textContent).toContain('Вписывание');
    expect(container?.textContent).toContain('Масштаб');
    expect(applyButton).toBeDefined();
    expect(applyButton?.getAttribute('data-inspector-tone')).toBe('secondary');
    await act(async () => applyButton?.click());
    expect(onApplyMediaClipVisualsToTrack).toHaveBeenCalledWith('clip-1');
    expect(applyButton?.closest('[data-ui="video-editor.inspector.actions"]')).not.toBeNull();
  });

  it('commits media shadow intensity through the media frame controls', async () => {
    const onUpdateMediaClipShadowIntensity = vi.fn();
    const onUpdateMediaClipShadowMode = vi.fn();

    await renderHarness({
      onUpdateMediaClipShadowIntensity,
      onUpdateMediaClipShadowMode,
    });

    const shadowInput = Array.from(
      container?.querySelectorAll<HTMLInputElement>('input[type="range"]') ?? []
    ).at(-1);
    expect(shadowInput).toBeDefined();
    expect(container?.textContent).toContain('Тень');
    expect(container?.textContent).toContain('Режим тени');

    await act(async () => {
      setInputValue(shadowInput!, '42');
    });

    expect(onUpdateMediaClipShadowIntensity).toHaveBeenCalledWith('clip-1', 42);

    await act(async () => {
      const glow = Array.from(
        container?.querySelectorAll<HTMLButtonElement>(
          '[role="group"][aria-label="Режим тени"] button'
        ) ?? []
      ).find((option) => option.textContent?.includes('Свечение'));
      expect(glow).toBeDefined();
      glow?.click();
    });

    expect(onUpdateMediaClipShadowMode).toHaveBeenCalledWith('clip-1', VideoMediaShadowMode.GLOW);
    expect(
      container?.querySelector('[data-ui="shared.ui.compact-inspector.select-field"]')
    ).not.toBeNull();
  });
});

describe('workspace-sidebar/selection/media-frame disabled state', () => {
  it('keeps media shadow mode controls disabled for locked tracks', async () => {
    await renderHarness({}, true);

    const choices = [
      ...container!.querySelectorAll<HTMLButtonElement>(
        '[role="group"][aria-label="Режим тени"] button'
      ),
    ];
    expect(choices).toHaveLength(2);
    expect(choices.every((button) => button.disabled)).toBe(true);
  });
});

it('applies a framing preset with one command and keeps exact controls folded', async () => {
  const onUpdateMediaClipFitMode = vi.fn();
  await renderHarness({ onUpdateMediaClipFitMode });
  const preset = container?.querySelector<HTMLButtonElement>(
    '[data-ui="video-editor.framing-presets"] button[aria-label="На фоне"]'
  );
  expect(preset).not.toBeNull();
  await act(async () => preset?.click());
  expect(onUpdateMediaClipFitMode).toHaveBeenCalledExactlyOnceWith(
    'clip-1',
    VideoMediaFitMode.CONTAIN,
    88
  );
  expect(container?.querySelector('details')?.open).toBe(false);
});

it('cancels a pending favicon when selection changes to another clip with the same URL', async () => {
  let finish: ((icon: string) => void) | undefined;
  vi.mocked(acquireWindowHeaderFavicon).mockImplementation(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      })
  );
  const onUpdateMediaClipWindowHeader = vi.fn();
  const first = {
    ...createClip(),
    windowHeader: { ...DEFAULT_WINDOW_HEADER, faviconEnabled: true, url: 'https://example.org' },
  };
  await renderHarness({ onUpdateMediaClipWindowHeader }, false, first);
  const address = container!.querySelector<HTMLInputElement>('input[placeholder="example.com"]')!;
  await act(async () => setInputValue(address, 'https://other.example.org'));
  await act(async () => address.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));

  expect(acquireWindowHeaderFavicon).toHaveBeenCalledOnce();
  const signal = vi.mocked(acquireWindowHeaderFavicon).mock.calls[0]?.[1];
  expect(signal?.aborted).toBe(false);
  await renderHarness({ onUpdateMediaClipWindowHeader }, false, { ...first, id: 'clip-2' });
  expect(signal?.aborted).toBe(true);
  await act(async () => {
    finish?.('data:image/png;base64,late-icon');
  });
  expect(onUpdateMediaClipWindowHeader).toHaveBeenCalledTimes(1);
});

it.each(['VIDEO', 'IMAGE'] as const)(
  'edits dormant %s shadow color through the shared field and cancels without a command',
  async (type) => {
    const clip = type === 'IMAGE' ? { ...createClip(), type: 'IMAGE' as const } : createClip();
    const onUpdateMediaClipShadowColor = vi.fn();
    const onRememberRecentColor = vi.fn(async () => {});
    await renderHarness(
      {
        onUpdateMediaClipShadowColor,
        onRememberRecentColor,
        recentColors: ['#abcdef'],
      },
      false,
      clip
    );
    const trigger = () =>
      container!.querySelector<HTMLButtonElement>(
        '[data-ui="video-editor.media-shadow"] [data-ui="shared.ui.color-selector.value-trigger"]'
      )!;
    await act(async () => trigger().click());
    let input = container!.querySelector<HTMLInputElement>('input[aria-label="Цвет тени"]')!;
    await act(async () => {
      setInputValue(input, '#00ff00');
    });
    await act(async () =>
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    );
    expect(onUpdateMediaClipShadowColor).not.toHaveBeenCalled();
    expect(onRememberRecentColor).not.toHaveBeenCalled();
    await act(async () => trigger().click());
    input = container!.querySelector<HTMLInputElement>('input[aria-label="Цвет тени"]')!;
    await act(async () => {
      setInputValue(input, '#12abef');
    });
    await act(async () =>
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    );
    expect(onUpdateMediaClipShadowColor).toHaveBeenCalledExactlyOnceWith('clip-1', '#12abef');
    expect(onRememberRecentColor).toHaveBeenCalledExactlyOnceWith('#12abef');
    await renderHarness({ onUpdateMediaClipShadowColor }, true, clip);
    expect(
      container!.querySelector(
        '[data-ui="video-editor.media-shadow"] [data-ui="shared.ui.color-selector.value-trigger"]'
      )
    ).toBeNull();
  }
);
