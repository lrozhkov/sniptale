// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ContextMenuTree } from '../../../../../contracts/settings/context-menu-layout';
import { ContextMenuTreeView } from './context-menu-tree';

let host: HTMLDivElement;
let root: Root;
const changed = vi.fn();
const payload = {
  types: ['text/plain'],
  dropEffect: '',
  getData: () => 'command:sniptale.settings',
};
function Harness() {
  const [tree, setTree] = useState<ContextMenuTree>({
    version: 2,
    nodes: [
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
  return (
    <ContextMenuTreeView
      tree={tree}
      selectedKey={selected}
      onSelect={select}
      expanded={expanded}
      onExpanded={expand}
      locale="en"
      onAnnounce={() => {}}
      catalog={[
        { command: 'sniptale.settings', label: 'Settings', group: 'Open', available: true },
        { command: 'sniptale.gallery', label: 'Gallery', group: 'Open', available: true },
      ]}
      onChange={(next) => {
        changed(next);
        setTree(next);
      }}
    />
  );
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  changed.mockClear();
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
});
function row(key: string) {
  const element = host.querySelector<HTMLElement>(`[data-tree-key="${key}"]`);
  if (!element) throw new Error(`Missing row ${key}`);
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
function drag(target: HTMLElement, kind: string, x = 100, y = 120) {
  target.dispatchEvent(
    Object.assign(new Event(kind, { bubbles: true, cancelable: true }), {
      dataTransfer: payload,
      clientX: x,
      clientY: y,
    })
  );
}
it('draws after an expanded section below its last visible child and commits beside the whole section', () => {
  act(() => host.querySelector<HTMLButtonElement>('[aria-label="Expand: A"]')?.click());
  const target = row('section:a');
  act(() => drag(target, 'dragover', 100, 139));
  const indicator = host.querySelector('[data-drop-edge="after"][data-drop-target="section:a"]');
  expect(indicator?.closest('[data-tree-key]')?.getAttribute('data-tree-key')).toBe(
    'command:sniptale.gallery'
  );
  act(() => drag(target, 'drop', 100, 139));
  expect(changed).toHaveBeenLastCalledWith(
    expect.objectContaining({
      nodes: [
        expect.objectContaining({
          id: 'a',
          children: [expect.objectContaining({ command: 'sniptale.gallery' })],
        }),
        expect.objectContaining({ command: 'sniptale.settings' }),
        expect.objectContaining({ id: 'b' }),
      ],
    })
  );
});
it.each(['dragend', 'Escape', 'dragleave'])(
  'clears catalog preview on %s and refuses a later drop',
  (cancel) => {
    const target = row('section:a');
    act(() => drag(target, 'dragover', 100, 101));
    expect(host.querySelector('[data-drop-edge="before"]')).not.toBeNull();
    act(() => {
      if (cancel === 'Escape')
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      else if (cancel === 'dragend') window.dispatchEvent(new Event('dragend'));
      else {
        const tree = host.querySelector<HTMLElement>('[role="tree"]');
        if (!tree) throw new Error('Missing tree');
        drag(tree, 'dragleave', 9999, 9999);
      }
    });
    expect(host.querySelector('[data-drop-edge]')).toBeNull();
    act(() => drag(target, 'drop', 100, 101));
    expect(changed).not.toHaveBeenCalled();
  }
);
it('cancels expansion of the previous section when catalog hover moves to another', async () => {
  vi.useFakeTimers();
  act(() => drag(row('section:a'), 'dragover'));
  act(() => drag(row('section:b'), 'dragover'));
  await act(async () => vi.advanceTimersByTimeAsync(451));
  expect(row('section:a').getAttribute('aria-expanded')).toBe('false');
  expect(row('section:b').getAttribute('aria-expanded')).toBe('true');
});
it('uses the current accepted target when dragover and drop arrive in the same frame', () => {
  const target = row('section:a');
  act(() => {
    drag(target, 'dragover', 100, 101);
    drag(target, 'drop', 100, 101);
  });
  expect(changed.mock.calls[0]?.[0].nodes[0]).toMatchObject({ command: 'sniptale.settings' });
});
