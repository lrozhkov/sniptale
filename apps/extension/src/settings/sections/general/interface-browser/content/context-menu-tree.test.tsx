// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ContextMenuTree } from '../../../../../contracts/settings/context-menu-layout';
import { ContextMenuTreeView } from './context-menu-tree';

const initial: ContextMenuTree = {
  version: 2,
  nodes: [
    { type: 'command', command: 'sniptale.settings', enabled: true },
    {
      type: 'section',
      id: 'tools',
      title: 'Tools',
      enabled: true,
      children: [{ type: 'command', command: 'sniptale.gallery', enabled: true }],
    },
    { type: 'command', command: 'sniptale.video.tab', enabled: true },
  ],
};
const catalog = [
  { command: 'sniptale.settings', label: 'Settings', group: 'Open', available: true },
  { command: 'sniptale.gallery', label: 'Gallery', group: 'Open', available: true },
  { command: 'sniptale.video.tab', label: 'Tab video', group: 'Video', available: true },
];
let container: HTMLDivElement;
let root: Root;
let latest: ContextMenuTree;

function Harness() {
  const [tree, setTree] = useState(initial);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  latest = tree;
  return (
    <ContextMenuTreeView
      tree={tree}
      catalog={catalog}
      locale="en"
      selectedKey={selectedKey}
      onSelect={setSelectedKey}
      onChange={setTree}
      expanded={expanded}
      onExpanded={setExpanded}
      onAnnounce={() => undefined}
    />
  );
}

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function row(key: string): HTMLElement {
  const found = [...container.querySelectorAll<HTMLElement>('[role="treeitem"]')].find(
    (entry) => entry.dataset['treeKey'] === key
  );
  if (!found) throw new Error(`Missing row ${key}`);
  return found;
}
async function click(label: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
    (entry) => entry.getAttribute('aria-label') === label || entry.textContent?.trim() === label
  );
  if (!button) throw new Error(`Missing button ${label}`);
  await act(async () => button.click());
}

it('navigates visible nodes with arrows and preserves focus after keyboard-equivalent moves', async () => {
  const settings = row('command:sniptale.settings');
  await act(async () => settings.focus());
  await act(async () =>
    settings.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
  );
  expect(document.activeElement).toBe(row('section:tools'));
  await act(async () =>
    row('section:tools').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
    )
  );
  expect(row('command:sniptale.gallery')).toBeTruthy();
  await act(async () =>
    row('section:tools').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
    )
  );
  expect(document.activeElement).toBe(row('command:sniptale.gallery'));
  await click('Move out of section: Gallery');
  expect(latest.nodes.map((node) => (node.type === 'section' ? node.id : node.command))).toEqual([
    'sniptale.settings',
    'tools',
    'sniptale.gallery',
    'sniptale.video.tab',
  ]);
  expect(document.activeElement).toBe(row('command:sniptale.gallery'));
  await click('Move into section: Gallery');
  expect(latest.nodes[1]).toMatchObject({ children: [{ command: 'sniptale.gallery' }] });
  expect(document.activeElement).toBe(row('command:sniptale.gallery'));
});

it('commits a valid pointer drop and rejects section nesting', async () => {
  const dataTransfer = { effectAllowed: '', dropEffect: '', setData: vi.fn() };
  const source = row('command:sniptale.video.tab').querySelector('[draggable]')!;
  const target = row('section:tools');
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 300,
    height: 40,
    right: 300,
    bottom: 40,
    x: 0,
    y: 0,
    toJSON: () => undefined,
  });
  await act(async () =>
    source.dispatchEvent(Object.assign(new Event('dragstart', { bubbles: true }), { dataTransfer }))
  );
  await act(async () =>
    target.dispatchEvent(
      Object.assign(new Event('dragover', { bubbles: true, cancelable: true }), {
        dataTransfer,
        clientX: 100,
        clientY: 20,
      })
    )
  );
  await act(async () =>
    target.dispatchEvent(
      Object.assign(new Event('drop', { bubbles: true, cancelable: true }), { dataTransfer })
    )
  );
  expect(latest.nodes[1]).toMatchObject({
    children: [{ command: 'sniptale.gallery' }, { command: 'sniptale.video.tab' }],
  });
  const section = row('section:tools').querySelector('[draggable]')!;
  await act(async () =>
    section.dispatchEvent(
      Object.assign(new Event('dragstart', { bubbles: true }), { dataTransfer })
    )
  );
  await act(async () =>
    row('section:tools').dispatchEvent(
      Object.assign(new Event('dragover', { bubbles: true, cancelable: true }), {
        dataTransfer,
        clientX: 100,
        clientY: 20,
      })
    )
  );
  expect(dataTransfer.dropEffect).toBe('none');
});

it('supports boundary navigation, disclosure, enablement, and adjacent reorder', async () => {
  await act(async () => row('section:tools').focus());
  await act(async () =>
    row('section:tools').dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
  );
  expect(document.activeElement).toBe(row('command:sniptale.settings'));
  await act(async () =>
    row('command:sniptale.settings').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'End', bubbles: true })
    )
  );
  expect(document.activeElement).toBe(row('command:sniptale.video.tab'));
  await act(async () =>
    row('command:sniptale.video.tab').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    )
  );
  expect(latest.nodes[2]).toMatchObject({ enabled: false });
  await click('Move up: Tab video');
  expect(latest.nodes[1]).toMatchObject({ command: 'sniptale.video.tab' });
  await click('Move down: Tab video');
  expect(latest.nodes[2]).toMatchObject({ command: 'sniptale.video.tab' });
  await act(async () =>
    row('section:tools').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
    )
  );
  await act(async () =>
    row('command:sniptale.gallery').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })
    )
  );
  expect(document.activeElement).toBe(row('section:tools'));
});

it('removes a section while preserving its commands in the parent menu', async () => {
  await click('Remove section and move items to main menu: Tools');
  expect(latest.nodes.map((node) => (node.type === 'section' ? node.id : node.command))).toEqual([
    'sniptale.settings',
    'sniptale.gallery',
    'sniptale.video.tab',
  ]);
  expect(
    [...container.querySelectorAll<HTMLElement>('[role="treeitem"][aria-selected="true"]')].map(
      (entry) => entry.dataset['treeKey']
    )
  ).toEqual(['command:sniptale.gallery']);
});

it('restores a keyboard tab stop after cancelling a new section by Escape or empty name', async () => {
  await click('Create section here');
  const firstInput = container.querySelector<HTMLInputElement>('input[aria-label="Section name"]')!;
  await act(async () =>
    firstInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  );
  expect(container.querySelector('input[aria-label="Section name"]')).toBeNull();
  expect(row('command:sniptale.video.tab').tabIndex).toBe(0);
  expect(document.activeElement).toBe(row('command:sniptale.video.tab'));

  await click('Create section here');
  const secondInput = container.querySelector<HTMLInputElement>(
    'input[aria-label="Section name"]'
  )!;
  await act(async () =>
    secondInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  );
  expect(container.querySelector('input[aria-label="Section name"]')).toBeNull();
  expect(row('command:sniptale.video.tab').tabIndex).toBe(0);
});

it('returns focus to an existing section after cancelling or clearing its rename', async () => {
  await click('Rename: Tools');
  const firstInput = container.querySelector<HTMLInputElement>('input[aria-label="Section name"]')!;
  await act(async () =>
    firstInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  );
  expect(document.activeElement).toBe(row('section:tools'));

  await click('Rename: Tools');
  const secondInput = container.querySelector<HTMLInputElement>(
    'input[aria-label="Section name"]'
  )!;
  await act(async () => {
    secondInput.value = '';
    secondInput.dispatchEvent(new Event('input', { bubbles: true }));
    secondInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  expect(latest.nodes[1]).toMatchObject({ title: 'Tools' });
  expect(document.activeElement).toBe(row('section:tools'));
});

it('moves focus to the section when collapsing its selected child', async () => {
  await click('Expand: Tools');
  await act(async () => row('command:sniptale.gallery').focus());
  await click('Collapse: Tools');
  expect(row('section:tools').tabIndex).toBe(0);
  expect(document.activeElement).toBe(row('section:tools'));
});
