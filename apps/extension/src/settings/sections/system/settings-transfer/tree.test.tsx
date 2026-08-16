// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SettingsTransferTreeNode } from '../../../../contracts/settings-transfer';
import { SettingsTransferTree } from './tree';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('exposes nested checkbox tree semantics and an indeterminate parent', () => {
  const child = node('domain.items.a', 'domain.items', []);
  const collection = node('domain.items', 'domain', [child]);
  const domain = node('domain', null, [collection]);
  const onToggle = vi.fn();
  act(() =>
    root.render(
      <SettingsTransferTree nodes={[domain]} selected={new Set([child.id])} onToggle={onToggle} />
    )
  );

  const treeItems = container.querySelectorAll('[role="treeitem"]');
  expect(treeItems).toHaveLength(3);
  expect(treeItems[0]?.getAttribute('aria-checked')).toBe('mixed');
  expect(treeItems[2]?.getAttribute('aria-level')).toBe('3');
  const checkboxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
  expect(checkboxes[0]?.indeterminate).toBe(true);
  act(() => checkboxes[2]?.click());
  expect(onToggle).toHaveBeenCalledWith(child, false);
});

it('uses roving focus and supports standard tree keyboard navigation', () => {
  const firstChild = node('domain.items.a', 'domain.items', []);
  const secondChild = node('domain.items.b', 'domain.items', []);
  const collection = node('domain.items', 'domain', [firstChild, secondChild]);
  const domain = node('domain', null, [collection]);
  const onToggle = vi.fn();
  act(() =>
    root.render(<SettingsTransferTree nodes={[domain]} selected={new Set()} onToggle={onToggle} />)
  );

  const treeItems = [...container.querySelectorAll<HTMLElement>('[role="treeitem"]')];
  expect(treeItems.map((item) => item.tabIndex)).toEqual([0, -1, -1, -1]);
  act(() => treeItems[0]?.focus());
  pressKey('ArrowRight');
  expect(document.activeElement).toBe(treeItems[1]);
  pressKey('ArrowDown');
  expect(document.activeElement).toBe(treeItems[2]);
  pressKey('End');
  expect(document.activeElement).toBe(treeItems[3]);
  pressKey('ArrowLeft');
  expect(document.activeElement).toBe(treeItems[1]);
  pressKey('Home');
  expect(document.activeElement).toBe(treeItems[0]);
  pressKey(' ');
  expect(onToggle).toHaveBeenLastCalledWith(domain, true);
  expect(treeItems.map((item) => item.tabIndex)).toEqual([0, -1, -1, -1]);
});

function pressKey(key: string) {
  act(() =>
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  );
}

function node(
  id: string,
  parentId: string | null,
  children: SettingsTransferTreeNode[]
): SettingsTransferTreeNode {
  return {
    id,
    parentId,
    domainId: 'domain',
    labelKey: 'settings.settingsTransfer.fields.items',
    descriptionKey: 'settings.settingsTransfer.fieldDescription',
    kind: children.length > 0 ? 'collection' : 'item',
    classification: 'transferable',
    selectable: true,
    requiredBy: [],
    children,
  };
}
