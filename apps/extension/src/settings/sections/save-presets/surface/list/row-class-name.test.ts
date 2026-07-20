import { expect, it } from 'vitest';

import type { SavePreset } from '../../../../../contracts/settings';
import { getPresetRowClassName } from './row-class-name';

function createPreset(overrides: Partial<SavePreset> = {}): SavePreset {
  return {
    id: overrides.id ?? 'preset-1',
    name: overrides.name ?? 'Downloads',
    path: overrides.path ?? '/tmp/downloads',
    enabled: overrides.enabled ?? true,
    order: overrides.order ?? 1,
  };
}

it('adds disabled, dragged, and drag-over state classes', () => {
  const className = getPresetRowClassName({
    draggedId: 'preset-1',
    dragOverId: 'preset-1',
    preset: createPreset({ enabled: false }),
  });

  expect(className).toContain('opacity-50');
  expect(className).toContain('scale-[0.98]');
  expect(className).toContain(
    'border-[color:color-mix(in_srgb,var(--sniptale-color-success)_36%,var(--sniptale-color-border-soft)_64%)]'
  );
  expect(className).toContain(
    'bg-[color:color-mix(in_srgb,var(--sniptale-color-success)_8%,transparent)]'
  );
});
