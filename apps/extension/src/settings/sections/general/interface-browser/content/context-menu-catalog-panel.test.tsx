// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ContextMenuTree } from '../../../../../contracts/settings/context-menu-layout';
import { ContextMenuCatalogPanel } from './context-menu-catalog-panel';
import { removeContextMenuNode } from './context-menu-tree-model';

const initial: ContextMenuTree = {
  version: 2,
  nodes: [
    {
      type: 'section',
      id: 'tools',
      title: 'Tools',
      enabled: true,
      children: [{ type: 'command', command: 'sniptale.gallery', enabled: true }],
    },
  ],
};
const catalog = [
  { command: 'sniptale.gallery', label: 'Gallery', group: 'Open', available: true },
  { command: 'sniptale.settings', label: 'Settings', group: 'Open', available: true },
  { command: 'sniptale.video.tab', label: 'Tab video', group: 'Video', available: false },
];
let container: HTMLDivElement;
let root: Root;
let latest: ContextMenuTree;
const announce = vi.fn();

function Harness({ selection }: { selection: string | null }) {
  const [tree, setTree] = useState(initial);
  const [selected, setSelected] = useState(selection);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  latest = tree;
  return (
    <>
      <button type="button" onClick={() => setTree(removeContextMenuNode(tree, 'section:tools'))}>
        Remove tools
      </button>
      <ContextMenuCatalogPanel
        tree={tree}
        catalog={catalog}
        locale="en"
        selectedKey={selected}
        visible
        onChange={setTree}
        onSelect={setSelected}
        onAnnounce={announce}
        expanded={expanded}
        onExpanded={setExpanded}
      />
    </>
  );
}

function changeInput(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  announce.mockReset();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('adds an available command inside the selected section and prevents duplicates', async () => {
  await act(async () => root.render(<Harness selection="section:tools" />));
  const add = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.getAttribute('aria-label') === 'Add command: Settings'
  )!;
  expect(add.disabled).toBe(false);
  await act(async () => add.click());
  expect(latest.nodes[0]).toMatchObject({
    children: [{ command: 'sniptale.gallery' }, { command: 'sniptale.settings' }],
  });
  expect(add.disabled).toBe(true);
  expect(announce).toHaveBeenCalled();
  const unavailable = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.getAttribute('aria-label') === 'Add command: Tab video'
  )!;
  expect(unavailable.disabled).toBe(true);
  expect(unavailable.title).toBe('Unavailable in current settings');
});

it('filters localized catalog groups and shows an empty state', async () => {
  await act(async () => root.render(<Harness selection={null} />));
  const search = container.querySelector<HTMLInputElement>('input[aria-label="Find a command"]')!;
  await act(async () => {
    changeInput(search, 'video');
  });
  expect(container.textContent).toContain('Tab video');
  expect(container.textContent).not.toContain('Gallery');
  await act(async () => {
    changeInput(search, 'no-match');
  });
  expect(container.textContent).toContain('No commands found');
});

it('places a new command before the selected child instead of always appending', async () => {
  await act(async () => root.render(<Harness selection="command:sniptale.gallery" />));
  const position = container.querySelector<HTMLButtonElement>(
    'button[aria-label="New command position"]'
  )!;
  await act(async () => position.click());
  const before = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent?.trim() === 'Before selected'
  )!;
  await act(async () => before.click());
  const add = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.getAttribute('aria-label') === 'Add command: Settings'
  )!;
  await act(async () => add.click());
  expect(latest.nodes[0]).toMatchObject({
    children: [{ command: 'sniptale.settings' }, { command: 'sniptale.gallery' }],
  });
});

it('falls back to the main menu when an explicitly chosen section is removed', async () => {
  await act(async () => root.render(<Harness selection={null} />));
  const destination = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Section for new command"]'
  )!;
  await act(async () => destination.click());
  const tools = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent?.trim() === 'Tools'
  )!;
  await act(async () => tools.click());
  const remove = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent?.trim() === 'Remove tools'
  )!;
  await act(async () => remove.click());
  const add = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.getAttribute('aria-label') === 'Add command: Settings'
  )!;
  await act(async () => add.click());
  expect(latest.nodes.map((node) => (node.type === 'command' ? node.command : node.id))).toEqual([
    'sniptale.gallery',
    'sniptale.settings',
  ]);
});

it('honors an explicit main-menu destination while a section is selected', async () => {
  await act(async () => root.render(<Harness selection="section:tools" />));
  const destination = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Section for new command"]'
  )!;
  await act(async () => destination.click());
  const mainMenu = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent?.trim() === 'Main menu'
  )!;
  await act(async () => mainMenu.click());
  const add = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.getAttribute('aria-label') === 'Add command: Settings'
  )!;
  await act(async () => add.click());
  expect(latest.nodes).toMatchObject([
    { type: 'section', id: 'tools', children: [{ command: 'sniptale.gallery' }] },
    { type: 'command', command: 'sniptale.settings' },
  ]);
});
