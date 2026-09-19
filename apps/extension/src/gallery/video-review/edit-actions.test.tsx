// @vitest-environment jsdom

import { REVIEW_SPEED_RATES } from '../../features/video/review/speed';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewEditActions, ReviewTimelineTools, ReviewFragmentAction } from './edit-actions';
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
