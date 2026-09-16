// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createTranslator } from '../../../platform/i18n';
import { TourNarrationPreview } from './narration-preview';
const io = vi.hoisted(() => ({
  read: vi.fn(),
  create: vi.fn(),
  revoke: vi.fn(),
  dispose: vi.fn(),
  update: vi.fn(),
  toggle: vi.fn(),
  seek: vi.fn(),
}));
vi.mock('../../../composition/persistence/scenario/store/public', () => ({
  getScenarioAssetBlob: io.read,
}));
vi.mock('./narration-playback', () => ({
  createNarrationPlayback: (
    _audio: unknown,
    _narration: unknown,
    changed: (state: unknown) => void,
    signal: AbortSignal
  ) => {
    signal.addEventListener('abort', io.dispose);
    changed({ time: 1, playing: false, ready: true, failed: false });
    return { update: io.update, toggle: io.toggle, seek: io.seek };
  },
}));
const narration = {
  assetId: 'one',
  duration: 4,
  trimStart: 1,
  trimEnd: 3,
  gain: 1,
  transcript: '',
};
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  io.create.mockReturnValue('blob:voice');
  vi.stubGlobal('URL', { createObjectURL: io.create, revokeObjectURL: io.revoke });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const render = (value = narration) =>
  act(async () =>
    root.render(<TourNarrationPreview narration={value} t={createTranslator('en')} />)
  );
it('ignores late asset reads after selection changes and disposes the current URL', async () => {
  let first!: (blob: Blob) => void;
  io.read
    .mockReturnValueOnce(
      new Promise((resolve) => {
        first = resolve;
      })
    )
    .mockResolvedValue(new Blob(['two']));
  await render();
  await render({ ...narration, assetId: 'two' });
  expect(io.create).toHaveBeenCalledOnce();
  await act(async () => first(new Blob(['old'])));
  expect(io.create).toHaveBeenCalledOnce();
  const play = host.querySelector<HTMLButtonElement>('button[aria-label="Play"]')!;
  act(() => play.click());
  expect(io.toggle).toHaveBeenCalledOnce();
  await render({ ...narration, assetId: 'two', gain: 2 });
  expect(io.update).toHaveBeenLastCalledWith(expect.objectContaining({ gain: 2 }));
  expect(io.dispose).not.toHaveBeenCalled();
  act(() => root.unmount());
  root = createRoot(host);
  expect(io.dispose).toHaveBeenCalledOnce();
  expect(io.revoke).toHaveBeenCalledWith('blob:voice');
});
it('shows failed asset acquisition and retries without a playable stale source', async () => {
  io.read.mockRejectedValueOnce(new Error('missing')).mockResolvedValue(new Blob(['voice']));
  await render();
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  expect(host.querySelector('audio')).toBeNull();
  const retry = [...host.querySelectorAll('button')].find(
    (button) => button.textContent === 'Retry loading'
  )!;
  await act(async () => retry.click());
  expect(host.querySelector('audio')?.getAttribute('src')).toBe('blob:voice');
  expect(host.querySelector('[role="alert"]')).toBeNull();
});
