// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ContextMenuTree } from '../../../../../contracts/settings/context-menu-layout';
import { ContextMenuTreeView } from './context-menu-tree';
import { ContextMenuCatalogPanel } from './context-menu-catalog-panel';
import { useContextMenuTreeDrop } from './context-menu-tree-drop';

let host: HTMLDivElement;
let root: Root;
const changed = vi.fn();
const removed = vi.fn();
let hit: Element | null;
const catalog = [
  { command: 'sniptale.settings', label: 'Settings', group: 'Open', available: true },
  { command: 'sniptale.gallery', label: 'Gallery', group: 'Open', available: true },
];
function Harness({ empty = false }: { empty?: boolean }) {
  const [tree, setTree] = useState<ContextMenuTree>({
    version: 2,
    nodes: empty
      ? []
      : [
          {
            type: 'section',
            id: 'a',
            title: 'A',
            enabled: true,
            children: [{ type: 'command', command: 'sniptale.gallery', enabled: true }],
          },
          { type: 'section', id: 'b', title: 'B', enabled: true, children: [] },
        ],
  });
  const [selected, select] = useState<string | null>(null);
  const [expanded, expand] = useState<Set<string>>(new Set());
  const change = (next: ContextMenuTree) => {
    changed(next);
    setTree(next);
  };
  const drag = useContextMenuTreeDrop({
    tree,
    catalog,
    expanded,
    onExpanded: expand,
    locale: 'en',
    apply: change,
    onAnnounce: () => {},
    remove: removed,
  });
  return (
    <div ref={drag.rootRef}>
      <button onClick={() => setTree(structuredClone(tree))}>Refresh saved draft</button>
      <button onClick={() => setTree({ version: 2, nodes: [] })}>Replace draft</button>
      <ContextMenuTreeView
        tree={tree}
        selectedKey={selected}
        onSelect={select}
        expanded={expanded}
        onExpanded={expand}
        locale="en"
        onAnnounce={() => {}}
        catalog={catalog}
        onChange={change}
        drop={drag.drop}
      />
      <ContextMenuCatalogPanel
        tree={tree}
        selectedKey={selected}
        onSelect={select}
        expanded={expanded}
        onExpanded={expand}
        locale="en"
        onAnnounce={() => {}}
        catalog={catalog}
        onChange={change}
        dropActive={drag.catalogTarget}
      />
    </div>
  );
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  changed.mockClear();
  removed.mockClear();
  hit = null;
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => hit });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<Harness />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'elementFromPoint');
});
function row(key: string) {
  const element = host.querySelector<HTMLElement>(`[data-tree-key="${key}"]`)!;
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    top: 100,
    bottom: 140,
    left: 0,
    right: 300,
    height: 40,
    width: 300,
    x: 0,
    y: 100,
    toJSON: () => undefined,
  });
  return element;
}
function pointer(target: EventTarget, type: string, x = 100, y = 120) {
  target.dispatchEvent(
    Object.assign(
      new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y }),
      { pointerId: 1, isPrimary: true }
    )
  );
}
function start(key?: string) {
  const source = key
    ? row(key).querySelector('[data-context-menu-source]')!
    : host.querySelector('[data-context-menu-source="catalog"]')!;
  act(() => pointer(source, 'pointerdown', 10, 10));
}
function over(element: Element | null, y = 120) {
  hit = element;
  act(() => pointer(window, 'pointermove', 100, y));
}
function drop(y = 120) {
  act(() => pointer(window, 'pointerup', 100, y));
}
it('draws after the last visible child and inserts beside the whole expanded section', () => {
  act(() => host.querySelector<HTMLButtonElement>('[aria-label="Expand: A"]')!.click());
  start();
  over(row('section:a'), 139);
  expect(
    host
      .querySelector('[data-drop-edge="after"]')
      ?.closest('[data-tree-key]')
      ?.getAttribute('data-tree-key')
  ).toBe('command:sniptale.gallery');
  drop(139);
  expect(
    changed.mock.calls[0]![0].nodes.map(
      (node: { id?: string; command?: string }) => node.id ?? node.command
    )
  ).toEqual(['a', 'sniptale.settings', 'b']);
});
it.each(['Escape', 'pointercancel', 'blur', 'outside'] as const)(
  'cancels %s without a later stale commit',
  (cancel) => {
    start();
    over(row('section:a'), 101);
    expect(host.querySelector('[data-drop-edge="before"]')).not.toBeNull();
    act(() => {
      if (cancel === 'Escape')
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      else if (cancel === 'outside') {
        hit = null;
        pointer(window, 'pointermove', 999, 999);
      } else window.dispatchEvent(new Event(cancel));
    });
    expect(host.querySelector('[data-drop-edge]')).toBeNull();
    drop();
    expect(changed).not.toHaveBeenCalled();
  }
);
it('expands only the current hovered section', async () => {
  vi.useFakeTimers();
  start();
  over(row('section:a'));
  over(row('section:b'));
  await act(async () => vi.advanceTimersByTimeAsync(451));
  expect(row('section:a').getAttribute('aria-expanded')).toBe('false');
  expect(row('section:b').getAttribute('aria-expanded')).toBe('true');
});
it('nests a whole section and rejects dropping it into itself or its descendants', () => {
  start('section:b');
  over(row('section:a'));
  drop();
  expect(changed.mock.calls[0]![0].nodes[0].children[1]).toMatchObject({ id: 'b' });
  changed.mockClear();
  start('section:a');
  over(row('section:b'));
  drop();
  expect(changed).not.toHaveBeenCalled();
  start('section:a');
  over(row('section:a'));
  drop();
  expect(changed).not.toHaveBeenCalled();
});
it('recomputes the release location rather than committing a stale preview', () => {
  start();
  over(row('section:a'), 101);
  hit = row('section:b');
  drop();
  expect(changed.mock.calls[0]![0].nodes[1].children[0]).toMatchObject({
    command: 'sniptale.settings',
  });
});
it('accepts root insertion and catalog return, but rejects catalog-to-catalog gestures', () => {
  start();
  over(host.querySelector('[data-context-menu-catalog]'));
  drop();
  expect(changed).not.toHaveBeenCalled();
  start();
  over(host.querySelector('[data-context-menu-tree]'));
  drop();
  expect(changed.mock.calls[0]![0].nodes[2]).toMatchObject({ command: 'sniptale.settings' });
  start('section:a');
  over(host.querySelector('[data-context-menu-catalog]'));
  drop();
  expect(removed).toHaveBeenCalledExactlyOnceWith('section:a');
});
it('rejects foreign drag data and unregistered catalog items', () => {
  const target = row('section:a');
  act(() =>
    target.dispatchEvent(
      Object.assign(new Event('drop', { bubbles: true }), {
        dataTransfer: { getData: () => 'command:unknown' },
      })
    )
  );
  const source = host.querySelector<HTMLElement>('[data-context-menu-source="catalog"]')!;
  source.dataset['commandKey'] = 'command:unknown';
  start();
  over(target);
  drop();
  expect(changed).not.toHaveBeenCalled();
});

it('keeps a pointer session across an equivalent saved-draft refresh', () => {
  start();
  over(row('section:a'), 101);
  act(() =>
    [...host.querySelectorAll('button')]
      .find((button) => button.textContent === 'Refresh saved draft')!
      .click()
  );
  expect(host.querySelector('.context-menu-drag-preview')).not.toBeNull();
  drop(101);
  expect(changed).toHaveBeenCalledOnce();
});

it('cancels an obsolete session when the actual draft changes', () => {
  start();
  over(row('section:a'), 101);
  act(() =>
    [...host.querySelectorAll('button')]
      .find((button) => button.textContent === 'Replace draft')!
      .click()
  );
  expect(host.querySelector('.context-menu-drag-preview')).toBeNull();
  drop(101);
  expect(changed).not.toHaveBeenCalled();
});
it('accepts insertion into an empty menu', () => {
  act(() => root.render(<Harness key="empty" empty />));
  start();
  over(host.querySelector('[data-context-menu-tree]'));
  drop();
  expect(changed.mock.calls[0]![0].nodes).toEqual([
    { type: 'command', command: 'sniptale.settings', enabled: true },
  ]);
});
it.each([
  ['before', 101, 0],
  ['after', 139, 1],
] as const)('inserts at the %s section edge without nesting', (_edge, y, index) => {
  start();
  over(row('section:a'), y);
  drop(y);
  expect(changed.mock.calls[0]![0].nodes[index]).toMatchObject({ command: 'sniptale.settings' });
});
