// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { translate } from '../../../../platform/i18n';
import type { ViewportPreset } from '../../../../contracts/settings';
import { PresetsList } from './list/view';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createPreset(overrides: Partial<ViewportPreset> = {}): ViewportPreset {
  return {
    id: overrides.id ?? 'preset-1',
    label: overrides.label ?? 'Desktop',
    width: overrides.width ?? 1440,
    height: overrides.height ?? 900,
  };
}

function renderList(overrides: Partial<Parameters<typeof PresetsList>[0]> = {}) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  const props = {
    hoveredViewportId: null,
    onDelete: vi.fn(),
    onEdit: vi.fn(),
    onHoverChange: vi.fn(),
    presetsCountLabel: 'presets',
    viewportPresets: [],
    ...overrides,
  };

  act(() => {
    root?.render(<PresetsList {...props} />);
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

it('renders the empty presets state', () => {
  renderList();

  expect(container?.textContent).toContain(translate('viewportPresets.section.emptyTitle'));
});

it('wires preset row actions and hover state', () => {
  const preset = createPreset();
  const props = renderList({
    hoveredViewportId: preset.id,
    viewportPresets: [preset],
  });

  const editButton = container?.querySelector<HTMLButtonElement>(
    `button[title="${translate('common.actions.edit')}"]`
  );
  const deleteButton = container?.querySelector<HTMLButtonElement>(
    `button[title="${translate('common.actions.delete')}"]`
  );

  act(() => {
    editButton?.click();
    deleteButton?.click();
  });

  expect(container?.textContent).toContain(preset.label);
  expect(props.onEdit).toHaveBeenCalledWith(preset);
  expect(props.onDelete).toHaveBeenCalledWith(preset);
});
