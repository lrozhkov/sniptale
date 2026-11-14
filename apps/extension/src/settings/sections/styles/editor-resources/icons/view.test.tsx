// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { EditorVectorSettings } from '../../../../../composition/persistence/vector-elements';
import { EditorVectorCatalogError } from '../../../../../features/editor/vector-catalog';
import { IconsSettings } from './view';

const mocks = vi.hoisted(() => ({
  settings: null as EditorVectorSettings | null,
  library: {
    readSettings: vi.fn(),
    readCatalog: vi.fn(),
    updateSettings: vi.fn(),
    createCollection: vi.fn(),
    renameCollection: vi.fn(),
    removeCollection: vi.fn(),
    removePreset: vi.fn(),
  },
  cache: { stats: vi.fn(), clear: vi.fn() },
  permission: vi.fn(),
  check: vi.fn(),
}));
vi.mock('../../../../../composition/persistence/vector-elements', () => ({
  createEditorVectorLibraryMetadata: () => mocks.library,
  createEditorVectorCache: () => mocks.cache,
}));
vi.mock('../../../../../workflows/vector-catalog/client', () => ({
  createEditorVectorCatalogClient: () => ({ check: mocks.check }),
  requestEditorVectorCatalogPermission: mocks.permission,
}));
vi.mock('../../../../../platform/i18n', () => ({
  translate: (key: string) => key,
  formatNumber: (value: number) => String(value),
  getCurrentLocale: () => 'en',
}));
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.settings = {
    key: 'settings',
    kind: 'settings',
    incarnation: 'source',
    revision: 1,
    baseUrl: 'https://api.iconify.design/',
    networkEnabled: true,
    disclosureAccepted: true,
    sourceGeneration: 1,
  };
  mocks.library.readSettings.mockImplementation(async () => mocks.settings);
  mocks.library.readCatalog.mockResolvedValue({
    items: [],
    collections: [],
    members: [],
    presets: [],
  });
  mocks.cache.stats.mockResolvedValue({ entries: 2, bytes: 100, budgetBytes: 1000 });
  mocks.permission.mockResolvedValue(true);
  mocks.library.updateSettings.mockImplementation(async (patch) => {
    mocks.settings = { ...mocks.settings!, ...patch };
    return mocks.settings;
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function render() {
  await act(async () => root.render(<IconsSettings />));
}
function button(name: string) {
  const result = Array.from(host.querySelectorAll('button')).find(
    (node) => node.textContent === name || node.getAttribute('aria-label') === name
  );
  if (!result) throw new Error(`Missing ${name}`);
  return result;
}
function input(name: string) {
  const result = host.querySelector<HTMLInputElement>(`input[aria-label="${name}"]`);
  if (!result) throw new Error(`Missing ${name}`);
  return result;
}
async function change(field: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function click(name: string) {
  await act(async () => button(name).click());
}
it('opens management without network traffic, checks explicitly and preserves stored disable', async () => {
  mocks.settings!.networkEnabled = false;
  await render();
  expect(mocks.check).not.toHaveBeenCalled();
  expect(mocks.permission).not.toHaveBeenCalled();
  expect(button('settings.editor.icons.check').disabled).toBe(true);
  await click('settings.editor.icons.network');
  expect(mocks.permission).toHaveBeenCalledWith('https://api.iconify.design/');
  expect(mocks.library.updateSettings).toHaveBeenCalledWith(
    { networkEnabled: true, disclosureAccepted: true },
    expect.objectContaining({ incarnation: 'source', revision: 1 })
  );
  await click('settings.editor.icons.check');
  expect(mocks.check).toHaveBeenCalledOnce();
  expect(host.querySelector('[role="status"]')?.textContent).toBe('settings.editor.icons.checked');
});
it('retains source draft and current library after a refused save, and Escape restores saved source', async () => {
  await render();
  const field = input('settings.editor.icons.source');
  await change(field, 'https://icons.example/');
  mocks.library.updateSettings.mockRejectedValueOnce(new Error('refused'));
  await click('common.actions.save');
  expect(field.value).toBe('https://icons.example/');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    'settings.editor.icons.saveFailed'
  );
  expect(mocks.settings!.baseUrl).toBe('https://api.iconify.design/');
  expect(button('settings.editor.icons.check').disabled).toBe(true);
  await act(async () =>
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  );
  expect(field.value).toBe('https://api.iconify.design/');
});
it('shows permission refusal without writing settings or sending a check', async () => {
  mocks.permission.mockResolvedValueOnce(false);
  await render();
  await click('settings.editor.icons.check');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    'settings.editor.icons.permissionDenied'
  );
  expect(mocks.library.updateSettings).not.toHaveBeenCalled();
  expect(mocks.check).not.toHaveBeenCalled();
});
it('blocks repeated checks during the server cooldown', async () => {
  mocks.check.mockRejectedValueOnce(new EditorVectorCatalogError('rate-limited', 60));
  await render();
  await click('settings.editor.icons.check');
  expect(button('settings.editor.icons.check').disabled).toBe(true);
  await click('settings.editor.icons.check');
  expect(mocks.check).toHaveBeenCalledOnce();
});
it('cancels collection creation without writes and preserves the name after refusal', async () => {
  await render();
  await click('settings.editor.icons.create');
  const field = input('settings.editor.icons.newCollection');
  expect(document.activeElement).toBe(field);
  await change(field, 'Arrows');
  await click('common.actions.cancel');
  expect(mocks.library.createCollection).not.toHaveBeenCalled();
  await click('settings.editor.icons.create');
  const next = input('settings.editor.icons.newCollection');
  await change(next, 'Arrows');
  mocks.library.createCollection.mockRejectedValueOnce(new Error('refused'));
  await act(async () =>
    next.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  );
  expect(next.value).toBe('Arrows');
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  mocks.library.createCollection.mockResolvedValueOnce(undefined);
  await act(async () =>
    next.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  );
  expect(host.querySelector('input[aria-label="settings.editor.icons.newCollection"]')).toBeNull();
});
it('clears cache only through the explicit management action', async () => {
  await render();
  expect(mocks.cache.clear).not.toHaveBeenCalled();
  await click('settings.editor.icons.clearCache');
  expect(mocks.cache.clear).toHaveBeenCalledOnce();
});

function collectionAction(id: string, action: 'edit' | 'delete') {
  const selector =
    action === 'edit'
      ? '[aria-label="settings.collection.actions.edit"]'
      : '[data-collection-direct-action="delete"]';
  const node = host.querySelector<HTMLButtonElement>(
    `[data-settings-collection-item="${id}"] ${selector}`
  );
  if (!node) throw new Error(`Missing ${action} for ${id}`);
  return node;
}
function seedManagedResources() {
  mocks.library.readCatalog.mockResolvedValue({
    items: [],
    members: [],
    collections: [{ id: 'arrows', name: 'Arrows', incarnation: 'collection-life' }],
    presets: [{ id: 'blue', name: 'Blue', incarnation: 'preset-life' }],
  });
}
it('renames the current collection and explicitly deletes collection and preset identities', async () => {
  seedManagedResources();
  await render();
  expect(host.textContent).toContain('Arrows');
  expect(host.textContent).toContain('Blue');
  await act(async () => collectionAction('arrows', 'edit').click());
  const name = input('settings.editor.icons.rename');
  expect(name.value).toBe('Arrows');
  await change(name, '  Navigation  ');
  const save = Array.from(host.querySelectorAll('button')).find(
    (node) => node.textContent === 'common.actions.save' && !node.disabled
  );
  if (!save) throw new Error('Missing collection save');
  await act(async () => save.click());
  expect(mocks.library.renameCollection).toHaveBeenCalledExactlyOnceWith(
    'arrows',
    'collection-life',
    'Navigation'
  );
  expect(host.querySelector('input[aria-label="settings.editor.icons.rename"]')).toBeNull();
  await act(async () => collectionAction('arrows', 'delete').click());
  expect(mocks.library.removeCollection).toHaveBeenCalledExactlyOnceWith(
    'arrows',
    'collection-life'
  );
  await act(async () => collectionAction('blue', 'delete').click());
  expect(mocks.library.removePreset).toHaveBeenCalledExactlyOnceWith('blue', 'preset-life');
});
it('cancels a collection rename on Escape and refuses blank creation without writes', async () => {
  seedManagedResources();
  await render();
  await act(async () => collectionAction('arrows', 'edit').click());
  const name = input('settings.editor.icons.rename');
  await change(name, 'Uncommitted');
  await act(async () =>
    name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  );
  expect(mocks.library.renameCollection).not.toHaveBeenCalled();
  expect(host.querySelector('input[aria-label="settings.editor.icons.rename"]')).toBeNull();
  await click('settings.editor.icons.create');
  const draft = input('settings.editor.icons.newCollection');
  await change(draft, '   ');
  await act(async () =>
    draft.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  );
  expect(mocks.library.createCollection).not.toHaveBeenCalled();
  await change(draft, 'New pack');
  const create = Array.from(host.querySelectorAll('button')).find(
    (node) =>
      node.textContent === 'settings.editor.icons.create' &&
      node !== button('settings.editor.icons.create')
  );
  if (!create) throw new Error('Missing create confirmation');
  await act(async () => create.click());
  expect(mocks.library.createCollection).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'New pack' })
  );
});
it('saves the edited source on Enter and disables network access without requesting permission', async () => {
  await render();
  const source = input('settings.editor.icons.source');
  await change(source, 'https://icons.example/');
  await act(async () =>
    source.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  );
  expect(mocks.library.updateSettings).toHaveBeenCalledWith(
    { baseUrl: 'https://icons.example/' },
    expect.objectContaining({ incarnation: 'source' })
  );
  expect(source.value).toBe('https://icons.example/');
  mocks.permission.mockClear();
  await click('settings.editor.icons.network');
  expect(mocks.permission).not.toHaveBeenCalled();
  expect(mocks.library.updateSettings).toHaveBeenLastCalledWith(
    { networkEnabled: false },
    expect.objectContaining({ networkEnabled: true })
  );
  expect(button('settings.editor.icons.check').disabled).toBe(true);
});
it.each([
  ['source-changed', 'sourceChanged'],
  ['rate-limited', 'rateLimited'],
  ['network-failed', 'connectionFailed'],
  ['timeout', 'connectionFailed'],
  ['http-error', 'connectionFailed'],
] as const)(
  'shows the recovery message for an explicit check refused with %s',
  async (code, label) => {
    mocks.check.mockRejectedValueOnce(new EditorVectorCatalogError(code));
    await render();
    await click('settings.editor.icons.check');
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      `settings.editor.icons.${label}`
    );
    expect(mocks.library.updateSettings).not.toHaveBeenCalled();
  }
);
it('retries failed Settings loading through the visible recovery action', async () => {
  mocks.library.readSettings.mockRejectedValueOnce(new Error('unavailable'));
  await render();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    'settings.editor.icons.loadFailed'
  );
  expect(button('settings.editor.icons.network').disabled).toBe(true);
  await click('settings.editor.icons.retry');
  expect(input('settings.editor.icons.source').value).toBe('https://api.iconify.design/');
  expect(host.querySelector('[role="alert"]')).toBeNull();
});
it('keeps cache controls disabled while empty and displays recoverable cache failures', async () => {
  mocks.cache.stats.mockResolvedValueOnce({ entries: 0, bytes: 0, budgetBytes: 1000 });
  await render();
  expect(button('settings.editor.icons.clearCache').disabled).toBe(true);
  mocks.cache.stats.mockResolvedValue({ entries: 2, bytes: 100, budgetBytes: 1000 });
  await click('settings.editor.icons.network');
  mocks.cache.clear.mockRejectedValueOnce(new Error('refused'));
  await click('settings.editor.icons.clearCache');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    'settings.editor.icons.saveFailed'
  );
  expect(button('settings.editor.icons.clearCache').disabled).toBe(false);
});
