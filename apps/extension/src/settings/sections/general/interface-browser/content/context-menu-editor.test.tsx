// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRecommendedContextMenuSettings } from '../../../../../contracts/settings/context-menu-layout';
import { ContextMenuEditor } from './context-menu-editor';

let container: HTMLDivElement;
let root: Root;
let editorState: ComponentProps<typeof ContextMenuEditor>['state'];
const update = vi.fn();
const retry = vi.fn();

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  update.mockReset().mockResolvedValue(undefined);
  retry.mockReset();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  editorState = {
    contextMenu: createRecommendedContextMenuSettings(),
    contextMenuCatalogStatus: 'ready',
    contextMenuSettingsStatus: 'ready',
    contextMenuQuickActions: [],
    contextMenuViewportPresets: [],
    retryContextMenuCatalog: retry,
    retryContextMenuSettings: retry,
    locale: 'en',
    updateContextMenu: update,
  };
  await renderEditor();
});

async function renderEditor() {
  await act(async () => root.render(<ContextMenuEditor state={editorState} />));
}
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(
    (entry) => entry.getAttribute('aria-label') === label || entry.textContent?.trim() === label
  );
  if (!found) throw new Error(`Button missing: ${label}`);
  return found;
}
async function click(label: string) {
  await act(async () => button(label).click());
}

it('edits one command tree and saves a v2 layout through the settings owner', async () => {
  expect(container.querySelectorAll('[role="treeitem"]').length).toBeGreaterThan(10);
  await click('Create section here');
  const name = container.querySelector<HTMLInputElement>('input[aria-label="Section name"]');
  expect(name).not.toBeNull();
  await act(async () => {
    name!.value = 'My tools';
    name!.dispatchEvent(new Event('input', { bubbles: true }));
    name!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  await click('Save menu');
  expect(update).toHaveBeenCalledWith(
    expect.objectContaining({
      layout: expect.objectContaining({ version: 2 }),
    })
  );
  expect(container.textContent).toContain('Menu saved');
  expect(container.querySelector('[role="status"]')?.textContent).toContain('Menu saved');
  expect(button('Save menu').disabled).toBe(true);
});

it('discards a recommended draft without writing', async () => {
  await click('Restore recommended configuration');
  await click('Discard changes');
  expect(update).not.toHaveBeenCalled();
});

it('retains a draft on write failure, blocks duplicate save, and retries', async () => {
  let rejectWrite: ((error: Error) => void) | undefined;
  update.mockImplementationOnce(
    () =>
      new Promise<void>((_resolve, reject) => {
        rejectWrite = reject;
      })
  );
  await click('Save menu');
  await click('Save menu');
  expect(update).toHaveBeenCalledOnce();
  await act(async () => rejectWrite?.(new Error('storage unavailable')));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('try again');
  await click('Save menu');
  expect(update).toHaveBeenCalledTimes(2);
});

it('keeps a newer draft unsaved when an earlier write completes', async () => {
  let finishWrite: (() => void) | undefined;
  update.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishWrite = resolve;
      })
  );
  await click('Save menu');
  await click('Move down: Prepare page');
  expect(button('Save menu').disabled).toBe(true);
  await act(async () => finishWrite?.());
  expect(container.querySelector('[role="status"]')?.textContent).toContain(
    'Changes take effect after saving'
  );
  expect(button('Save menu').disabled).toBe(false);
  await click('Save menu');
  expect(update).toHaveBeenCalledTimes(2);
  expect(update.mock.calls[0]?.[0].layout.nodes).not.toEqual(
    update.mock.calls[1]?.[0].layout.nodes
  );
});

it('waits for stored settings and refreshes only a clean draft from the authority', async () => {
  await act(async () => root.unmount());
  root = createRoot(container);
  editorState = { ...editorState, contextMenuSettingsStatus: 'loading' };
  await renderEditor();
  expect(container.querySelector('[role="tree"]')).toBeNull();

  editorState = {
    ...editorState,
    contextMenuSettingsStatus: 'ready',
    contextMenu: {
      ...editorState.contextMenu,
      layout: {
        version: 2,
        nodes: [{ type: 'command', command: 'sniptale.video.tab', enabled: false }],
      },
    },
  };
  await renderEditor();
  expect(container.querySelectorAll('[role="treeitem"]')).toHaveLength(1);
  const videoRow = container.querySelector<HTMLElement>(
    '[data-tree-key="command:sniptale.video.tab"]'
  );
  expect(videoRow).toBeTruthy();
  await act(async () => videoRow?.focus());

  editorState = {
    ...editorState,
    contextMenu: {
      ...editorState.contextMenu,
      layout: {
        version: 2,
        nodes: [{ type: 'command', command: 'sniptale.gallery', enabled: true }],
      },
    },
  };
  await renderEditor();
  expect(
    container.querySelector<HTMLElement>('[data-tree-key="command:sniptale.gallery"]')?.tabIndex
  ).toBe(0);

  await click('Create section here');
  editorState = {
    ...editorState,
    contextMenu: {
      ...editorState.contextMenu,
      layout: {
        version: 2,
        nodes: [{ type: 'command', command: 'sniptale.settings', enabled: true }],
      },
    },
  };
  await renderEditor();
  expect(container.querySelector('input[aria-label="Section name"]')).toBeTruthy();
  expect(container.querySelector('[data-tree-key="command:sniptale.gallery"]')).toBeTruthy();
  expect(container.querySelector('[data-tree-key="command:sniptale.settings"]')).toBeNull();
});

it('moves keyboard focus from a catalog Add button to the inserted tree command', async () => {
  editorState = {
    ...editorState,
    contextMenu: {
      ...editorState.contextMenu,
      layout: {
        version: 2,
        nodes: [{ type: 'command', command: 'sniptale.settings', enabled: true }],
      },
    },
  };
  await renderEditor();
  const add = button('Add command: Library');
  await act(async () => {
    add.focus();
    add.click();
  });
  expect(add.disabled).toBe(true);
  expect(document.activeElement).toBe(
    container.querySelector('[data-tree-key="command:sniptale.gallery"]')
  );
});

it('saves an edited legacy menu with 100 quick actions without losing them', async () => {
  editorState = {
    ...editorState,
    contextMenuQuickActions: Array.from({ length: 100 }, (_, index) => ({
      id: index === 0 ? 'a'.repeat(513) : `action-${index}`,
      status: true,
      name: `Action ${index}`,
      icon: 'camera',
      screenshotMode: 'visible' as const,
      exitAfterCapture: false,
    })),
  };
  await renderEditor();
  expect(container.querySelectorAll('[role="treeitem"]').length).toBeGreaterThan(100);
  await click('Move down: Prepare page');
  expect(button('Save menu').disabled).toBe(false);
  await click('Save menu');
  const saved = update.mock.calls[0]?.[0].layout;
  expect(saved.version).toBe(2);
  expect(
    saved.nodes.filter(
      (node: { type: string; command?: string }) =>
        node.type === 'command' && node.command?.startsWith('sniptale.screenshots.quick-action.')
    )
  ).toHaveLength(100);
});

it('shows a retry path when saved settings cannot be loaded', async () => {
  editorState = { ...editorState, contextMenuSettingsStatus: 'failed' };
  await renderEditor();
  expect(container.querySelector('[role="tree"]')).toBeNull();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    'Could not load the saved menu'
  );
  await click('Retry loading');
  expect(retry).toHaveBeenCalledOnce();
});
