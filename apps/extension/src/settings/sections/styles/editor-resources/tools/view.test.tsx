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
    drag: {
      draggedId: null,
      dragOverId: null,
      setDraggedId: vi.fn(),
      setDragOverId: vi.fn(),
      clearDrag: vi.fn(),
    },
    actions: {
      dropPreset: vi.fn(),
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
    drag: { ...state.value.drag, dragOverId: 'custom' },
  };
  const node = document.createElement('div');
  const root = createRoot(node);
  act(() => root.render(<ToolPresetsSettings />));
  expect(node.textContent).toContain('settings.editor.createInEditorHint');
  expect(node.textContent).toContain('highlighter.section.systemBadge');
  const rows = node.querySelectorAll('[draggable="true"]');
  act(() => {
    (node.querySelector('section > div button') as HTMLElement | null)?.click();
    rows[1]?.dispatchEvent(new Event('dragstart', { bubbles: true }));
    rows[0]?.dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true }));
    rows[1]?.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    rows[1]?.dispatchEvent(new Event('dragend', { bubbles: true }));
    rows[1]
      ?.querySelectorAll('button')[0]
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    rows[1]
      ?.querySelectorAll('button')[1]
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    rows[1]
      ?.querySelector('button[title="common.actions.delete"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  expect(state.value.drag.setDraggedId).toHaveBeenCalledWith('custom');
  expect(state.value.drag.setDragOverId).toHaveBeenCalledWith('system');
  expect(state.value.actions.dropPreset).toHaveBeenCalledWith('custom');
  expect(state.value.drag.clearDrag).toHaveBeenCalled();
  expect(state.value.actions.togglePreset).toHaveBeenCalledWith('custom', true);
  expect(state.value.actions.makeDefault).not.toHaveBeenCalledWith('custom');
  expect(state.value.actions.deletePreset).toHaveBeenCalledWith('custom');
  act(() => root.unmount());
});
