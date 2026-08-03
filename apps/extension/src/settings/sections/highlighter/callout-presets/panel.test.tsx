// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { createSystemCalloutPresetCatalog } from '../../../../features/highlighter/callout-presets/catalog';
import { CalloutPresetsPanel } from './panel';
import type { CalloutPresetCatalogController } from './types';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));

function createController(): CalloutPresetCatalogController {
  return {
    catalog: {
      catalogCustomized: false,
      defaultPresetId: 'system-callout-bubble',
      presets: createSystemCalloutPresetCatalog(),
      systemCatalogRevision: 1,
    },
    draggedId: null,
    dragOverId: null,
    editor: { isOpen: false },
    error: false,
    hoveredId: null,
    isLoading: false,
    isSaving: false,
    actions: {
      add: vi.fn(),
      closeEditor: vi.fn(),
      delete: vi.fn(),
      dragEnd: vi.fn(),
      dragLeave: vi.fn(),
      dragOver: vi.fn(),
      dragStart: vi.fn(),
      drop: vi.fn(),
      edit: vi.fn(),
      hover: vi.fn(),
      reset: vi.fn(),
      save: vi.fn(),
      setDefault: vi.fn(),
      toggle: vi.fn(),
    },
  };
}

describe('CalloutPresetsPanel', () => {
  it('renders all six system previews, default state, and catalog controls', () => {
    const markup = renderToStaticMarkup(<CalloutPresetsPanel controller={createController()} />);
    expect(markup.match(/highlighter\.calloutPresets\.system\./g)).toHaveLength(6);
    expect(markup).toContain('highlighter.calloutPresets.defaultBadge');
    expect(markup).toContain('highlighter.calloutPresets.systemBadge');
    expect(markup).toContain('highlighter.calloutPresets.add');
  });

  it('renders loading and error states without a catalog', () => {
    expect(
      renderToStaticMarkup(
        <CalloutPresetsPanel controller={{ ...createController(), isLoading: true }} />
      )
    ).toContain('common.states.loading');
    expect(
      renderToStaticMarkup(
        <CalloutPresetsPanel controller={{ ...createController(), catalog: null, error: true }} />
      )
    ).toContain('highlighter.calloutPresets.messages.loadError');
  });

  it('renders reset and delete actions for customized system and user presets', () => {
    const controller = createController();
    const system = { ...controller.catalog!.presets[0]!, customized: true };
    const user = {
      ...controller.catalog!.presets[1]!,
      id: 'user-one',
      name: 'User preset',
      origin: 'user' as const,
      systemPresetKey: undefined,
    };
    controller.catalog = { ...controller.catalog!, presets: [system, user] };
    controller.hoveredId = system.id;
    const systemMarkup = renderToStaticMarkup(<CalloutPresetsPanel controller={controller} />);
    expect(systemMarkup).toContain('highlighter.calloutPresets.reset');

    controller.hoveredId = user.id;
    const userMarkup = renderToStaticMarkup(<CalloutPresetsPanel controller={controller} />);
    expect(userMarkup).toContain('common.actions.delete');
    expect(userMarkup).toContain('highlighter.calloutPresets.makeDefault');
  });

  it('routes row and add interactions through the controller actions', async () => {
    const controller = createController();
    controller.hoveredId = controller.catalog!.presets[1]!.id;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<CalloutPresetsPanel controller={controller} />));
    const buttons = [...container.querySelectorAll<HTMLButtonElement>('button')];
    for (const button of buttons) {
      if (!button.disabled) await act(async () => button.click());
    }
    expect(controller.actions.add).toHaveBeenCalled();
    expect(controller.actions.edit).toHaveBeenCalled();
    await act(async () => root.unmount());
    container.remove();
  });
});
