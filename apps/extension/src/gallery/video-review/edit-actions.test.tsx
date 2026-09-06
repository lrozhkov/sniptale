// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewEditActions, ReviewTimelineTools } from './edit-actions';
import { translate } from '../../platform/i18n';
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
    const [rate, audio] = Array.from(host.querySelectorAll('select'));
    for (const value of ['1.25', '1.5', '2', '4'])
      act(() => {
        rate!.value = value;
        rate!.dispatchEvent(new Event('change', { bubbles: true }));
      });
    expect(props.onRate.mock.calls.map(([rate]) => rate)).toEqual([1.25, 1.5, 2, 4]);
    act(() => {
      audio!.value = 'mute';
      audio!.dispatchEvent(new Event('change', { bubbles: true }));
    });
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
