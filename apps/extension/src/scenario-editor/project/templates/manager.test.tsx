// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createScenarioSlide } from '../../../features/scenario/project/v3';
import { translate } from '../../../platform/i18n';
import { ScenarioTemplateManager } from './manager';
import type { ScenarioEditorTemplateLibrary } from './types';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('opens import UI and dispatches library management actions', () => {
  const props = renderManager([createLibrary()]);

  act(() =>
    container
      ?.querySelector<HTMLButtonElement>(
        `[aria-label="${translate('scenario.editor.importTemplateLibrary')}"]`
      )
      ?.click()
  );
  act(() => container?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click());
  act(() =>
    container
      ?.querySelector<HTMLButtonElement>(
        `[aria-label="${translate('scenario.editor.deleteTemplateLibrary')}"]`
      )
      ?.click()
  );
  act(() => findButton(translate('scenario.editor.templateManagerClose'))?.click());

  expect(container?.querySelector('[data-ui="scenario.templates.import-dialog"]')).not.toBeNull();
  expect(props.onToggleLibrary).toHaveBeenCalledWith('library-1');
  expect(props.onDeleteLibrary).toHaveBeenCalledWith('library-1');
  expect(props.onClose).toHaveBeenCalledTimes(1);
});

it('renders empty manager state', () => {
  renderManager([]);

  expect(container?.textContent).toContain(
    translate('scenario.editor.noImportedTemplateLibraries')
  );
});

function renderManager(libraries: ScenarioEditorTemplateLibrary[]) {
  const props = {
    onClose: vi.fn(),
    onDeleteLibrary: vi.fn(),
    onSaveLibrary: vi.fn(),
    onToggleLibrary: vi.fn(),
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(<ScenarioTemplateManager libraries={libraries} {...props} />);
  });

  return props;
}

function findButton(label: string) {
  return Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []).find((button) =>
    button.textContent?.includes(label)
  );
}

function createLibrary(): ScenarioEditorTemplateLibrary {
  return {
    createdAt: 1,
    enabled: true,
    id: 'library-1',
    name: 'Team library',
    templates: [
      {
        catalogRank: 1,
        catalogStatus: 'core',
        description: 'Team',
        group: 'team',
        label: 'Team',
        slide: {
          canvas: createScenarioSlide({ title: 'Team' }).canvas,
          elements: [],
          layout: createScenarioSlide({ title: 'Team' }).layout,
          notes: '',
          title: 'Team',
        },
        source: 'imported',
        templateId: 'team',
        version: 1,
      },
    ],
    updatedAt: 1,
  };
}
