// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { translate } from '../../../../../platform/i18n';
import type { SavePreset } from '../../../../../contracts/settings';
import { PresetsList } from './root';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createPreset(overrides: Partial<SavePreset> = {}): SavePreset {
  return {
    id: overrides.id ?? 'preset-1',
    name: overrides.name ?? 'Downloads',
    path: overrides.path ?? '/tmp/downloads',
    enabled: overrides.enabled ?? true,
    order: overrides.order ?? 1,
  };
}

function createHandlers() {
  return {
    onDelete: vi.fn(),
    onDragEnd: vi.fn(),
    onDragLeave: vi.fn(),
    onDragOver: vi.fn(),
    onDragStart: vi.fn(),
    onDrop: vi.fn(),
    onEdit: vi.fn(),
    onHoverChange: vi.fn(),
    onToggleEnabled: vi.fn(async () => undefined),
    onSavePreset: vi.fn(async () => undefined),
    onCloseDeleteDialog: vi.fn(),
    onCloseEditor: vi.fn(),
    confirmDeletePreset: vi.fn(async () => undefined),
  };
}

function renderList() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  const handlers = createHandlers();

  act(() => {
    root?.render(
      <PresetsList
        confirmDelete={null}
        confirmDeletePreset={handlers.confirmDeletePreset}
        draggedId={null}
        dragOverId={null}
        hoveredPresetId="preset-1"
        isEditorOpen={false}
        onCloseDeleteDialog={handlers.onCloseDeleteDialog}
        onCloseEditor={handlers.onCloseEditor}
        onDelete={handlers.onDelete}
        onDragEnd={handlers.onDragEnd}
        onDragLeave={handlers.onDragLeave}
        onDragOver={handlers.onDragOver}
        onDragStart={handlers.onDragStart}
        onDrop={handlers.onDrop}
        onEdit={handlers.onEdit}
        onHoverChange={handlers.onHoverChange}
        onSavePreset={handlers.onSavePreset}
        onToggleEnabled={handlers.onToggleEnabled}
        presetCountLabel="presets"
        presets={[createPreset()]}
      />
    );
  });

  return handlers;
}

function renderEmptyList() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(
      <PresetsList
        confirmDelete={null}
        confirmDeletePreset={vi.fn(async () => undefined)}
        draggedId={null}
        dragOverId={null}
        editingPreset={createPreset({ id: 'preset-2', name: 'Archive' })}
        hoveredPresetId={null}
        isEditorOpen
        onCloseDeleteDialog={vi.fn()}
        onCloseEditor={vi.fn()}
        onDelete={vi.fn()}
        onDragEnd={vi.fn()}
        onDragLeave={vi.fn()}
        onDragOver={vi.fn()}
        onDragStart={vi.fn()}
        onDrop={vi.fn()}
        onEdit={vi.fn()}
        onHoverChange={vi.fn()}
        onSavePreset={vi.fn(async () => undefined)}
        onToggleEnabled={vi.fn(async () => undefined)}
        presetCountLabel="presets"
        presets={[]}
      />
    );
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('save-presets list', () => {
  it('routes row actions through the list body helpers', () => {
    const handlers = renderList();

    act(() => {
      container?.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
        button.click();
      });
    });

    expect(handlers.onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'preset-1' }));
    expect(handlers.onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'preset-1' }));
    expect(handlers.onToggleEnabled).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'preset-1' })
    );
  });

  it('renders empty-state and editor overlay branch when presets are empty', () => {
    renderEmptyList();

    expect(container?.textContent).toContain(translate('savePresets.section.emptyTitle'));
    expect(container?.textContent).toContain(translate('savePresets.editor.editTitle'));
  });
});
