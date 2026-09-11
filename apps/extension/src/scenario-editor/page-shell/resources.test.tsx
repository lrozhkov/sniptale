// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createTranslator } from '../../platform/i18n';
const io = vi.hoisted(() => ({ list: vi.fn(), import: vi.fn(), revoke: vi.fn() }));
vi.mock('../../composition/persistence/media-library', () => ({ listMediaLibrary: io.list }));
import { GuideImageResources } from './resources';
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:preview'),
    revokeObjectURL: io.revoke,
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  io.import.mockResolvedValue(true);
  io.list.mockResolvedValue([]);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function render(selectedStepId: string | null = 'step') {
  await act(async () =>
    root.render(
      <GuideImageResources
        disabled={false}
        selectedStepId={selectedStepId}
        t={createTranslator('en')}
        onImport={io.import}
      />
    )
  );
}
async function click(label: string, scope: ParentNode = host) {
  const button = [...scope.querySelectorAll('button')].find(
    (node) => node.textContent === label || node.getAttribute('aria-label') === label
  );
  if (!button) throw new Error(`Missing ${label}`);
  await act(async () => button.click());
}
async function files(...names: string[]) {
  const input = host.querySelector('input[type="file"]');
  if (!input) throw new Error('Missing file input');
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: names.map((name) => new File(['image'], name, { type: 'image/png' })),
  });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
}
it('previews ordered files, reorders/removes and imports blocks, then releases previews', async () => {
  await render();
  await files('first.png', 'second.png', 'third.png');
  expect(host.querySelectorAll('img')).toHaveLength(3);
  await click('Move up', host.querySelectorAll('li')[1]);
  await click('Remove from selection', host.querySelectorAll('li')[2]);
  const select = host.querySelector('select');
  await act(async () => {
    if (select) {
      select.value = 'blocks';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await click('Import selected');
  expect(
    io.import.mock.calls[0]?.[0].sources.map((source: { file: File }) => source.file.name)
  ).toEqual(['second.png', 'first.png']);
  expect(io.import.mock.calls[0]?.[0].placement).toEqual({ kind: 'blocks', stepId: 'step' });
  expect(host.querySelectorAll('li')).toHaveLength(0);
  expect(io.revoke).toHaveBeenCalled();
});
it('keeps selection after a rejected import and cancels pending preparation', async () => {
  await render();
  await files('first.png');
  io.import.mockResolvedValueOnce(false);
  await click('Import selected');
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  expect(host.querySelectorAll('li')).toHaveLength(1);
  let finish: (value: boolean) => void = () => undefined;
  io.import.mockImplementationOnce(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      })
  );
  await click('Import selected');
  const signal: AbortSignal = io.import.mock.calls[1]?.[0].signal;
  await click('Cancel preparation');
  expect(signal.aborted).toBe(true);
  await act(async () => finish(false));
  expect(host.querySelectorAll('li')).toHaveLength(1);
});
it('filters library to images, retries failures and submits a current library identity', async () => {
  await render(null);
  io.list.mockRejectedValueOnce(new Error('read'));
  await click('Choose from library / refresh');
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  io.list.mockResolvedValue([
    { id: 'image', kind: 'image', filename: 'Library.png', source: { kind: 'screenshot' } },
    { id: 'video', kind: 'video', filename: 'Movie.mp4', source: { kind: 'recording' } },
  ]);
  await click('Choose from library / refresh');
  expect(host.textContent).not.toContain('Movie.mp4');
  await click('Library.png');
  await click('Import selected');
  expect(io.import.mock.calls[0]?.[0].sources).toEqual([{ kind: 'library', mediaId: 'image' }]);
  expect(io.import.mock.calls[0]?.[0].placement).toEqual({ kind: 'steps' });
});
