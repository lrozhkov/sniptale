// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ContextMenuTree } from '../../../../../contracts/settings/context-menu-layout';
import { ContextMenuCatalogPanel } from './context-menu-catalog-panel';

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

function Harness({
  selection,
  start = initial,
}: {
  selection: string | null;
  start?: ContextMenuTree;
}) {
  const [tree, setTree] = useState(start);
  const [selected, setSelected] = useState(selection);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  latest = tree;
  return (
    <ContextMenuCatalogPanel
      tree={tree}
      catalog={catalog}
      locale="en"
      selectedKey={selected}
      onChange={setTree}
      onSelect={setSelected}
      onAnnounce={() => undefined}
      expanded={expanded}
      onExpanded={setExpanded}
    />
  );
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('lists only available unused names and inserts inside the selected section', async () => {
  await act(async () => root.render(<Harness selection="section:tools" />));
  expect(container.textContent).toContain('Settings');
  expect(container.textContent).not.toContain('Gallery');
  expect(container.textContent).not.toContain('Tab video');
  const add = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Add command: Settings"]'
  )!;
  await act(async () => add.click());
  expect(latest.nodes[0]).toMatchObject({
    children: [{ command: 'sniptale.gallery' }, { command: 'sniptale.settings' }],
  });
  expect(container.querySelector('button[aria-label="Add command: Settings"]')).toBeNull();
});

it('reactivates a stored disabled reference in its original position', async () => {
  const start: ContextMenuTree = {
    version: 2,
    nodes: [
      { type: 'command', command: 'sniptale.settings', enabled: false },
      { type: 'command', command: 'sniptale.gallery', enabled: true },
    ],
  };
  await act(async () =>
    root.render(<Harness selection="command:sniptale.gallery" start={start} />)
  );
  const add = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Add command: Settings"]'
  )!;
  await act(async () => add.click());
  expect(latest.nodes).toMatchObject([
    { command: 'sniptale.settings', enabled: true },
    { command: 'sniptale.gallery' },
  ]);
});

it('restores a disabled ancestor section through its unused action', async () => {
  const start: ContextMenuTree = {
    version: 2,
    nodes: [
      {
        type: 'section',
        id: 'tools',
        title: 'Tools',
        enabled: false,
        children: [{ type: 'command', command: 'sniptale.gallery', enabled: true }],
      },
    ],
  };
  await act(async () => root.render(<Harness selection={null} start={start} />));
  await act(async () =>
    container.querySelector<HTMLButtonElement>('button[aria-label="Add command: Gallery"]')?.click()
  );
  expect(latest.nodes[0]).toMatchObject({
    enabled: true,
    children: [{ command: 'sniptale.gallery', enabled: true }],
  });
});
