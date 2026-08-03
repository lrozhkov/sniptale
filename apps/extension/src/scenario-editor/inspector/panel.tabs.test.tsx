// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createScenarioImageElement,
  createScenarioSlide,
  createScenarioTextElement,
} from '../../features/scenario/project/v3';
import { translate } from '../../platform/i18n';
import type { ScenarioElement } from '@sniptale/runtime-contracts/scenario/types/v3';
import { ScenarioInspectorPanel } from './panel';
import type { ScenarioInspectorProps } from './types';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  vi.useRealTimers();
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('renders selected element parameters in the contextual inspector', async () => {
  renderInspector({ selectedElementId: 'text-1', slide: createScenarioSlide({ title: 'Intro' }) });

  const parameters = container?.querySelector('[data-ui="scenario.inspector.parameters"]');
  expect(container?.querySelector('[role="tablist"]')).toBeNull();
  expect(container?.querySelector('[data-ui="shared.ui.color-selector"]')).not.toBeNull();
  expect(container?.querySelector('[data-ui="scenario.inspector.layers"]')).toBeNull();
  expect(parameters?.className).toContain('overflow-x-hidden');
  expect(
    container?.querySelector<HTMLInputElement>(
      `input[type="range"][aria-label="${translate('scenario.editor.opacity')} range"]`
    )
  ).not.toBeNull();

  await act(async () => {
    container
      ?.querySelector<HTMLButtonElement>('[data-ui="shared.ui.color-selector.palette-trigger"]')
      ?.click();
  });
  expect(document.body.textContent).toContain(translate('shared.ui.colorSelectorPalette'));
});

it('renders slide parameters when no element is selected', () => {
  renderInspector({ selectedElementId: null, slide: createScenarioSlide({ title: 'Intro' }) });

  expect(container?.textContent).toContain(translate('scenario.editor.stepDetails'));
  expect(container?.textContent).not.toContain(translate('scenario.editor.presentation'));
});

it('uses the full embedded inspector height', () => {
  renderInspector({
    embedded: true,
    selectedElementId: 'text-1',
    slide: createScenarioSlide({ title: 'Intro' }),
  });

  const parameters = container?.querySelector('[data-ui="scenario.inspector.parameters"]');
  expect(parameters?.className).toContain('flex-1');
  expect(container?.querySelector('[data-ui="scenario.inspector.layers-dock"]')).toBeNull();
});

it('renders export as an inspector command tool', async () => {
  const onOpenExport = vi.fn();
  renderInspector({
    activeTool: 'export',
    exportCommand: { onOpenExport },
    selectedElementId: 'text-1',
  });

  await clickButtonText(translate('scenario.editor.export'));

  expect(container?.querySelector('[data-ui="scenario.inspector.export-tool"]')).not.toBeNull();
  expect(onOpenExport).toHaveBeenCalledTimes(1);
});

function createInspectorElements(): ScenarioElement[] {
  const text = {
    ...createScenarioTextElement({ name: 'Title', text: 'Hello' }),
    id: 'text-1',
  };
  const image = {
    ...createScenarioImageElement({ name: 'Screenshot' }),
    id: 'image-1',
  };

  return [text, image];
}

function renderInspector(args: {
  activeTool?: ScenarioInspectorProps['activeTool'];
  embedded?: boolean;
  exportCommand?: ScenarioInspectorProps['exportCommand'];
  selectedElementId?: string | null;
  slide?: ReturnType<typeof createScenarioSlide>;
}) {
  const callbacks = createCallbacks();

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <ScenarioInspectorPanel
        elements={createInspectorElements()}
        selectedElementId={args.selectedElementId === undefined ? 'text-1' : args.selectedElementId}
        {...callbacks}
        {...(args.activeTool ? { activeTool: args.activeTool } : {})}
        {...(args.embedded ? { embedded: args.embedded } : {})}
        {...(args.exportCommand ? { exportCommand: args.exportCommand } : {})}
        {...(args.slide ? { slide: args.slide } : {})}
      />
    );
  });

  return callbacks;
}

function createCallbacks() {
  return {
    onDeleteElement: vi.fn(),
    onEditImageElement: vi.fn(),
    onUpdateElement: vi.fn(),
    onUpdateSlide: vi.fn(),
  };
}

async function clickButtonText(text: string) {
  const buttons = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []);
  const button = buttons.find((candidate) => candidate.textContent?.trim() === text);
  expect(button).not.toBeNull();
  await act(async () => {
    button?.click();
  });
}
