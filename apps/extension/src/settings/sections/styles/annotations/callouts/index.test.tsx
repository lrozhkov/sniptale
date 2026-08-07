// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ editor: vi.fn(() => null), panel: vi.fn(() => null) }));

vi.mock('./editor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./editor')>()),
  CalloutPresetEditor: mocks.editor,
}));
vi.mock('./panel', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./panel')>()),
  CalloutPresetsPanel: mocks.panel,
}));

import { CalloutPresetCatalogSettings } from '.';
import type { CalloutPresetCatalogController } from './types';

it('composes the catalog panel and editor with one controller owner', () => {
  const controller: CalloutPresetCatalogController = {
    actions: {
      add: vi.fn(),
      closeEditor: vi.fn(),
      delete: vi.fn(),
      dragEnd: vi.fn(),
      dragLeave: vi.fn(),
      dragOver: vi.fn(),
      dragStart: vi.fn(),
      drop: vi.fn(),
      edit: vi.fn(),
      hover: vi.fn(),
      reset: vi.fn(),
      save: vi.fn(),
      setDefault: vi.fn(),
      toggle: vi.fn(),
    },
    catalog: null,
    draggedId: null,
    dragOverId: null,
    editor: { isOpen: false },
    error: false,
    hoveredId: null,
    isLoading: false,
    isSaving: false,
  };
  renderToStaticMarkup(<CalloutPresetCatalogSettings controller={controller} />);
  expect(mocks.panel).toHaveBeenCalledWith({ controller }, undefined);
  expect(mocks.editor).toHaveBeenCalledWith({ controller }, undefined);
});
