import { DEFAULT_WINDOW_HEADER } from '../../features/browser-frame/header';
// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import {
  ReviewCanvasSettings,
  ReviewSceneAudio,
  ReviewWindowHeaderSettings,
} from './scene-inspector';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import type {
  QuickEditCanvasSize,
  QuickEditWindowHeader,
} from '../../features/video/review/advanced/types';
import { translate } from '../../platform/i18n';

it('selects aspect and resolution, returns to native, and edits a lane master separately', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const changed = vi.fn();
  const volume = vi.fn();
  const audio = createQuickEditAdvancedState().audio;
  audio.music = [
    {
      id: 'm',
      assetId: 'm',
      timelineStart: 0,
      sourceOffset: 0,
      duration: 4,
      volume: 0.8,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    },
  ];
  function Harness() {
    const [canvas, setCanvas] = useState<QuickEditCanvasSize>();
    return (
      <>
        <ReviewCanvasSettings
          source={{ width: 1920, height: 1080 }}
          canvas={canvas}
          onChange={(next) => {
            changed(next);
            setCanvas(next);
          }}
        />
        <ReviewSceneAudio
          audio={audio}
          hasOriginalAudio={false}
          onOriginal={vi.fn()}
          onLaneVolume={volume}
        />
      </>
    );
  }
  const choose = async (label: string, text: string) => {
    await act(async () =>
      host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click()
    );
    const option = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).find(
      (item) => item.textContent === text
    )!;
    expect(option).toBeTruthy();
    await act(async () => option.click());
  };
  try {
    await act(async () => root.render(<Harness />));
    await choose(translate('videoEditor.sidebar.canvasFormatLabel'), '9:16');
    expect(changed).toHaveBeenLastCalledWith({ width: 1080, height: 1920 });
    await choose(translate('videoEditor.sidebar.canvasResolutionLabel'), '720 × 1280');
    expect(changed).toHaveBeenLastCalledWith({ width: 720, height: 1280 });
    await choose(
      translate('videoEditor.sidebar.canvasFormatLabel'),
      translate('gallery.videoReview.canvasSource')
    );
    expect(changed).toHaveBeenLastCalledWith(undefined);
    expect(
      host.querySelector(`input[aria-label="${translate('gallery.videoReview.audioOriginal')}"]`)
    ).toBeNull();
    const field = host.querySelector<HTMLInputElement>(
      `input[aria-label="${translate('gallery.videoReview.audioMusic')}"]`
    )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, '35');
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    expect(volume).toHaveBeenCalledWith('music', 0.35);
    expect(audio.music[0]?.volume).toBe(0.8);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('edits browser title and address independently and bounds Unicode text safely', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const changed = vi.fn();
  function Harness() {
    const [header, setHeader] = useState<QuickEditWindowHeader>({
      ...DEFAULT_WINDOW_HEADER,
      kind: 'browser' as const,
      title: 'Legacy',
    });
    return (
      <ReviewWindowHeaderSettings
        header={header}
        onChange={(next) => {
          changed(next);
          if (next) setHeader(next);
        }}
      />
    );
  }
  const edit = async (index: number, value: string) => {
    const field = host.querySelectorAll<HTMLInputElement>('input:not([type=checkbox])')[index]!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value);
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  try {
    await act(async () => root.render(<Harness />));
    expect(host.querySelectorAll<HTMLInputElement>('input:not([type=checkbox])')[1]!.value).toBe(
      ''
    );
    await edit(1, 'https://site.test/😀');
    expect(changed).toHaveBeenLastCalledWith({
      ...DEFAULT_WINDOW_HEADER,
      kind: 'browser' as const,
      title: 'Legacy',
      url: 'https://site.test/😀',
    });
    await edit(0, 'New title');
    expect(changed).toHaveBeenLastCalledWith({
      ...DEFAULT_WINDOW_HEADER,
      kind: 'browser' as const,
      title: 'New title',
      url: 'https://site.test/😀',
    });
    await edit(1, 'x'.repeat(2047) + '😀');
    expect(changed.mock.lastCall?.[0].url).toBe('x'.repeat(2047));
    await edit(0, 't'.repeat(511) + '😀');
    expect(changed.mock.lastCall?.[0].title).toBe('t'.repeat(511));
    await edit(1, '');
    expect(changed.mock.lastCall?.[0]).toEqual({
      ...DEFAULT_WINDOW_HEADER,
      kind: 'browser' as const,
      title: 't'.repeat(511),
      url: '',
    });
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
