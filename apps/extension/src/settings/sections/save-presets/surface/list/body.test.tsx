// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { translate } from '../../../../../platform/i18n';
import type { SavePreset } from '../../../../../contracts/settings';
import { PresetsListBody } from './body';

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

function renderBody(overrides: Partial<Parameters<typeof PresetsListBody>[0]> = {}) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  const props = {
    draggedId: null,
    dragOverId: null,
    hoveredPresetId: null,
    onDelete: vi.fn(),
    onDragEnd: vi.fn(),
    onDragLeave: vi.fn(),
    onDragOver: vi.fn(),
    onDragStart: vi.fn(),
    onDrop: vi.fn(),
    onEdit: vi.fn(),
    onHoverChange: vi.fn(),
    onToggleEnabled: vi.fn(async () => undefined),
    presets: [],
    ...overrides,
  };

  act(() => {
    root?.render(<PresetsListBody {...props} />);
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

it('renders the empty state and list metadata', () => {
  renderBody();

  expect(container?.textContent).toContain(translate('savePresets.section.emptyTitle'));
});

it('wires row interactions through the body composition', () => {
  const preset = createPreset();
  const props = renderBody({
    draggedId: preset.id,
    dragOverId: preset.id,
    hoveredPresetId: preset.id,
    presets: [preset],
  });

  const editButton = container?.querySelector<HTMLButtonElement>(
    `button[title="${translate('common.actions.edit')}"]`
  );

  act(() => {
    editButton?.click();
  });

  expect(props.onEdit).toHaveBeenCalledWith(preset);
  expect(container?.textContent).toContain(preset.name);
  expect(container?.textContent).toContain(preset.path);
});
