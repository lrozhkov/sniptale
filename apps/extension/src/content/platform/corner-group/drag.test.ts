// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PageCorner } from '../../../contracts/page-launch';
import { installCornerGroupDrag, type CornerGroupDragState } from './drag';
let group: HTMLDivElement,
  handle: HTMLButtonElement,
  corner: PageCorner,
  state: CornerGroupDragState;
let owner: ReturnType<typeof installCornerGroupDrag>;
const commit = vi.fn(),
  failure = vi.fn();
function pointer(type: string, x: number, y: number, id = 1) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
  });
  Object.defineProperty(event, 'pointerId', { value: id });
  handle.dispatchEvent(event);
}
beforeEach(() => {
  vi.clearAllMocks();
  corner = 'bottom-right';
  group = document.createElement('div');
  handle = document.createElement('button');
  group.append(handle);
  document.body.append(group);
  vi.spyOn(group, 'getBoundingClientRect').mockReturnValue(new DOMRect(900, 700, 80, 40));
  handle.setPointerCapture = vi.fn();
  handle.hasPointerCapture = vi.fn(() => true);
  handle.releasePointerCapture = vi.fn();
  commit.mockImplementation(async (next: PageCorner) => {
    corner = next;
  });
  owner = installCornerGroupDrag({
    group,
    handle,
    getCorner: () => corner,
    onCommit: commit,
    onError: failure,
    onState: (next) => {
      state = next;
    },
  });
});
afterEach(() => {
  owner.dispose();
  group.remove();
  vi.restoreAllMocks();
});
it('snaps one completed drag and never commits a click or sub-threshold move', async () => {
  pointer('pointerdown', 910, 710);
  pointer('pointermove', 912, 711);
  pointer('pointerup', 912, 711);
  expect(commit).not.toHaveBeenCalled();
  expect(state.draft).toBeNull();
  pointer('pointerdown', 910, 710);
  pointer('pointermove', 40, 40);
  expect(state.draft).toMatchObject({ x: 30, y: 30, corner: 'top-left' });
  pointer('pointerup', 40, 40);
  await vi.waitFor(() => expect(state.pending).toBe(false));
  expect(corner).toBe('top-left');
  expect(commit).toHaveBeenCalledOnce();
  handle.dispatchEvent(new MouseEvent('click', { detail: 1, bubbles: true }));
  expect(commit).toHaveBeenCalledOnce();
});
it.each(['blur', 'resize', 'pointercancel', 'lostpointercapture', 'Escape'])(
  'cancels an unfinished drag on %s without a write',
  (kind) => {
    pointer('pointerdown', 910, 710);
    pointer('pointermove', 40, 40);
    if (kind === 'Escape')
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    else if (kind === 'lostpointercapture') pointer(kind, 40, 40);
    else (kind === 'blur' || kind === 'resize' ? window : handle).dispatchEvent(new Event(kind));
    expect(state.draft).toBeNull();
    expect(commit).not.toHaveBeenCalled();
  }
);
it('blocks duplicate writes, retains accepted corner on failure and permits retry', async () => {
  let reject!: (error: Error) => void;
  commit.mockReturnValueOnce(
    new Promise<void>((_, fail) => {
      reject = fail;
    })
  );
  handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  expect(state.pending).toBe(true);
  handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
  expect(commit).toHaveBeenCalledOnce();
  reject(new Error('storage failed'));
  await vi.waitFor(() => expect(state.pending).toBe(false));
  expect(corner).toBe('bottom-right');
  expect(failure).toHaveBeenCalledOnce();
  handle.click();
  await vi.waitFor(() => expect(corner).toBe('bottom-left'));
});
it('disposes native listeners and ignores a late accepted response', async () => {
  let resolve!: () => void;
  commit.mockReturnValueOnce(
    new Promise<void>((accept) => {
      resolve = accept;
    })
  );
  const changes = vi.fn();
  owner.dispose();
  owner = installCornerGroupDrag({
    group,
    handle,
    getCorner: () => corner,
    onCommit: commit,
    onError: failure,
    onState: changes,
  });
  handle.click();
  const before = changes.mock.calls.length;
  owner.dispose();
  resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(changes).toHaveBeenCalledTimes(before);
  handle.click();
  expect(commit).toHaveBeenCalledOnce();
});
it('cancels the draft when another group changes the accepted corner', () => {
  pointer('pointerdown', 910, 710);
  pointer('pointermove', 40, 40);
  corner = 'top-right';
  owner.refresh();
  expect(state.draft).toBeNull();
  expect(commit).not.toHaveBeenCalled();
});

it('keeps the dropped position while native capture release precedes the write acknowledgement', async () => {
  let resolve!: () => void;
  commit.mockReturnValueOnce(
    new Promise<void>((accept) => {
      resolve = accept;
    })
  );
  pointer('pointerdown', 910, 710);
  pointer('pointermove', 40, 40);
  pointer('pointerup', 40, 40);
  pointer('lostpointercapture', 40, 40);
  expect(state.pending).toBe(true);
  expect(state.draft?.corner).toBe('top-left');
  resolve();
  await vi.waitFor(() => expect(state.pending).toBe(false));
});
