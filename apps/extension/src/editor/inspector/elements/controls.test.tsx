// @vitest-environment jsdom
import {
  change,
  choose,
  click,
  collection,
  fixture,
  setupElements,
  state,
} from './fixture.test-support';
import { act } from 'react';
import { createEditorIconAppearance } from './presentation';
import { expect, it, vi } from 'vitest';
import { EditorElementsControls, EditorElementsSelected } from './catalog-controls';
import { EditorElementsGrid, EditorVectorSourceNotice, editorVectorErrorMessage } from './catalog';

const ui = setupElements();
function controls(open = false) {
  return (
    <EditorElementsControls headerRef={null} appearanceOpen={open} onAppearance={appearance} />
  );
}
const appearance = vi.fn();
function dialogButton(name: string) {
  const node = Array.from(document.querySelectorAll<HTMLButtonElement>('dialog button')).find(
    (button) => button.textContent === name
  );
  if (!node) throw new Error(`Missing dialog action ${name}`);
  return node;
}
async function pickFiles() {
  const input = ui.host().querySelector<HTMLInputElement>('input[type=file]');
  if (!input) throw new Error('Missing import input');
  const files = [new File(['<svg/>'], 'arrow.svg', { type: 'image/svg+xml' })];
  Object.defineProperty(input, 'files', { configurable: true, value: files });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  return files;
}
it('routes unified search, collection and favorites filters without management tabs', async () => {
  state().local.collections = [collection()];
  await ui.render(controls());
  change(ui.input('editor.elements.search'), 'heart');
  expect(fixture.api.setQuery).toHaveBeenCalledWith('heart');
  act(() =>
    ui
      .host()
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  );
  expect(fixture.api.searchNow).toHaveBeenCalledWith(true);
  await choose(ui.button('editor.elements.collectionFilter'), 'Sample icons');
  expect(fixture.api.setFilter).toHaveBeenLastCalledWith('catalog', 'remote:sample');
  await click(ui.button('editor.elements.favoritesOnly'));
  expect(fixture.api.setFilter).toHaveBeenLastCalledWith('favorites');
  state().tab = 'favorites';
  await ui.render(controls(true));
  await click(ui.button('editor.elements.favoritesOnly'));
  expect(fixture.api.setFilter).toHaveBeenLastCalledWith('catalog');
  await click(ui.button('editor.elements.appearance'));
  expect(appearance).toHaveBeenCalled();
  expect(ui.button('editor.elements.appearance').getAttribute('aria-pressed')).toBe('true');
  expect(ui.host().querySelector('[role="tablist"]')).toBeNull();
  expect(ui.host().textContent).not.toContain('editor.elements.manage');
});
it('holds files until collection confirmation and restores upload focus on cancel', async () => {
  await ui.render(controls());
  const upload = ui.button('editor.elements.import');
  upload.focus();
  await pickFiles();
  expect(document.querySelector('dialog[open]')).not.toBeNull();
  expect(fixture.api.importFiles).not.toHaveBeenCalled();
  await click(dialogButton('editor.elements.cancel'));
  expect(document.querySelector('dialog')).toBeNull();
  expect(document.activeElement).toBe(upload);
  expect(fixture.api.importFiles).not.toHaveBeenCalled();
  expect(fixture.api.createCollection).not.toHaveBeenCalled();
});
it('imports into a named new collection only on confirmation', async () => {
  fixture.api.importFiles.mockResolvedValueOnce(true);
  await ui.render(controls());
  const files = await pickFiles();
  await click(dialogButton('editor.elements.importConfirm'));
  expect(fixture.api.importFiles).toHaveBeenCalledExactlyOnceWith(files, undefined, 'arrow');
  expect(document.querySelector('dialog')).toBeNull();
});
it('keeps refused imports visible, prevents replay and allows cancellation', async () => {
  fixture.api.importFiles.mockResolvedValueOnce(false);
  state().collection = 'local:local';
  state().local.collections = [collection()];
  await ui.render(controls());
  const files = await pickFiles();
  await click(dialogButton('editor.elements.importConfirm'));
  expect(fixture.api.importFiles).toHaveBeenCalledWith(files, 'local', undefined);
  expect(document.querySelector('dialog [role="alert"]')).not.toBeNull();
  expect(dialogButton('editor.elements.importConfirm').disabled).toBe(true);
  await click(dialogButton('editor.elements.cancel'));
  expect(document.querySelector('dialog')).toBeNull();
});
it('gates insertion and deletion until an available selection is ready', async () => {
  const add = vi.fn(async () => {});
  const footer = (inserting = false) => (
    <EditorElementsSelected footerRef={null} inserting={inserting} onAdd={add} />
  );
  await ui.render(footer());
  expect(ui.button('editor.elements.add').disabled).toBe(true);
  state().selectedKey = state().entries[0]!.key;
  await ui.render(footer());
  expect(ui.host().textContent).toContain('Arrow');
  await click(ui.button('editor.elements.add'));
  expect(add).toHaveBeenCalledWith(state().entries[0]);
  await click(ui.button('editor.elements.removeItem'));
  expect(fixture.api.removeItem).toHaveBeenCalledWith(state().selectedKey);
  await ui.render(footer(true));
  expect(ui.button('editor.elements.add').disabled).toBe(true);
  state().entries[0]!.definition = null;
  await ui.render(footer());
  expect(ui.button('editor.elements.add').disabled).toBe(true);
});
it('shows unresolved and refused previews with disabled favorites and preserves grid interactions', async () => {
  const ready = state().entries[0]!;
  const entries = [
    ready,
    { ...ready, key: 'loading', name: 'Loading', definition: null },
    { ...ready, key: 'refused', name: 'Refused', definition: null, issue: true },
  ];
  const select = vi.fn(),
    add = vi.fn(),
    pointer = vi.fn();
  await ui.render(
    <EditorElementsGrid
      entries={entries}
      selectedKey={ready.key}
      appearance={createEditorIconAppearance(true)}
      onSelect={select}
      onAdd={add}
      onPointerDown={pointer}
    />
  );
  expect(ui.host().querySelector('[aria-label="editor.elements.loading"]')).not.toBeNull();
  expect(ui.host().querySelector('[aria-label="editor.elements.refused"]')).not.toBeNull();
  expect(ui.host().querySelectorAll('[data-ui="editor.elements.card"]')).toHaveLength(3);
  expect(ui.button('Arrow').getAttribute('aria-pressed')).toBe('true');
  await click(ui.button('Arrow'));
  act(() => ui.button('Arrow').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
  expect(select).toHaveBeenCalledWith(ready);
  expect(pointer).toHaveBeenCalledOnce();
  expect(add).not.toHaveBeenCalled();
});
it('renders unknown provenance without unsafe links and gives generic errors a clear fallback', async () => {
  const provenance = state().entries[0]!.definition!.provenance;
  await ui.render(
    <EditorVectorSourceNotice
      name="Arrow"
      provenance={{
        ...provenance,
        sourceId: null,
        author: 'Artist',
        authorUrl: 'javascript:alert(1)',
      }}
    />
  );
  expect(ui.host().querySelector('a')).toBeNull();
  expect(ui.host().textContent).toContain('Artist');
  expect(ui.host().textContent).toContain('editor.elements.licenseUnknown');
  expect(editorVectorErrorMessage(null)).toBe('editor.elements.operationFailed');
  expect(editorVectorErrorMessage('unknown')).toBe('editor.elements.operationFailed');
});
it('refuses an empty destination name before publication and cancels on the native dialog event', async () => {
  await ui.render(controls());
  await pickFiles();
  const name = document.querySelector<HTMLInputElement>(
    'input[aria-label="editor.elements.collectionName"]'
  );
  if (!name) throw new Error('Missing collection name');
  change(name, '   ');
  expect(dialogButton('editor.elements.importConfirm').disabled).toBe(true);
  await act(async () =>
    document
      .querySelector('dialog')
      ?.dispatchEvent(new Event('cancel', { bubbles: false, cancelable: true }))
  );
  expect(fixture.api.importFiles).not.toHaveBeenCalled();
  expect(document.querySelector('dialog')).toBeNull();
});
it('searches loaded collection names locally and restores chooser focus on Escape', async () => {
  await ui.render(controls());
  const trigger = ui.button('editor.elements.collectionFilter');
  await click(trigger);
  const search = document.querySelector<HTMLInputElement>(
    'input[aria-label="editor.elements.searchCollections"]'
  );
  if (!search) throw new Error('Missing collection search');
  expect(document.activeElement).toBe(search);
  change(search, 'no-match');
  expect(document.querySelectorAll('[role="option"]')).toHaveLength(0);
  change(search, 'sample');
  expect(document.querySelectorAll('[role="option"]')).toHaveLength(1);
  expect(document.querySelector('[role="option"]')?.textContent).toBe('Sample icons');
  expect(fixture.api.searchNow).not.toHaveBeenCalled();
  await act(async () =>
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  );
  expect(document.activeElement).toBe(trigger);
  expect(document.querySelector('[role="listbox"]')).toBeNull();
});
