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
import { expect, it, vi } from 'vitest';
import { EditorElementsControls, EditorElementsSelected } from './catalog-controls';
import { EditorElementsGrid, EditorVectorSourceNotice, editorVectorErrorMessage } from './catalog';

const ui = setupElements();
function controls(dark = false, importCollection = '') {
  return (
    <EditorElementsControls
      headerRef={null}
      dark={dark}
      onDarkChange={darkChange}
      onManage={manage}
      importCollection={importCollection}
      setImportCollection={importChange}
    />
  );
}
const darkChange = vi.fn(),
  manage = vi.fn(),
  importChange = vi.fn();
it('routes search, tabs, collection filters, preview and management controls', async () => {
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
  await click(ui.button('editor.elements.catalog'));
  expect(fixture.api.setFilter).toHaveBeenLastCalledWith('catalog');
  await choose(ui.button('editor.elements.collectionFilter'), 'Sample icons');
  expect(fixture.api.setFilter).toHaveBeenLastCalledWith('mine', 'remote:sample');
  await choose(ui.button('editor.elements.importTo'), 'My collection');
  expect(importChange).toHaveBeenCalledWith('local');
  await click(ui.button('editor.elements.previewDark'));
  expect(darkChange).toHaveBeenCalledWith(true);
  await ui.render(controls(true));
  await click(ui.button('editor.elements.previewLight'));
  expect(darkChange).toHaveBeenLastCalledWith(false);
  await click(ui.button('editor.elements.manage'));
  expect(manage).toHaveBeenCalledOnce();
});
it('opens file selection and imports files into the selected collection before management', async () => {
  await ui.render(controls(false, 'local'));
  const input = ui.host().querySelector<HTMLInputElement>('input[type=file]');
  if (!input) throw new Error('Missing file input');
  const open = vi.spyOn(input, 'click');
  await click(ui.button('editor.elements.import'));
  expect(open).toHaveBeenCalledOnce();
  const files = [new File(['<svg/>'], 'arrow.svg', { type: 'image/svg+xml' })];
  Object.defineProperty(input, 'files', { configurable: true, value: files });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  expect(fixture.api.importFiles).toHaveBeenCalledWith(files, 'local');
  expect(manage).toHaveBeenCalledOnce();
  Object.defineProperty(input, 'files', { configurable: true, value: null });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  expect(fixture.api.importFiles).toHaveBeenCalledOnce();
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
  expect(ui.host().textContent).toContain('Arrow · local');
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
    favorite = vi.fn(),
    pointer = vi.fn();
  await ui.render(
    <EditorElementsGrid
      entries={entries}
      selectedKey={ready.key}
      dark
      onSelect={select}
      onAdd={add}
      onFavorite={favorite}
      onPointerDown={pointer}
    />
  );
  expect(ui.host().querySelector('[aria-label="editor.elements.loading"]')).not.toBeNull();
  expect(ui.host().querySelector('[aria-label="editor.elements.refused"]')).not.toBeNull();
  expect(ui.host().querySelectorAll('button:disabled')).toHaveLength(2);
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
