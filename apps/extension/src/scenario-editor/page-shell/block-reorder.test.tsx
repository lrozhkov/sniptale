// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createGuideStep } from '../../features/scenario/project/public';
import { createTranslator } from '../../platform/i18n';
import { GuideBlockReorder, GuideBlockReorderHandle } from './block-reorder';
const mime = 'application/x-sniptale-guide-block';
const payload = JSON.stringify({ projectId: 'project', itemId: 'step', blockId: 'a' });
const operate = vi.fn();
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function render(disabled = false) {
  const item = createGuideStep('', 'step');
  item.blocks = [
    { kind: 'text', id: 'a', paragraphs: [] },
    { kind: 'text', id: 'b', paragraphs: [] },
  ];
  await act(async () =>
    root.render(
      <GuideBlockReorder projectId="project" item={item} disabled={disabled} onOperate={operate}>
        {item.blocks.map((block) => (
          <div key={block.id} data-block-id={block.id}>
            <GuideBlockReorderHandle blockId={block.id} t={createTranslator('en')} />
          </div>
        ))}
      </GuideBlockReorder>
    )
  );
  for (const block of host.querySelectorAll('[data-block-id]'))
    vi.spyOn(block, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 100));
}
async function dispatch(type: string, text = payload, y = 75, types = [mime]) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientY: y });
  Object.defineProperty(event, 'dataTransfer', {
    value: { types, getData: () => text, dropEffect: 'none' },
  });
  await act(async () => host.querySelector('[data-block-id="b"]')!.dispatchEvent(event));
  return event;
}
it('shows insertion without edits then dispatches a single canonical move', async () => {
  await render();
  await dispatch('dragover');
  expect(host.querySelector('[data-reorder="after"]')).not.toBeNull();
  expect(operate).not.toHaveBeenCalled();
  await dispatch('drop');
  expect(operate.mock.calls).toEqual([[{ kind: 'reorder-block', itemId: 'step', blockId: 'a' }]]);
  expect(host.querySelector('[data-reorder]')).toBeNull();
});
it('rejects no-op, malformed, oversized and cross-context identities', async () => {
  await render();
  await dispatch('drop', payload, 25);
  for (const value of [
    'bad',
    'x'.repeat(2049),
    JSON.stringify({ projectId: 'other', itemId: 'step', blockId: 'a' }),
    JSON.stringify({ projectId: 'project', itemId: 'other', blockId: 'a' }),
    JSON.stringify({ projectId: 'project', itemId: 'step', blockId: 'gone' }),
    JSON.stringify({
      projectId: 'project',
      itemId: 'step',
      blockId: 'a',
      url: 'https://example.test',
    }),
  ])
    await dispatch('drop', value);
  expect(operate).not.toHaveBeenCalled();
});
it('cleans markers on Escape, dragend and disabling, leaving image drops untouched', async () => {
  await render();
  await dispatch('dragover');
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  expect(host.querySelector('[data-reorder]')).toBeNull();
  await dispatch('dragover');
  await act(async () => window.dispatchEvent(new Event('dragend')));
  expect(host.querySelector('[data-reorder]')).toBeNull();
  await dispatch('dragover');
  await render(true);
  expect(host.querySelector('[data-reorder]')).toBeNull();
  await dispatch('drop');
  expect(operate).not.toHaveBeenCalled();
  const foreign = await dispatch('drop', '', 75, ['Files']);
  expect(foreign.defaultPrevented).toBe(false);
});
it('grip emits only bounded current project/block identity, never content', async () => {
  await render();
  const data = { effectAllowed: '', setData: vi.fn() };
  const event = new Event('dragstart', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: data });
  await act(async () => host.querySelector('button')!.dispatchEvent(event));
  expect(data.effectAllowed).toBe('move');
  expect(data.setData).toHaveBeenCalledWith(mime, payload);
  await render(true);
  await act(async () => host.querySelector('button')!.dispatchEvent(event));
  expect(event.defaultPrevented).toBe(true);
  expect(data.setData).toHaveBeenCalledTimes(1);
});

it('moves from the grip with keyboard arrows and respects step boundaries', async () => {
  await render();
  const key = async (key: string) =>
    act(async () =>
      host
        .querySelector('button')!
        .dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    );
  await key('ArrowUp');
  expect(operate).not.toHaveBeenCalled();
  await key('ArrowDown');
  expect(operate.mock.calls).toEqual([
    [{ kind: 'move-block', itemId: 'step', blockId: 'a', direction: 1 }],
  ]);
  await render(true);
  await key('ArrowDown');
  expect(operate).toHaveBeenCalledTimes(1);
});
