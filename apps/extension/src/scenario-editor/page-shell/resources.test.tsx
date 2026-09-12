// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createTranslator } from '../../platform/i18n';
const io = vi.hoisted(() => ({ list: vi.fn(), import: vi.fn(), revoke: vi.fn() }));
vi.mock('../../composition/persistence/media-library', () => ({ listMediaLibrary: io.list }));
vi.mock('../../composition/persistence/gallery-saved-views', () => ({
  listGallerySavedViews: async () => [],
}));
vi.mock('../../composition/persistence/aggregate-presentations', () => ({
  getAggregatePresentation: async () => undefined,
}));
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
  io.list.mockResolvedValue(
    names.map((name) => ({
      id: name,
      filename: name,
      kind: 'image',
      source: { kind: 'screenshot' },
      tags: [],
    }))
  );
  await act(async () => window.dispatchEvent(new Event('focus')));
  for (const name of names) await click(name);
}
it('orders library selections, reorders/removes and imports blocks', async () => {
  await render();
  await files('first.png', 'second.png', 'third.png');
  expect(host.querySelectorAll('li')).toHaveLength(3);
  expect(host.querySelector('input[type="file"]')).toBeNull();
  await click('Move up', host.querySelectorAll('li')[1]);
  await click('Remove from selection', host.querySelectorAll('li')[2]);
  await click('As blocks in selected step');
  await click('Import selected');
  expect(
    io.import.mock.calls[0]?.[0].sources.map((source: { mediaId: string }) => source.mediaId)
  ).toEqual(['second.png', 'first.png']);
  expect(io.import.mock.calls[0]?.[0].placement).toEqual({ kind: 'blocks', stepId: 'step' });
  expect(host.querySelectorAll('li')).toHaveLength(0);
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
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  io.list.mockResolvedValue([
    { id: 'image', kind: 'image', filename: 'Library.png', source: { kind: 'screenshot' } },
    {
      id: 'video',
      kind: 'video',
      mimeType: 'video/mp4',
      filename: 'Movie.mp4',
      source: { kind: 'recording' },
    },
  ]);
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(host.textContent).not.toContain('Movie.mp4');
  await click('Library.png');
  await click('Import selected');
  expect(io.import.mock.calls[0]?.[0].sources).toEqual([{ kind: 'library', mediaId: 'image' }]);
  expect(io.import.mock.calls[0]?.[0].placement).toEqual({ kind: 'steps' });
});

it('imports one selected source into the requested image block without a destination selector', async () => {
  await act(async () =>
    root.render(
      <GuideImageResources
        disabled={false}
        selectedStepId="other"
        target={{ kind: 'replace-image', stepId: 'target-step', blockId: 'target-image' }}
        t={createTranslator('en')}
        onImport={io.import}
      />
    )
  );
  await files('first.png');
  await files('replacement.png');
  await click('Import selected');
  expect(io.import.mock.calls[0]?.[0].sources).toHaveLength(1);
  expect(io.import.mock.calls[0]?.[0].sources[0].mediaId).toBe('replacement.png');
  expect(io.import.mock.calls[0]?.[0].placement).toEqual({
    kind: 'replace-image',
    stepId: 'target-step',
    blockId: 'target-image',
  });
  expect(host.querySelector('[aria-haspopup="listbox"]')).toBeNull();
});

it('keeps multiple library images targeted to the originating empty step', async () => {
  const complete = vi.fn();
  await act(async () =>
    root.render(
      <GuideImageResources
        disabled={false}
        selectedStepId="other"
        target={{ kind: 'blocks', stepId: 'empty-step' }}
        t={createTranslator('en')}
        onImport={io.import}
        onComplete={complete}
      />
    )
  );
  await files('first.png', 'second.png');
  await click('Import selected');
  expect(io.import.mock.calls[0]?.[0].sources).toHaveLength(2);
  expect(io.import.mock.calls[0]?.[0].placement).toEqual({ kind: 'blocks', stepId: 'empty-step' });
  expect(complete).toHaveBeenCalledOnce();
});
