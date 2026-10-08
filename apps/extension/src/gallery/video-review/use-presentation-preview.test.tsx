// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { usePresentationPreview } from './use-presentation-preview';
import { DEFAULT_QUICK_PREVIEW_PREFERENCES } from '../../features/video/preview/quick-preferences';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import type { PresentationPreviewInput } from '../../workflows/video-review/presentation-preview';
const prepared = vi.hoisted(() => ({ windows: [{ name: 'join' }], width: 640, height: 360 }));
vi.mock('../../workflows/video-review/presentation-preview', () => ({
  preparePresentationPreview: () => prepared,
  renderPresentationPreview: vi.fn(),
}));
let unmount = () => {};
afterEach(() => {
  unmount();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('pauses once, aborts superseded work, rejects late results and revokes owned URLs', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const created = vi.fn(() => 'blob:owned');
  const revoked = vi.fn();
  vi.stubGlobal('URL', { createObjectURL: created, revokeObjectURL: revoked });
  const pending: { resolve: (blob: Blob) => void; signal: AbortSignal }[] = [];
  const render = vi.fn(
    (_input: unknown, _plan: unknown, _selected: unknown, signal: AbortSignal) =>
      new Promise<Blob>((resolve) => pending.push({ resolve, signal }))
  );
  const pause = vi.fn();
  let hook: ReturnType<typeof usePresentationPreview>;
  // Only the immutable lifetime contract is exercised; codec/sequence validation has owner proofs.
  let input: PresentationPreviewInput = {
    file: new Blob(),
    index: {
      duration: 10,
      boundaries: [0, 10],
      videoCodec: 'avc',
      audioCodec: null,
      container: 'mp4',
      rotation: 0,
    },
    advanced: createQuickEditAdvancedState(),
    edits: [],
    fragmentOffset: 0,
    readProjectAsset: async () => null,
  };
  function View() {
    hook = usePresentationPreview(input, DEFAULT_QUICK_PREVIEW_PREFERENCES, pause, render);
    return null;
  }
  const host = document.createElement('div');
  const root = createRoot(host);
  unmount = () => act(() => root.unmount());
  await act(async () => root.render(<View />));
  act(() => hook.open('intro'));
  expect(pause).toHaveBeenCalledOnce();
  act(() => hook.retry());
  expect(pending[0]!.signal.aborted).toBe(true);
  await act(async () => pending[0]!.resolve(new Blob(['old'])));
  expect(created).not.toHaveBeenCalled();
  await act(async () => pending[1]!.resolve(new Blob(['new'])));
  expect(hook!.result.url).toBe('blob:owned');
  act(() => hook.close());
  expect(revoked).toHaveBeenCalledWith('blob:owned');
  expect(pause).toHaveBeenCalledOnce();
  act(() => hook.open('outro'));
  const stale = pending.at(-1)!;
  input = { ...input, index: { ...input.index, duration: 11 } };
  await act(async () => root.render(<View />));
  expect(stale.signal.aborted).toBe(true);
  expect(hook!.selection).toBeNull();
  await act(async () => stale.resolve(new Blob(['stale revision'])));
  expect(created).toHaveBeenCalledTimes(1);
  act(() => hook.open('intro'));
  const abandoned = pending.at(-1)!;
  unmount();
  unmount = () => {};
  expect(abandoned.signal.aborted).toBe(true);
  await act(async () => abandoned.resolve(new Blob(['unmounted'])));
  expect(created).toHaveBeenCalledTimes(1);
});
