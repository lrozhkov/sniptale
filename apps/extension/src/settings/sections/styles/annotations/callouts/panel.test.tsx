// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { createSystemCalloutPresetCatalog } from '../../../../../features/highlighter/callout-presets/catalog';
import { CalloutPresetsPanel } from './panel';
import type { CalloutPresetCatalogController } from './types';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
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
    editor: { isOpen: false },
    error: false,
    isLoading: false,
    isSaving: false,
    actions: {
      add: vi.fn(),
      closeEditor: vi.fn(),
      delete: vi.fn(),
      edit: vi.fn(),
      moveBefore: vi.fn(),
      reset: vi.fn(),
      save: vi.fn(),
      setNewSessionEnabled: vi.fn(),
      setNewSessionTemplateSource: vi.fn(),
      setDefault: vi.fn(),
      toggle: vi.fn(),
    },
  };
}

describe('CalloutPresetsPanel', () => {
  it('renders all fifteen system previews, default state, and catalog controls', () => {
    const markup = renderToStaticMarkup(<CalloutPresetsPanel controller={createController()} />);
    expect(markup.match(/highlighter\.calloutPresets\.system\./g)).toHaveLength(15);
    expect(markup).toContain('settings.collection.defaultBadge');
    expect(markup).toContain('settings.collection.builtInBadge');
    expect(markup).toContain('highlighter.calloutPresets.add');
    expect(markup).toContain('highlighter.calloutPresets.newSession.sectionTitle');
    expect(markup).not.toContain('highlighter.calloutPresets.description');
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
    const systemMarkup = renderToStaticMarkup(<CalloutPresetsPanel controller={controller} />);
    expect(systemMarkup).toContain('settings.collection.actions.reset');

    const userMarkup = renderToStaticMarkup(<CalloutPresetsPanel controller={controller} />);
    expect(userMarkup).toContain('settings.collection.actions.delete');
    expect(userMarkup).toContain('settings.collection.actions.setDefault');
  });

  it('routes row and add interactions through the controller actions', async () => {
    const controller = createController();
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
    expect(controller.actions.setNewSessionEnabled).toHaveBeenCalledWith(true);
    await act(async () => root.unmount());
    container.remove();
  });
});
