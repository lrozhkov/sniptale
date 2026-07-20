// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { translate } from '../../../../../platform/i18n';
import type { SavePreset } from '../../../../../contracts/settings';
import { PresetRowActions } from './preset-row-actions';

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

function renderActions(enabled: boolean) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  const props = {
    hovered: true,
    onDelete: vi.fn(),
    onEdit: vi.fn(),
    onToggleEnabled: vi.fn(async () => undefined),
    preset: createPreset({ enabled }),
  };

  act(() => {
    root?.render(<PresetRowActions {...props} />);
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

it('uses the hidden-title copy for enabled presets and shown-title copy for disabled presets', () => {
  renderActions(true);
  expect(container?.querySelector('[title]')?.getAttribute('title')).toBe(
    translate('savePresets.section.toggleHiddenTitle')
  );

  renderActions(false);
  expect(container?.querySelector('[title]')?.getAttribute('title')).toBe(
    translate('savePresets.section.toggleShownTitle')
  );
});
