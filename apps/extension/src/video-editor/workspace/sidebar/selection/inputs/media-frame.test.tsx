// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../../features/video/project/factories/creation';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoMediaShadowMode,
  VideoProjectClipType,
  type VideoProjectVideoClip,
} from '../../../../../features/video/project/types';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import { MediaFrameControls } from './media-frame';

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
  locked = false
) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  const clip = createClip();
  await act(async () => {
    root?.render(
      <MediaFrameControls
        clip={clip}
        locked={locked}
        onApplyMediaClipVisualsToTrack={handlers.onApplyMediaClipVisualsToTrack ?? vi.fn()}
        onUpdateMediaClipFitMode={handlers.onUpdateMediaClipFitMode ?? vi.fn()}
        onUpdateMediaClipFitScalePercent={handlers.onUpdateMediaClipFitScalePercent ?? vi.fn()}
        onUpdateMediaClipShadowIntensity={handlers.onUpdateMediaClipShadowIntensity ?? vi.fn()}
        onUpdateMediaClipShadowMode={handlers.onUpdateMediaClipShadowMode ?? vi.fn()}
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
    await renderHarness();

    const applyButton = Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
      button.className.includes('self-end whitespace-nowrap')
    );

    expect(container?.textContent).toContain('Вписывание');
    expect(container?.textContent).toContain('Масштаб');
    expect(applyButton).toBeDefined();
    expect(applyButton?.className).toContain('hover:bg-[color:color-mix');
    expect(applyButton?.className).toContain('rounded-[12px]');
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
      container?.querySelector<HTMLButtonElement>('button[title="Свечение"]')?.click();
    });

    expect(onUpdateMediaClipShadowMode).toHaveBeenCalledWith('clip-1', VideoMediaShadowMode.GLOW);
    expect(
      container?.querySelector('[data-ui="shared.ui.compact-inspector.segmented-field"]')
    ).not.toBeNull();
  });
});

describe('workspace-sidebar/selection/media-frame disabled state', () => {
  it('keeps media shadow mode controls disabled for locked tracks', async () => {
    await renderHarness({}, true);

    expect(container?.querySelector<HTMLButtonElement>('button[title="Подложка"]')?.disabled).toBe(
      true
    );
    expect(container?.querySelector<HTMLButtonElement>('button[title="Свечение"]')?.disabled).toBe(
      true
    );
  });
});
