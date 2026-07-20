// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { translate } from '../../../../../platform/i18n';
import type { SavePreset } from '../../../../../contracts/settings';
import { PresetsListBody, PresetsListHeader } from '.';

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

function renderElement(element: React.ReactElement) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(element);
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
  vi.unstubAllGlobals();
});

function verifyHeaderAndEmptyState() {
  renderElement(
    <div>
      <PresetsListHeader presetCountLabel="presets" presets={[]} />
      <PresetsListBody
        draggedId={null}
        dragOverId={null}
        hoveredPresetId={null}
        onDelete={vi.fn()}
        onDragEnd={vi.fn()}
        onDragLeave={vi.fn()}
        onDragOver={vi.fn()}
        onDragStart={vi.fn()}
        onDrop={vi.fn()}
        onEdit={vi.fn()}
        onHoverChange={vi.fn()}
        onToggleEnabled={vi.fn(async () => undefined)}
        presets={[]}
      />
    </div>
  );

  expect(container?.textContent).toContain(translate('savePresets.section.folderPresetsLabel'));
  expect(container?.textContent).toContain(translate('savePresets.section.emptyTitle'));
}

function createInteractionHandlers() {
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
  };
}

function triggerRowEvents(row: Element | null) {
  act(() => {
    row?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    row?.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    row?.dispatchEvent(new Event('dragstart', { bubbles: true }));
    row?.dispatchEvent(new Event('dragover', { bubbles: true }));
    row?.dispatchEvent(new Event('dragleave', { bubbles: true }));
    row?.dispatchEvent(new Event('drop', { bubbles: true }));
    row?.dispatchEvent(new Event('dragend', { bubbles: true }));
  });
}

function triggerRowActionButtons() {
  act(() => {
    container?.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      if (button.title === translate('common.actions.edit')) {
        button.click();
      }
      if (button.title === translate('common.actions.delete')) {
        button.click();
      }
      if (
        button.title === translate('savePresets.section.toggleHiddenTitle') ||
        button.title === translate('savePresets.section.toggleShownTitle')
      ) {
        button.click();
      }
    });
  });
}

function verifyRowInteractions() {
  const preset = createPreset();
  const handlers = createInteractionHandlers();

  renderElement(
    <PresetsListBody
      draggedId={preset.id}
      dragOverId={preset.id}
      hoveredPresetId={preset.id}
      onDelete={handlers.onDelete}
      onDragEnd={handlers.onDragEnd}
      onDragLeave={handlers.onDragLeave}
      onDragOver={handlers.onDragOver}
      onDragStart={handlers.onDragStart}
      onDrop={handlers.onDrop}
      onEdit={handlers.onEdit}
      onHoverChange={handlers.onHoverChange}
      onToggleEnabled={handlers.onToggleEnabled}
      presets={[preset]}
    />
  );
  triggerRowEvents(container?.querySelector(`div[draggable="true"]`) ?? null);
  triggerRowActionButtons();

  expect(handlers.onHoverChange).toHaveBeenCalledWith(preset.id);
  expect(handlers.onHoverChange).toHaveBeenCalledWith(null);
  expect(handlers.onDragStart).toHaveBeenCalled();
  expect(handlers.onDragOver).toHaveBeenCalled();
  expect(handlers.onDragLeave).toHaveBeenCalled();
  expect(handlers.onDrop).toHaveBeenCalled();
  expect(handlers.onDragEnd).toHaveBeenCalled();
  expect(handlers.onEdit).toHaveBeenCalledWith(preset);
  expect(handlers.onDelete).toHaveBeenCalledWith(preset);
  expect(handlers.onToggleEnabled).toHaveBeenCalledWith(preset);
}

function runSavePresetsListViewsSuite() {
  it(
    'renders the list header and empty state when there are no presets',
    verifyHeaderAndEmptyState
  );
  it(
    'routes hover, drag, toggle, edit, and delete interactions for preset rows',
    verifyRowInteractions
  );
}

describe('save-presets list-views owner', runSavePresetsListViewsSuite);
