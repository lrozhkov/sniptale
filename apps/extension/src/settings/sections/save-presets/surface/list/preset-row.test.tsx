// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { translate } from '../../../../../platform/i18n';
import type { SavePreset } from '../../../../../contracts/settings';
import { PresetRow } from './preset-row';

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

function renderRow(overrides: Partial<Parameters<typeof PresetRow>[0]> = {}) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  const preset = createPreset();
  const props = {
    draggedId: preset.id,
    dragOverId: preset.id,
    hoveredPresetId: preset.id,
    onDelete: vi.fn(),
    onDragEnd: vi.fn(),
    onDragLeave: vi.fn(),
    onDragOver: vi.fn(),
    onDragStart: vi.fn(),
    onDrop: vi.fn(),
    onEdit: vi.fn(),
    onHoverChange: vi.fn(),
    onToggleEnabled: vi.fn(async () => undefined),
    preset,
    ...overrides,
  };

  act(() => {
    root?.render(<PresetRow {...props} />);
  });

  return props;
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

it('wires hover and action callbacks', () => {
  const props = renderRow();

  const editButton = container?.querySelector<HTMLButtonElement>(
    `button[title="${translate('common.actions.edit')}"]`
  );
  const deleteButton = container?.querySelector<HTMLButtonElement>(
    `button[title="${translate('common.actions.delete')}"]`
  );

  act(() => {
    editButton?.click();
    deleteButton?.click();
    container?.firstElementChild?.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
  });

  expect(props.onEdit).toHaveBeenCalledWith(props.preset);
  expect(props.onDelete).toHaveBeenCalledWith(props.preset);
  expect(props.onHoverChange).toHaveBeenCalledWith(null);
  expect(container?.textContent).toContain(props.preset.path);
});
