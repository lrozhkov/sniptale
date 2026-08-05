// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { createSystemStepBadgePresetCatalog } from '../../../../features/highlighter/step-badge-presets/catalog';
import { StepBadgePresetsPanel } from './panel';
import type { StepBadgePresetCatalogController } from './types';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));

function actions(): StepBadgePresetCatalogController['actions'] {
  return {
    add: vi.fn(),
    closeEditor: vi.fn(),
    delete: vi.fn(async () => undefined),
    dragEnd: vi.fn(),
    dragLeave: vi.fn(),
    dragOver: vi.fn(),
    dragStart: vi.fn(),
    drop: vi.fn(async () => undefined),
    edit: vi.fn(),
    hover: vi.fn(),
    reset: vi.fn(async () => undefined),
    save: vi.fn(async () => undefined),
    setDefault: vi.fn(async () => undefined),
    toggle: vi.fn(async () => undefined),
  };
}

function controller(): StepBadgePresetCatalogController {
  return {
    actions: actions(),
    catalog: {
      catalogCustomized: false,
      defaultPresetId: 'system-classic',
      presets: createSystemStepBadgePresetCatalog(),
      systemCatalogRevision: 1,
    },
    draggedId: null,
    dragOverId: null,
    editor: { isOpen: false },
    error: false,
    hoveredId: null,
    isLoading: false,
    isSaving: false,
  };
}

it('renders catalog, loading, error, reset, and user delete states', () => {
  const base = controller();
  expect(renderToStaticMarkup(<StepBadgePresetsPanel controller={base} />)).toContain(
    'highlighter.stepBadgePresets.defaultBadge'
  );
  expect(
    renderToStaticMarkup(<StepBadgePresetsPanel controller={{ ...base, isLoading: true }} />)
  ).toContain('common.states.loading');
  expect(
    renderToStaticMarkup(
      <StepBadgePresetsPanel controller={{ ...base, catalog: null, error: true }} />
    )
  ).toContain('highlighter.stepBadgePresets.messages.loadError');
  const system = { ...base.catalog!.presets[0]!, customized: true };
  const user = { ...base.catalog!.presets[1]!, id: 'user-1', origin: 'user' as const };
  base.catalog = { ...base.catalog!, presets: [system, user] };
  base.hoveredId = system.id;
  expect(renderToStaticMarkup(<StepBadgePresetsPanel controller={base} />)).toContain(
    'highlighter.stepBadgePresets.reset'
  );
  base.hoveredId = user.id;
  expect(renderToStaticMarkup(<StepBadgePresetsPanel controller={base} />)).toContain(
    'highlighter.stepBadgePresets.delete'
  );
});

it('routes enabled row and add interactions through controller actions', async () => {
  const value = controller();
  const user = {
    ...value.catalog!.presets[1]!,
    id: 'user-interactive',
    name: 'Interactive',
    origin: 'user' as const,
  };
  value.catalog = { ...value.catalog!, presets: [...value.catalog!.presets, user] };
  value.hoveredId = user.id;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(<StepBadgePresetsPanel controller={value} />));
  const row = host.querySelector<HTMLElement>('[draggable="true"]');
  await act(async () => row?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true })));
  await act(async () => row?.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true })));
  for (const button of host.querySelectorAll<HTMLButtonElement>('button')) {
    if (!button.disabled) await act(async () => button.click());
  }
  expect(value.actions.add).toHaveBeenCalled();
  expect(value.actions.edit).toHaveBeenCalled();
  expect(value.actions.toggle).toHaveBeenCalled();
  expect(value.actions.delete).toHaveBeenCalledWith(user);
  await act(async () => root.unmount());
  host.remove();
});
