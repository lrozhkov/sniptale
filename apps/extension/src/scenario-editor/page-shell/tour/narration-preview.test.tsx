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
  trim: vi.fn(() => true),
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
    root.render(
      <TourNarrationPreview narration={value} onTrimChange={io.trim} t={createTranslator('en')} />
    )
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

const handle = (label: string) =>
  host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const key = (element: HTMLElement, value: string) =>
  act(() => element.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true })));
const typeValue = (label: string, value: string) => {
  const input = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return input;
};
it('edits both trim handles with keyboard and exact values', async () => {
  io.read.mockResolvedValue(new Blob(['voice']));
  await render();
  key(handle('Start, s'), 'ArrowRight');
  expect(io.trim).toHaveBeenLastCalledWith({ trimStart: 1.01, trimEnd: 3 });
  key(handle('End, s'), 'ArrowLeft');
  expect(io.trim).toHaveBeenLastCalledWith({ trimStart: 1, trimEnd: 2.99 });
  const input = typeValue('Start, s', '1.25');
  expect(io.update).toHaveBeenLastCalledWith(expect.objectContaining({ trimStart: 1.25 }));
  expect(io.trim).toHaveBeenCalledTimes(2);
  key(input, 'Enter');
  expect(io.trim).toHaveBeenLastCalledWith({ trimStart: 1.25, trimEnd: 3 });
  const end = typeValue('End, s', '2.75');
  key(end, 'Enter');
  expect(io.trim).toHaveBeenLastCalledWith({ trimStart: 1, trimEnd: 2.75 });
});
it('clamps crossing handles without an empty narration interval', async () => {
  io.read.mockResolvedValue(new Blob(['voice']));
  await render();
  key(handle('Start, s'), 'End');
  expect(io.trim).toHaveBeenLastCalledWith({ trimStart: 2.99, trimEnd: 3 });
  key(handle('End, s'), 'Home');
  expect(io.trim).toHaveBeenLastCalledWith({ trimStart: 1, trimEnd: 1.01 });
  await render({ ...narration, duration: 0.008, trimStart: 0, trimEnd: 0.008 });
  key(handle('Start, s'), 'End');
  expect(io.trim).toHaveBeenLastCalledWith({ trimStart: 0.004, trimEnd: 0.008 });
});
function pointer(element: HTMLElement, name: string, x = 0) {
  act(() => {
    const event = new Event(name, { bubbles: true });
    Object.defineProperties(event, {
      pointerId: { value: 1 },
      button: { value: 0 },
      clientX: { value: x },
    });
    element.dispatchEvent(event);
  });
}
it('previews pointer trim and commits once only on valid release', async () => {
  io.read.mockResolvedValue(new Blob(['voice']));
  await render();
  const scale = host.querySelector<HTMLDivElement>('.tour-narration-scale')!;
  vi.spyOn(scale, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 400 } as DOMRect);
  const start = handle('Start, s');
  start.setPointerCapture = vi.fn();
  start.releasePointerCapture = vi.fn();
  pointer(start, 'pointerdown', 100);
  pointer(start, 'pointermove', 150);
  expect(io.trim).not.toHaveBeenCalled();
  expect(io.update).toHaveBeenLastCalledWith(expect.objectContaining({ trimStart: 1.5 }));
  pointer(start, 'pointerup', 175);
  expect(io.trim).toHaveBeenCalledExactlyOnceWith({ trimStart: 1.75, trimEnd: 3 });
  pointer(start, 'lostpointercapture');
  expect(io.trim).toHaveBeenCalledOnce();
});
it.each(['pointercancel', 'lostpointercapture', 'Escape', 'blur'])(
  'rolls back trim preview on %s',
  async (interruption) => {
    io.read.mockResolvedValue(new Blob(['voice']));
    await render();
    const scale = host.querySelector<HTMLDivElement>('.tour-narration-scale')!;
    vi.spyOn(scale, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 400 } as DOMRect);
    const start = handle('Start, s');
    start.setPointerCapture = vi.fn();
    pointer(start, 'pointerdown', 100);
    pointer(start, 'pointermove', 150);
    if (interruption === 'Escape') key(start, 'Escape');
    else if (interruption === 'blur') act(() => window.dispatchEvent(new Event('blur')));
    else pointer(start, interruption);
    expect(io.trim).not.toHaveBeenCalled();
    expect(io.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ trimStart: 1, trimEnd: 3 })
    );
    expect(start.getAttribute('aria-valuenow')).toBe('1');
    pointer(start, 'pointerup', 175);
    expect(io.trim).not.toHaveBeenCalled();
  }
);
it('rolls back refused and cancelled exact edits and disables unavailable trim', async () => {
  io.read.mockResolvedValue(new Blob(['voice']));
  await render();
  key(typeValue('Start, s', '1.25'), 'Escape');
  expect(io.trim).not.toHaveBeenCalled();
  expect(host.querySelector<HTMLInputElement>('input[aria-label="Start, s"]')!.value).toBe('1');
  io.trim.mockReturnValue(false);
  key(typeValue('End, s', '2.75'), 'Enter');
  expect(io.update).toHaveBeenLastCalledWith(expect.objectContaining({ trimEnd: 3 }));
  await act(async () =>
    root.render(
      <TourNarrationPreview
        narration={narration}
        disabled
        onTrimChange={io.trim}
        t={createTranslator('en')}
      />
    )
  );
  expect(handle('Start, s').disabled).toBe(true);
  expect(host.querySelector<HTMLInputElement>('input[aria-label="End, s"]')!.disabled).toBe(true);
});
