// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
vi.mock('../../../../../features/editor/presets/preview', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../features/editor/presets/preview')>()),
  renderEditorPresetPreview: () => null,
}));
vi.mock('../../../../../features/editor/presets/display', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../features/editor/presets/display')>()),
  getEditorPresetDisplayName: () => 'Pencil',
}));
const state = vi.hoisted(() => ({
  value: {
    selection: { owner: 'pencil', setOwner: vi.fn() },
    collection: { presets: [], defaultPresetId: '' },
    actions: {
      movePreset: vi.fn(),
      togglePreset: vi.fn(),
      makeDefault: vi.fn(),
      deletePreset: vi.fn(),
    },
  } as any,
}));
vi.mock('./controller', () => ({ useToolPresetsController: () => state.value }));
import { ToolPresetsSettings } from './view';
it('renders the tool catalog surface', () => {
  const node = document.createElement('div');
  const root = createRoot(node);
  act(() => root.render(<ToolPresetsSettings />));
  expect(node.textContent).toContain('settings.editor.toolPresetsTitle');
  act(() => root.unmount());
});

it('renders preset capabilities and forwards catalog actions', () => {
  state.value = {
    ...state.value,
    collection: {
      presets: [
        { id: 'system', enabled: true, isSystemDefault: true },
        { id: 'custom', enabled: false, isSystemDefault: false },
      ],
      defaultPresetId: 'system',
    },
  };
  const node = document.createElement('div');
  const root = createRoot(node);
  act(() => root.render(<ToolPresetsSettings />));
  expect(node.textContent).toContain('settings.editor.createInEditorHint');
  expect(node.textContent).toContain('highlighter.section.systemBadge');
  const handles = node.querySelectorAll('[draggable="true"]');
  const rows = node.querySelectorAll('[data-settings-collection-item]');
  act(() => {
    (node.querySelector('section > div button') as HTMLElement | null)?.click();
    handles[1]?.dispatchEvent(new Event('dragstart', { bubbles: true }));
  });
  act(() => {
    rows[0]?.dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true }));
    rows[0]?.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    handles[1]?.dispatchEvent(new Event('dragend', { bubbles: true }));
    rows[1]
      ?.querySelector('button[aria-label="settings.collection.actions.enable"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    [...(rows[1]?.querySelectorAll('button') ?? [])]
      .find((button) => button.textContent?.includes('settings.collection.actions.delete'))
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  expect(state.value.actions.movePreset).toHaveBeenCalledWith('custom', 'system');
  expect(state.value.actions.togglePreset).toHaveBeenCalledWith('custom', true);
  expect(state.value.actions.makeDefault).not.toHaveBeenCalledWith('custom');
  expect(state.value.actions.deletePreset).toHaveBeenCalledWith('custom');
  act(() => root.unmount());
});
