// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ editor: vi.fn(() => null), panel: vi.fn(() => null) }));
vi.mock('./editor', () => ({ StepBadgePresetEditor: mocks.editor }));
vi.mock('./panel', () => ({ StepBadgePresetsPanel: mocks.panel }));
import { StepBadgePresetCatalogSettings } from '.';
import type { StepBadgePresetCatalogController } from './types';

it('composes panel and editor with one catalog controller', () => {
  const actions: StepBadgePresetCatalogController['actions'] = {
    add: vi.fn(),
    closeEditor: vi.fn(),
    delete: vi.fn(async () => undefined),
    dragEnd: vi.fn(),
    dragLeave: vi.fn(),
    dragOver: vi.fn(),
    dragStart: vi.fn(),
    drop: vi.fn(async () => undefined),
    edit: vi.fn(),
    hover: vi.fn(),
    reset: vi.fn(async () => undefined),
    save: vi.fn(async () => undefined),
    setDefault: vi.fn(async () => undefined),
    toggle: vi.fn(async () => undefined),
  };
  const controller: StepBadgePresetCatalogController = {
    actions,
    catalog: null,
    draggedId: null,
    dragOverId: null,
    editor: { isOpen: false },
    error: false,
    hoveredId: null,
    isLoading: false,
    isSaving: false,
  };
  renderToStaticMarkup(<StepBadgePresetCatalogSettings controller={controller} />);
  expect(mocks.panel).toHaveBeenCalledWith({ controller }, undefined);
  expect(mocks.editor).toHaveBeenCalledWith({ controller }, undefined);
});
