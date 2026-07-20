// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { translate } from '../../../../../platform/i18n';
import type { ViewportPreset } from '../../../../../contracts/settings';
import { PresetRow } from './preset-row';

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

function renderRow(overrides: Partial<Parameters<typeof PresetRow>[0]> = {}) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  const preset = createPreset();
  const props = {
    hoveredViewportId: preset.id,
    onDelete: vi.fn(),
    onEdit: vi.fn(),
    onHoverChange: vi.fn(),
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

  expect(container?.textContent).toContain(props.preset.label);
  expect(container?.textContent).toContain('1440 × 900');
  expect(props.onEdit).toHaveBeenCalledWith(props.preset);
  expect(props.onDelete).toHaveBeenCalledWith(props.preset);
  expect(props.onHoverChange).toHaveBeenCalledWith(null);
});
