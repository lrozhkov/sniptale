// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewEditActions } from './edit-actions';
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
    expect(button('gallery.videoReview.applyCut')?.disabled).toBe(true);
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
