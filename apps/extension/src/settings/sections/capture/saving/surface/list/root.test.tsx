// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { translate } from '../../../../../../platform/i18n';
import type { SavePreset } from '../../../../../../contracts/settings';
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
    onEdit: vi.fn(),
    onToggleEnabled: vi.fn(async () => undefined),
    onSavePreset: vi.fn(async () => undefined),
    onCloseDeleteDialog: vi.fn(),
    onCloseEditor: vi.fn(),
    confirmDeletePreset: vi.fn(async () => undefined),
  };
}

function renderList(overrides: Partial<React.ComponentProps<typeof PresetsList>> = {}) {
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
        isEditorOpen={false}
        onCloseDeleteDialog={handlers.onCloseDeleteDialog}
        onCloseEditor={handlers.onCloseEditor}
        onDelete={handlers.onDelete}
        onMoveBefore={vi.fn(async () => undefined)}
        onEdit={handlers.onEdit}
        onSavePreset={handlers.onSavePreset}
        onToggleEnabled={handlers.onToggleEnabled}
        presets={[createPreset()]}
        {...overrides}
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
        editingPreset={createPreset({ id: 'preset-2', name: 'Archive' })}
        isEditorOpen
        onCloseDeleteDialog={vi.fn()}
        onCloseEditor={vi.fn()}
        onDelete={vi.fn()}
        onMoveBefore={vi.fn(async () => undefined)}
        onEdit={vi.fn()}
        onSavePreset={vi.fn(async () => undefined)}
        onToggleEnabled={vi.fn(async () => undefined)}
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
  it('keeps loading, Add, defaults and reorder without search or duplicated headings', () => {
    const onMoveBefore = vi.fn(async () => undefined);
    renderList({
      isLoading: true,
      onMoveBefore,
      presets: [createPreset({ name: 'Images', path: 'Captures/Images' })],
    });
    expect(container?.querySelector('[data-testid="settings-card-loading"]')).toBeTruthy();
    expect(container?.querySelector('button')?.disabled).toBe(true);

    renderList({
      isLoading: false,
      onMoveBefore,
      presets: [createPreset({ name: 'Images', path: 'Captures/Images' })],
      defaultImagePresetId: 'preset-1',
    });
    expect(container?.textContent).toContain(translate('savePresets.section.imageDefault'));
    expect(container?.querySelector('input[type="search"]')).toBeNull();
    expect(container?.querySelector('h2')).toBeNull();
    expect(container?.textContent).not.toContain(translate('savePresets.section.listDescription'));
    expect(container?.querySelector('[data-settings-collection-root]')).not.toBeNull();
    expect(
      container?.querySelector(
        `button[aria-label="${translate('settings.collection.dragHandle')}"]`
      )
    ).not.toBeNull();
  });

  it('commits keyboard reordering and opens Add without a preset', () => {
    const onMoveBefore = vi.fn(async () => undefined);
    const handlers = renderList({
      onMoveBefore,
      presets: [createPreset(), createPreset({ id: 'preset-2', name: 'Archive', order: 2 })],
    });
    const handle = container?.querySelector<HTMLButtonElement>(
      `button[aria-label="${translate('settings.collection.dragHandle')}"]`
    );
    expect(handle).not.toBeNull();
    for (const key of [' ', 'ArrowDown', ' ']) {
      act(() => handle?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
    }
    expect(onMoveBefore).toHaveBeenCalledExactlyOnceWith('preset-1', null);
    const add = Array.from(container?.querySelectorAll('button') ?? []).find(
      (button) => button.textContent === translate('savePresets.section.addButton')
    );
    expect(add).toBeDefined();
    act(() => add?.click());
    expect(handlers.onEdit).toHaveBeenCalledExactlyOnceWith();
  });
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
