// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createGuideParagraphs } from '../../features/scenario/project/public';
import { createTranslator } from '../../platform/i18n';
import { GuideNoteBlock } from './note-block';

let host: HTMLDivElement;
let root: Root;
const change = vi.fn();
const block = {
  id: 'note',
  kind: 'note',
  tone: 'info',
  width: 'half',
  paragraphs: createGuideParagraphs('<b>literal</b>'),
} as const;
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
  vi.unstubAllGlobals();
});
async function render(disabled = false) {
  await act(async () =>
    root.render(
      <GuideNoteBlock
        block={block}
        disabled={disabled}
        onChange={change}
        t={createTranslator('en')}
      />
    )
  );
}
async function choose(label: string) {
  await act(async () => host.querySelector('button')!.click());
  const option = [...document.querySelectorAll('.guide-action-menu button')].find(
    (node) => node.textContent === label
  );
  if (!(option instanceof HTMLButtonElement)) throw new Error(`Missing ${label}`);
  await act(async () => option.click());
}
it('changes each tone as one operation while retaining identity, width and literal text', async () => {
  await render();
  expect(host.querySelector('b')).toBeNull();
  expect(host.querySelector('textarea')?.value).toBe('<b>literal</b>');
  for (const [label, tone] of [
    ['Note', 'neutral'],
    ['Warning', 'warning'],
    ['Error', 'error'],
  ]) {
    await choose(label!);
    expect(change.mock.calls.at(-1)).toEqual([{ ...block, tone }, null]);
    expect(document.activeElement).toBe(host.querySelector('button'));
  }
  await choose('Information');
  expect(change).toHaveBeenCalledTimes(3);
});
it('edits paragraphs as plain text and keeps text grouping with the canonical parent', async () => {
  await render();
  const field = host.querySelector('textarea')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(
      field,
      'First\n<script>second</script>'
    );
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(change).toHaveBeenCalledWith({
    ...block,
    paragraphs: createGuideParagraphs('First\n<script>second</script>'),
  });
  expect(host.querySelector('script')).toBeNull();
});
it('restores focus on Escape and closes the menu when editing becomes disabled', async () => {
  await render();
  const trigger = host.querySelector('button')!;
  await act(async () => trigger.click());
  await act(async () =>
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    )
  );
  expect(document.activeElement).toBe(trigger);
  expect(change).not.toHaveBeenCalled();
  await act(async () => trigger.click());
  await render(true);
  expect(document.querySelector('.guide-action-menu')).toBeNull();
  await act(async () => trigger.click());
  expect(document.querySelector('.guide-action-menu')).toBeNull();
  expect(host.querySelector('textarea')?.disabled).toBe(true);
});
