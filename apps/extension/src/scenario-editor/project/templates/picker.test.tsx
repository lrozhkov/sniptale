// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScenarioSlide } from '../../../features/scenario/project/v3';
import { listBundledScenarioTemplates } from '../../../features/scenario/project/v3/templates';
import type { ScenarioTemplateDefinition } from '@sniptale/runtime-contracts/scenario/types/v3';
import { translate } from '../../../platform/i18n';
import { ScenarioTemplatePicker } from './picker';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderPicker(
  templates: readonly ScenarioTemplateDefinition[] = listBundledScenarioTemplates()
) {
  const onCreateSlide = vi.fn();
  const onOpenManager = vi.fn();

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <ScenarioTemplatePicker
        onCreateSlide={onCreateSlide}
        onOpenManager={onOpenManager}
        templates={templates}
      />
    );
  });

  return { onCreateSlide, onOpenManager };
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

describe('scenario template picker', () => {
  it('shows bundled previews and dispatches create-slide actions', () => {
    const { onCreateSlide, onOpenManager } = renderPicker();
    const buttons = container?.querySelectorAll<HTMLButtonElement>('button');
    const firstPreview = container?.querySelector<HTMLImageElement>('img[aria-hidden="true"]');
    const picker = container?.querySelector<HTMLElement>('[data-ui="scenario.templates.picker"]');

    act(() => {
      buttons?.[0]?.click();
      buttons?.[1]?.click();
    });

    expect(container?.textContent).toContain(translate('scenario.editor.newSlideFromTemplate'));
    expect(picker?.className).toContain('sniptale-dropdown-menu');
    expect(container?.textContent).not.toContain(translate('scenario.editor.applyTemplate'));
    expect(container?.textContent).toContain(
      translate('scenario.editor.templateScreenshotFocusLabel')
    );
    expect(decodeURIComponent(firstPreview?.src ?? '')).not.toContain('Missing image');
    expect(onOpenManager).toHaveBeenCalledTimes(1);
    expect(onCreateSlide).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: 'screenshot-focus' })
    );
  });

  it('renders imported presentation layouts without raw source labels', () => {
    renderPicker([createImportedTemplate()]);

    expect(container?.textContent).toContain('Team grid');
    expect(container?.textContent).toContain('Team-specific layout');
    expect(container?.textContent).toContain(translate('scenario.editor.layoutSourceImported'));
    expect(container?.textContent).toContain(translate('scenario.editor.layoutGroupSection'));
    expect(container?.textContent).not.toContain('imported');
  });
});

function createImportedTemplate(): ScenarioTemplateDefinition {
  const slide = createScenarioSlide({ title: 'Team grid' });
  return {
    catalogRank: 1,
    catalogStatus: 'core',
    description: 'Team-specific layout',
    group: 'team',
    label: 'Team grid',
    slide: {
      canvas: slide.canvas,
      elements: slide.elements,
      layout: slide.layout,
      notes: slide.notes,
      title: slide.title,
    },
    source: 'imported',
    templateId: 'team-grid',
    version: 1,
  };
}
