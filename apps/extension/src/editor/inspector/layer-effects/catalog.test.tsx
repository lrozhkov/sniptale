// @vitest-environment jsdom
import { act } from 'react';
import type React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import { LayerEffectsCatalog } from './catalog';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderCatalog(props: Partial<React.ComponentProps<typeof LayerEffectsCatalog>> = {}) {
  const onOpenLayerEffects = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <LayerEffectsCatalog
        activeEffectId="brightness"
        definitions={[
          {
            category: 'adjustments',
            id: 'contrast',
            titleKey: 'editor.layerEffects.contrast',
          } as never,
          {
            category: 'adjustments',
            id: 'brightness',
            titleKey: 'editor.layerEffects.brightness',
          } as never,
        ]}
        layerEffects={[{ amount: 0.25, enabled: true, id: 'brightness' }]}
        layerId="layer-1"
        onOpenLayerEffects={onOpenLayerEffects}
        {...props}
      />
    );
  });

  return { onOpenLayerEffects };
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

it('sorts applied effects first and keeps compact applied badge typography', () => {
  renderCatalog();

  const buttons = Array.from(container?.querySelectorAll('button') ?? []);
  const appliedBadge = buttons[0]?.querySelectorAll('span')[1];

  expect(buttons[0]?.textContent).toContain('editor.layerEffects.brightness');
  expect(buttons[0]?.className).toContain(
    'border-[color:var(--sniptale-color-border-accent-strong)]'
  );
  expect(buttons[1]?.className).toContain('border-[color:var(--sniptale-color-border-soft)]');
  expect(appliedBadge?.className).toContain('font-semibold uppercase');
  expect(appliedBadge?.className).not.toContain('tracking-');
});

it('opens a catalog effect without delegating ownership to the parent surface', () => {
  const { onOpenLayerEffects } = renderCatalog();
  const button = container?.querySelector('button');

  act(() => button?.click());

  expect(onOpenLayerEffects).toHaveBeenCalledWith('layer-1', 'adjustments', 'brightness', {
    focusViewport: false,
  });
});

it('renders a compact empty state when filtering removes every effect', () => {
  renderCatalog({ definitions: [] });

  expect(container?.textContent).toContain('editor.toolbar.layerEffectsNoMatches');
});
