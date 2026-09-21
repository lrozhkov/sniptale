// @vitest-environment jsdom

import { REVIEW_SPEED_RATES } from '../../features/video/review/speed';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import {
  ReviewEditActions,
  ReviewTimelineTools,
  ReviewFragmentAction,
  ReviewSpeedOptions,
  ReviewRenderOptions,
} from './edit-actions';
import { translate } from '../../platform/i18n';

it('offers a fragment only for a retained range and blocks it during pending edits', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const onDownload = vi.fn();
  const index = {
    duration: 6,
    boundaries: [0, 2, 4, 6],
    videoCodec: 'vp8' as const,
    audioCodec: null,
    container: 'webm' as const,
    rotation: 0 as const,
  };
  const selection = { kind: 'range' as const, start: 2, end: 4 };
  const props = { index, selection, edits: [], busy: false, onDownload };
  try {
    act(() =>
      root.render(<ReviewFragmentAction {...props} selection={{ kind: 'point', time: 2 }} />)
    );
    expect(host.querySelector('button')).toBeNull();
    act(() => root.render(<ReviewFragmentAction {...props} />));
    act(() => host.querySelector('button')!.click());
    expect(onDownload).toHaveBeenCalledWith(selection);
    act(() => root.render(<ReviewFragmentAction {...props} busy />));
    expect(host.querySelector('button')?.disabled).toBe(true);
    act(() =>
      root.render(
        <ReviewFragmentAction
          {...props}
          edits={[{ id: 'cut', kind: 'cut', start: 2, end: 4, requestedStart: 2, requestedEnd: 4 }]}
        />
      )
    );
    expect(host.querySelector('button')?.disabled).toBe(true);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
it('prevents invalid cuts and keeps cancellation reachable only before publication', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const cancel = vi.fn();
  const props = {
    indexing: false,
    checkingCodecs: false,
    available: true,
    cutting: true,
    cut: null,
    selected: null,
    hasEdits: true,
    busy: false,
    phase: 'exporting' as const,
    progress: 25,
    failed: false,
    hasResult: false,
    onToggle: vi.fn(),
    onCut: vi.fn(),
    onRemove: vi.fn(),
    onExport: vi.fn(),
    onCancel: cancel,
    onDownload: vi.fn(),
  };
  const button = (key: Parameters<typeof translate>[0]) =>
    host.querySelector<HTMLButtonElement>(`[aria-label="${translate(key)}"]`);
  try {
    act(() => root.render(<ReviewEditActions {...props} />));
    expect(button('gallery.videoReview.applyCut')).toBeNull();
    expect(button('gallery.videoReview.downloadVideo')?.disabled).toBe(true);
    act(() => button('gallery.videoReview.cancelExport')!.click());
    expect(cancel).toHaveBeenCalledOnce();
    act(() => root.render(<ReviewEditActions {...props} phase="publishing" />));
    expect(button('gallery.videoReview.cancelExport')).toBeNull();
    expect(button('gallery.videoReview.exportVideo')?.disabled).toBe(true);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('edits selected speed properties and blocks unavailable editing tools', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const props = {
    mode: 'speed' as const,
    available: true,
    busy: false,
    rate: 2,
    audio: 'speed' as const,
    selected: true,
    onPointer: vi.fn(),
    onToggle: vi.fn(),
    onRemove: vi.fn(),
    onRate: vi.fn(),
    onAudio: vi.fn(),
  };
  const button = (key: Parameters<typeof translate>[0]) =>
    host.querySelector<HTMLButtonElement>(`[aria-label="${translate(key)}"]`)!;
  try {
    act(() => root.render(<ReviewTimelineTools {...props} />));
    act(() => button('gallery.videoReview.pointerTool').click());
    expect(props.onPointer).toHaveBeenCalledOnce();
    act(() => button('gallery.videoReview.cutMode').click());
    expect(props.onToggle).toHaveBeenLastCalledWith('cut');
    act(() => button('gallery.videoReview.speedMode').click());
    expect(props.onToggle).toHaveBeenLastCalledWith('speed');
    const [rate, audio] = Array.from(
      host.querySelectorAll<HTMLButtonElement>('[aria-haspopup="listbox"]')
    );
    for (const [index] of REVIEW_SPEED_RATES.entries()) {
      act(() => rate!.click());
      act(() => document.querySelectorAll<HTMLButtonElement>('[role="option"]')[index]!.click());
    }
    expect(props.onRate.mock.calls.map(([rate]) => rate)).toEqual([...REVIEW_SPEED_RATES]);
    act(() => audio!.click());
    act(() => document.querySelectorAll<HTMLButtonElement>('[role="option"]')[1]!.click());
    expect(props.onAudio).toHaveBeenCalledWith('mute');
    act(() => button('gallery.videoReview.removeEdit').click());
    expect(props.onRemove).toHaveBeenCalledOnce();
    act(() => root.render(<ReviewTimelineTools {...props} busy />));
    expect(rate!.disabled).toBe(true);
    expect(audio!.disabled).toBe(true);
    act(() => button('gallery.videoReview.cutMode').click());
    expect(props.onToggle).toHaveBeenCalledTimes(2);
    act(() =>
      root.render(<ReviewTimelineTools {...props} mode={null} available={false} selected={false} />)
    );
    expect(host.querySelector('select')).toBeNull();
    expect(button('gallery.videoReview.speedMode').disabled).toBe(true);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('offers independent initial downloads and shows actionable processing failure', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const props = {
    available: false,
    busy: false,
    phase: 'idle' as const,
    progress: 0,
    failed: false,
    hasResult: false,
    hasEdits: false,
    onExport: vi.fn(),
    onCancel: vi.fn(),
    onDownload: vi.fn(),
  };
  const download = () =>
    host.querySelector<HTMLButtonElement>(
      `[aria-label="${translate('gallery.videoReview.downloadVideo')}"]`
    )!;
  try {
    act(() => root.render(<ReviewEditActions {...props} />));
    expect(download().disabled).toBe(false);
    act(() => download().click());
    expect(props.onDownload).toHaveBeenCalledOnce();
    act(() => root.render(<ReviewEditActions {...props} hasEdits audioUnavailable failed />));
    expect(download().disabled).toBe(true);
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      translate('gallery.videoReview.exportFailed')
    );
    expect(host.querySelector('[role="status"]')?.textContent).toBe(
      translate('gallery.videoReview.speedAudioUnavailable')
    );
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('opens export settings below download without losing export actions and closes them again', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const onDownload = vi.fn();
  const button = (key: Parameters<typeof translate>[0]) =>
    host.querySelector<HTMLButtonElement>(`[aria-label="${translate(key)}"]`)!;
  try {
    act(() =>
      root.render(
        <ReviewEditActions
          available
          hasEdits={false}
          busy={false}
          phase="idle"
          progress={0}
          failed={false}
          hasResult={false}
          settings={
            <label>
              Export quality
              <input />
            </label>
          }
          onExport={vi.fn()}
          onCancel={vi.fn()}
          onDownload={onDownload}
        />
      )
    );
    expect(host.querySelector('input')).toBeNull();
    const toggle = button('gallery.videoReview.exportSettings');
    act(() => toggle.click());
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const settings = host.querySelector('input')!;
    expect(
      button('gallery.videoReview.downloadVideo').compareDocumentPosition(settings) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    act(() => button('gallery.videoReview.downloadVideo').click());
    expect(onDownload).toHaveBeenCalledOnce();
    act(() => toggle.click());
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector('input')).toBeNull();
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('keeps labelled inspector speed and audio choices editable and respects the busy state', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const onRate = vi.fn();
  const onAudio = vi.fn();
  const props = { layout: 'inspector' as const, rate: 2, audio: 'speed' as const, onRate, onAudio };
  try {
    await act(async () => root.render(<ReviewSpeedOptions {...props} busy={false} />));
    const [rate, audio] = host.querySelectorAll<HTMLButtonElement>('[aria-haspopup="listbox"]');
    expect(rate!.getAttribute('aria-label')).toBe(translate('gallery.videoReview.speedRate'));
    expect(audio!.getAttribute('aria-label')).toBe(translate('gallery.videoReview.speedAudio'));
    await act(async () => rate!.click());
    await act(async () => document.querySelector<HTMLButtonElement>('[role="option"]')!.click());
    expect(onRate).toHaveBeenCalledWith(REVIEW_SPEED_RATES[0]);
    await act(async () => audio!.click());
    await act(async () =>
      document.querySelectorAll<HTMLButtonElement>('[role="option"]')[1]!.click()
    );
    expect(onAudio).toHaveBeenCalledWith('mute');
    await act(async () => root.render(<ReviewSpeedOptions {...props} busy />));
    expect(rate!.disabled).toBe(true);
    expect(audio!.disabled).toBe(true);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('applies export frame rate and quality options without adding section dividers', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const exporter: Parameters<typeof ReviewRenderOptions>[0]['exporter'] = {
    index: {
      duration: 12,
      boundaries: [0, 12],
      container: 'mp4',
      videoCodec: 'avc',
      audioCodec: null,
      rotation: 0,
      processedVideoCodec: 'avc',
    },
    indexing: false,
    checkingCodecs: false,
    phase: 'idle',
    progress: 0,
    failed: false,
    blocked: [],
    result: null,
    plan: () => ({ kind: 'ready', video: 'render', audio: 'copy', reasons: [] }),
    renderSettings: { frameRate: 0, quality: 'HIGH' },
    setRenderSettings: vi.fn(),
    start: vi.fn(async () => {}),
    downloadSelection: vi.fn(async () => {}),
    cancel: vi.fn(),
    download: vi.fn(async () => {}),
  };
  try {
    await act(async () => root.render(<ReviewRenderOptions exporter={exporter} busy={false} />));
    const [, , , rate, quality] = host.querySelectorAll<HTMLButtonElement>(
      '[aria-haspopup="listbox"]'
    );
    await act(async () => rate!.click());
    await act(async () =>
      document.querySelectorAll<HTMLButtonElement>('[role="option"]')[1]!.click()
    );
    expect(exporter.setRenderSettings).toHaveBeenLastCalledWith({ frameRate: 24, quality: 'HIGH' });
    await act(async () => quality!.click());
    await act(async () => document.querySelector<HTMLButtonElement>('[role="option"]')!.click());
    expect(exporter.setRenderSettings).toHaveBeenLastCalledWith({
      frameRate: 0,
      quality: 'LOW',
    });
    await act(async () => root.render(<ReviewRenderOptions exporter={exporter} busy />));
    expect(rate!.disabled).toBe(true);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
