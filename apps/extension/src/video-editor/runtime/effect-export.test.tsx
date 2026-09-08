// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../features/video/project/factories/creation';
import { useEffectInstanceExport } from './effect-export';
const { serialize } = vi.hoisted(() => ({ serialize: vi.fn() }));
vi.mock('../../features/video/project/effect-instance/export', () => ({
  exportEffectInstance: serialize,
}));
let root: Root | undefined;
let container: HTMLDivElement | undefined;
let current: ReturnType<typeof useEffectInstanceExport>;
function Harness() {
  current = useEffectInstanceExport(createEmptyVideoProject('export'), 'instance');
  return null;
}
function mount() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:effect'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  act(() => root!.render(<Harness />));
}
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  vi.restoreAllMocks();
  serialize.mockReset();
});
it('downloads once, prevents duplicate requests and releases the object URL with its owner', async () => {
  let resolve!: (value: { blob: Blob; filename: string }) => void;
  serialize.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    })
  );
  mount();
  let first!: Promise<void>;
  act(() => {
    first = current.export();
    void current.export();
  });
  expect(serialize).toHaveBeenCalledTimes(1);
  expect(current.busy).toBe(true);
  await act(async () => {
    resolve({ blob: new Blob(['{}']), filename: 'effect.json' });
    await first;
  });
  expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
  expect(current.busy).toBe(false);
  act(() => root!.unmount());
  root = undefined;
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:effect');
});
it('discards an artifact that finishes after its inspector was removed', async () => {
  let resolve!: (value: { blob: Blob; filename: string }) => void;
  serialize.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    })
  );
  mount();
  let request!: Promise<void>;
  act(() => {
    request = current.export();
  });
  act(() => root!.unmount());
  root = undefined;
  await act(async () => {
    resolve({ blob: new Blob(['{}']), filename: 'effect.json' });
    await request;
  });
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
});
it('shows a failure and allows retry without downloading an incomplete effect', async () => {
  serialize.mockRejectedValueOnce(new Error('Invalid snapshot'));
  mount();
  await act(async () => current.export());
  expect(current.error).toBeTruthy();
  expect(current.busy).toBe(false);
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  serialize.mockResolvedValueOnce({ blob: new Blob(['{}']), filename: 'effect.json' });
  await act(async () => current.export());
  expect(current.error).toBeNull();
  expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
});
