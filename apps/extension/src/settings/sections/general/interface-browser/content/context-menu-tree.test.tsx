// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ContextMenuTree } from '../../../../../contracts/settings/context-menu-layout';
import { ContextMenuTreeView } from './context-menu-tree';

vi.mock('@sniptale/ui/product-feedback/confirm-dialog', () => ({
  ProductConfirmDialog: ({
    title,
    message,
    onConfirm,
    onCancel,
  }: {
    title: string;
    message: string;
    onConfirm(): void;
    onCancel(): void;
  }) => (
    <div role="dialog">
      <h2>{title}</h2>
      <p>{message}</p>
      <button type="button" onClick={onConfirm}>
        Confirm removal
      </button>
      <button type="button" onClick={onCancel}>
        Cancel removal
      </button>
    </div>
  ),
}));

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
  { command: 'sniptale.export.start', label: 'Export', group: 'Export', available: true },
];
let container: HTMLDivElement;
let root: Root;
let latest: ContextMenuTree;
function Harness({ start = initial }: { start?: ContextMenuTree }) {
  const [tree, setTree] = useState(start);
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
  const found = container.querySelector<HTMLElement>(`[data-tree-key="${key}"]`);
  if (!found) throw new Error(`Missing row ${key}`);
  return found;
}
async function key(target: HTMLElement, value: string, altKey = false) {
  await act(async () =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key: value, altKey, bubbles: true }))
  );
}
async function click(label: string) {
  const found = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.getAttribute('aria-label') === label || button.textContent?.trim() === label
  );
  if (!found) throw new Error(`Missing button ${label}`);
  await act(async () => found.click());
}

it('keeps tree arrow navigation and uses Alt+arrows for movement without move buttons', async () => {
  await act(async () => row('command:sniptale.settings').focus());
  await key(row('command:sniptale.settings'), 'ArrowDown');
  expect(document.activeElement).toBe(row('section:tools'));
  await key(row('section:tools'), 'ArrowRight');
  await key(row('section:tools'), 'ArrowRight');
  expect(document.activeElement).toBe(row('command:sniptale.gallery'));
  await key(row('command:sniptale.gallery'), 'ArrowLeft');
  expect(document.activeElement).toBe(row('section:tools'));
  expect(container.querySelector('button[aria-label^="Move up"]')).toBeNull();
  await key(row('command:sniptale.video.tab'), 'ArrowUp', true);
  expect(latest.nodes[1]).toMatchObject({ command: 'sniptale.video.tab' });
  await key(row('command:sniptale.video.tab'), 'ArrowDown', true);
  expect(latest.nodes[2]).toMatchObject({ command: 'sniptale.video.tab' });
});

it('accepts pointer nesting, rejects self drops and allows an empty root drop target', async () => {
  const dataTransfer = {
    effectAllowed: '',
    dropEffect: '',
    setData: vi.fn(),
    getData: () => '',
    types: ['text/plain'],
  };
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
    target.dispatchEvent(
      Object.assign(new Event('dragover', { bubbles: true, cancelable: true }), {
        dataTransfer,
        clientX: 100,
        clientY: 20,
      })
    )
  );
  expect(dataTransfer.dropEffect).toBe('none');
});

it('confirms section removal and moves descendants to its parent without loss', async () => {
  await click('Remove section and move actions to its parent: Tools');
  expect(container.querySelector('[role="dialog"]')).toBeTruthy();
  expect(latest.nodes[1]).toMatchObject({ id: 'tools' });
  await click('Confirm removal');
  expect(latest.nodes.map((node) => (node.type === 'command' ? node.command : node.id))).toEqual([
    'sniptale.settings',
    'sniptale.gallery',
    'sniptale.video.tab',
  ]);
});

it('creates a section inside a selected section and commits its name before saving', async () => {
  await act(async () => row('section:tools').focus());
  await click('Create section here');
  const input = container.querySelector<HTMLInputElement>('input[aria-label="Section name"]')!;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, 'Nested');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  expect(latest.nodes[1]).toMatchObject({
    children: [{ command: 'sniptale.gallery' }, { type: 'section', title: 'Nested' }],
  });
});

it('renames an existing section with F2 without permanent row controls', async () => {
  await key(row('section:tools'), 'F2');
  const input = container.querySelector<HTMLInputElement>('input[aria-label="Section name"]')!;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, 'Tools updated');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  expect(latest.nodes[1]).toMatchObject({ id: 'tools', title: 'Tools updated' });
});

it('renames a section with a pointer double-click', async () => {
  await act(async () =>
    row('section:tools')
      .querySelector('[title="Tools"]')
      ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
  );
  const input = container.querySelector<HTMLInputElement>('input[aria-label="Section name"]')!;
  expect(input?.value).toBe('Tools');
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, 'Pointer tools');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  expect(latest.nodes[1]).toMatchObject({ title: 'Pointer tools' });
});

it('does not turn a displayed command label into a title override on pointer blur', async () => {
  await act(async () =>
    row('command:sniptale.settings')
      .querySelector('[title="Settings"]')
      ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
  );
  const input = container.querySelector<HTMLInputElement>('input[aria-label="Section name"]')!;
  expect(input.value).toBe('');
  expect(input.placeholder).toBe('Settings');
  await act(async () => input.blur());
  expect(latest.nodes[0]).toMatchObject({ command: 'sniptale.settings' });
  expect(latest.nodes[0]).not.toHaveProperty('title');
});

it('moves keyboard focus to the first rendered child when an earlier child is disabled', async () => {
  const start: ContextMenuTree = {
    version: 2,
    nodes: [
      {
        type: 'section',
        id: 'tools',
        title: 'Tools',
        enabled: true,
        children: [
          { type: 'command', command: 'sniptale.gallery', enabled: false },
          { type: 'command', command: 'sniptale.settings', enabled: true },
        ],
      },
    ],
  };
  await act(async () => root.render(<Harness key="disabled-child" start={start} />));
  await act(async () => row('section:tools').focus());
  await key(row('section:tools'), 'ArrowRight');
  await key(row('section:tools'), 'ArrowRight');
  expect(document.activeElement).toBe(row('command:sniptale.settings'));
});

it('offers one-time recovery when an imported section is disabled and empty', async () => {
  const start: ContextMenuTree = {
    version: 2,
    nodes: [{ type: 'section', id: 'hidden', title: 'Hidden', enabled: false, children: [] }],
  };
  await act(async () => root.render(<Harness key="hidden" start={start} />));
  expect(container.querySelector('[data-tree-key="section:hidden"]')).toBeNull();
  await click('Restore hidden sections');
  expect(row('section:hidden')).toBeTruthy();
  expect(container.textContent).not.toContain('Restore hidden sections');
});

it('accepts an available catalog action at the chosen drop position and rejects unknown drag data', async () => {
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
  const drag = async (command: string) => {
    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      setData: vi.fn(),
      getData: () => `command:${command}`,
      types: ['text/plain'],
    };
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
  };
  await drag('sniptale.export.start');
  expect(latest.nodes[1]).toMatchObject({
    children: [{ command: 'sniptale.gallery' }, { command: 'sniptale.export.start' }],
  });
  await drag('sniptale.screenshots.prepare');
  expect(latest.nodes[1]).toMatchObject({
    children: [{ command: 'sniptale.gallery' }, { command: 'sniptale.export.start' }],
  });
});

it('accepts the native drop effect for an available catalog command', async () => {
  const dataTransfer = {
    dropEffect: '',
    types: ['text/plain'],
    getData: () => 'command:sniptale.export.start',
  };
  await act(async () =>
    row('command:sniptale.settings').dispatchEvent(
      Object.assign(new Event('dragover', { bubbles: true, cancelable: true }), {
        dataTransfer,
        clientX: 100,
        clientY: 0,
      })
    )
  );
  expect(dataTransfer.dropEffect).toBe('move');
});

it.each([
  ['before', 2, 1],
  ['after', 38, 2],
] as const)('inserts at the %s edge of a section without nesting', async (_edge, y, index) => {
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
  const dataTransfer = {
    dropEffect: '',
    types: ['text/plain'],
    getData: () => 'command:sniptale.export.start',
  };
  await act(async () =>
    target.dispatchEvent(
      Object.assign(new Event('dragover', { bubbles: true, cancelable: true }), {
        dataTransfer,
        clientX: 100,
        clientY: y,
      })
    )
  );
  await act(async () =>
    target.dispatchEvent(
      Object.assign(new Event('drop', { bubbles: true, cancelable: true }), { dataTransfer })
    )
  );
  expect(latest.nodes[index]).toMatchObject({ command: 'sniptale.export.start' });
  expect(latest.nodes.find((node) => node.type === 'section')).toMatchObject({
    children: [{ command: 'sniptale.gallery' }],
  });
});
