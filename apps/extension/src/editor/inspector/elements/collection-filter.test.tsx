// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ElementCollectionFilter } from './collection-filter';

vi.mock('../../../platform/i18n', () => ({ translate: (key: string) => key }));

const collections = [
  { value: '', label: 'All collections' },
  { value: 'local:mine', label: 'My uploaded icons' },
  { value: 'remote:lucide', label: 'Lucide', prefix: 'lucide' },
  { value: 'remote:tabler', label: 'Tabler Icons', prefix: 'tabler' },
];
const selected = vi.fn();
const outsideKey = vi.fn();
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let frames: FrameRequestCallback[];

function Filter({
  options = collections,
  initial = '',
}: {
  options?: typeof collections;
  initial?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div onKeyDown={outsideKey}>
      <ElementCollectionFilter
        value={value}
        options={options}
        onChange={(next) => {
          selected(next);
          setValue(next);
        }}
      />
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  frames = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
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

async function render(options = collections, initial = '') {
  await act(async () => root.render(<Filter options={options} initial={initial} />));
}
function trigger() {
  const button = host.querySelector<HTMLButtonElement>('button');
  if (!button) throw new Error('Missing collection trigger');
  return button;
}
function search() {
  const input = document.querySelector<HTMLInputElement>('input[type="search"]');
  if (!input) throw new Error('Missing collection search');
  return input;
}
function choices() {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('[role="option"]'));
}
async function click(node: HTMLElement) {
  await act(async () => node.click());
}
async function key(node: HTMLElement, value: string, isComposing = false) {
  await act(async () =>
    node.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: value,
        bubbles: true,
        cancelable: true,
        isComposing,
      })
    )
  );
  await act(async () => {
    for (const callback of frames.splice(0)) callback(0);
  });
}
async function query(value: string) {
  const input = search();
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('Missing native input value setter');
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

it('opens from the keyboard, searches loaded names and prefixes, and accepts one result', async () => {
  await render();
  await key(trigger(), 'ArrowDown');
  expect(document.activeElement).toBe(search());
  expect(choices().map((node) => node.textContent)).toEqual(collections.map((row) => row.label));
  expect(choices()[0]?.getAttribute('aria-selected')).toBe('true');
  expect(choices()[2]?.title).toBe('Lucide · lucide');
  expect(choices()[1]?.title).toBe('My uploaded icons');
  await query('  TABLER  ');
  expect(choices().map((node) => node.textContent)).toEqual(['Tabler Icons']);
  await key(search(), 'Enter');
  expect(selected).toHaveBeenCalledExactlyOnceWith('remote:tabler');
  expect(document.querySelector('[role="listbox"]')).toBeNull();
  expect(document.activeElement).toBe(trigger());
  expect(trigger().textContent).toBe('Tabler Icons');
  expect(outsideKey).not.toHaveBeenCalled();
});

it('moves between search and options without losing the active choice, then selects a local collection', async () => {
  await render();
  await key(trigger(), ' ');
  await key(search(), 'ArrowDown');
  expect(document.activeElement).toBe(choices()[0]);
  await key(choices()[0]!, 'ArrowUp');
  expect(document.activeElement).toBe(search());
  await key(search(), 'ArrowUp');
  expect(document.activeElement).toBe(choices().at(-1));
  await key(choices().at(-1)!, 'ArrowUp');
  expect(document.activeElement).toBe(choices()[2]);
  await key(choices()[2]!, 'Home');
  expect(document.activeElement).toBe(choices()[0]);
  await key(choices()[0]!, 'ArrowDown');
  expect(document.activeElement).toBe(choices()[1]);
  await key(choices()[1]!, 'Enter');
  expect(selected).toHaveBeenCalledExactlyOnceWith('local:mine');
  expect(trigger().textContent).toBe('My uploaded icons');
  expect(document.activeElement).toBe(trigger());
});

it('does not select ambiguous, empty or composing input and keeps search keys out of editor shortcuts', async () => {
  await render();
  await click(trigger());
  await key(search(), 'Enter');
  expect(selected).not.toHaveBeenCalled();
  expect(choices()).toHaveLength(4);
  await query('missing');
  expect(choices()).toHaveLength(0);
  expect(document.querySelector('[role="listbox"]')?.textContent).toContain(
    'editor.elements.emptySearch'
  );
  await key(search(), 'Enter');
  expect(selected).not.toHaveBeenCalled();
  await query('lucide');
  await key(search(), 'Enter', true);
  expect(selected).not.toHaveBeenCalled();
  expect(choices()).toHaveLength(1);
  outsideKey.mockClear();
  await key(search(), 'a');
  expect(outsideKey).not.toHaveBeenCalled();
  await key(search(), 'Escape');
  expect(document.querySelector('[role="listbox"]')).toBeNull();
  expect(document.activeElement).toBe(trigger());
  await click(trigger());
  expect(search().value).toBe('');
  expect(choices()).toHaveLength(4);
});

it('supports pointer selection of remote and all collections and closes without changing selection', async () => {
  await render();
  await click(trigger());
  await click(choices()[2]!);
  expect(selected).toHaveBeenLastCalledWith('remote:lucide');
  await click(trigger());
  expect(choices()[2]?.getAttribute('aria-selected')).toBe('true');
  await click(choices()[0]!);
  expect(selected).toHaveBeenLastCalledWith('');
  expect(trigger().textContent).toBe('All collections');
  await click(trigger());
  await query('mine');
  await click(trigger());
  expect(document.querySelector('[role="listbox"]')).toBeNull();
  expect(selected).toHaveBeenCalledTimes(2);
  await click(trigger());
  expect(search().value).toBe('');
  await key(choices()[1]!, 'Escape');
  expect(document.querySelector('[role="listbox"]')).toBeNull();
  expect(document.activeElement).toBe(trigger());
});

it('shows the supplied favorites collection subset and preserves an unavailable collection label', async () => {
  const favorites = collections.filter((row) => row.value !== 'remote:tabler');
  await render(favorites, 'remote:retired');
  expect(trigger().textContent).toBe('retired');
  await key(trigger(), 'Enter');
  expect(choices().map((node) => node.textContent)).toEqual([
    'All collections',
    'My uploaded icons',
    'Lucide',
  ]);
  await key(search(), 'Escape');
  expect(selected).not.toHaveBeenCalled();
  await key(trigger(), 'ArrowUp');
  expect(document.activeElement).toBe(search());
  await key(trigger(), 'Escape');
  expect(document.querySelector('[role="listbox"]')).toBeNull();
});
