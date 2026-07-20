// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createScenarioProjectV3,
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

it('renders selected element parameters above the docked layers list', async () => {
  renderInspector({ selectedElementId: 'text-1', slide: createScenarioSlide({ title: 'Intro' }) });

  const parameters = container?.querySelector('[data-ui="scenario.inspector.parameters"]');
  const layers = container?.querySelector('[data-ui="scenario.inspector.layers-dock"]');
  expect(container?.querySelector('[role="tablist"]')).toBeNull();
  expect(container?.querySelector('[data-ui="shared.ui.color-selector"]')).not.toBeNull();
  expect(container?.querySelector('[data-ui="scenario.inspector.layers"]')).not.toBeNull();
  expect(parameters?.className).toContain('overflow-x-hidden');
  expect(layers?.className).toContain('flex-1');
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

  expect(container?.textContent).toContain(translate('scenario.editor.presentation'));
});

it('uses the full embedded inspector height when layers are hosted separately', () => {
  renderInspector({
    embedded: true,
    hideLayers: true,
    selectedElementId: 'text-1',
    slide: createScenarioSlide({ title: 'Intro' }),
  });

  const parameters = container?.querySelector('[data-ui="scenario.inspector.parameters"]');
  expect(parameters?.className).toContain('flex-1');
  expect(container?.querySelector('[data-ui="scenario.inspector.layers-dock"]')).toBeNull();
});

it('exposes layer selection, order, visibility, lock, and delete controls', () => {
  const { onDeleteElement, onMoveElement, onSelectElement, onUpdateElement } = renderInspector({
    selectedElementId: null,
  });
  const screenshotLayer = container
    ?.querySelector('[data-ui="scenario.inspector.layers"]')
    ?.querySelector<HTMLButtonElement>('button');

  act(() => {
    screenshotLayer?.click();
    clickByLabel(translate('scenario.editor.moveLayerForward'));
    clickByLabel(translate('scenario.editor.hideLayer'));
    clickByLabel(translate('scenario.editor.lockLayer'));
    clickByLabel(translate('scenario.editor.deleteLayer'));
  });

  expect(onSelectElement).toHaveBeenCalledWith('image-1');
  expect(onMoveElement).toHaveBeenCalledWith('image-1', 'forward');
  expect(onUpdateElement).toHaveBeenCalledWith('image-1', { visible: false });
  expect(onUpdateElement).toHaveBeenCalledWith('image-1', { locked: true });
  expect(onDeleteElement).toHaveBeenCalledWith('image-1');
});

it('renders grid tool parameters as an inspector tool', () => {
  const canvasControls = createCanvasControls({ navigator: true });
  renderInspector({ activeTool: 'grid', canvasControls, selectedElementId: 'text-1' });

  act(() => {
    clickByLabel(translate('scenario.editor.toggleGrid'));
    clickByLabel(translate('scenario.editor.toggleSnapToGrid'));
  });

  expect(container?.querySelector('[data-ui="scenario.inspector.grid-tool"]')).not.toBeNull();
  expect(canvasControls.onSetGridVisible).toHaveBeenCalledWith(false);
  expect(canvasControls.onSetSnapToGrid).toHaveBeenCalledWith(true);

  act(() => {
    root?.render(
      <ScenarioInspectorPanel
        elements={createInspectorElements()}
        selectedElementId="text-1"
        {...createCallbacks()}
        activeTool="grid"
        canvasControls={createCanvasControls({ navigator: false })}
      />
    );
  });
  expect(container?.querySelector('[data-ui="scenario.inspector.grid-tool"]')).not.toBeNull();
});

it('renders export as an inspector command tool', async () => {
  const onOpenExport = vi.fn();
  renderInspector({
    activeTool: 'export',
    exportCommand: { onOpenExport },
    project: createScenarioProjectV3('Inspector export'),
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
  canvasControls?: ScenarioInspectorProps['canvasControls'];
  embedded?: boolean;
  exportCommand?: ScenarioInspectorProps['exportCommand'];
  hideLayers?: boolean;
  project?: ScenarioInspectorProps['project'];
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
        {...(args.canvasControls ? { canvasControls: args.canvasControls } : {})}
        {...(args.embedded ? { embedded: args.embedded } : {})}
        {...(args.exportCommand ? { exportCommand: args.exportCommand } : {})}
        {...(args.hideLayers ? { hideLayers: args.hideLayers } : {})}
        {...(args.project ? { project: args.project } : {})}
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
    onMoveElement: vi.fn(),
    onSelectElement: vi.fn(),
    onUpdateElement: vi.fn(),
    onUpdateSlide: vi.fn(),
  };
}

function clickByLabel(label: string) {
  const labeled = container?.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
  const textButton = Array.from(
    container?.querySelectorAll<HTMLButtonElement>('button') ?? []
  ).find((button) => button.textContent?.includes(label));
  (labeled ?? textButton)?.click();
}

async function clickButtonText(text: string) {
  const buttons = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []);
  const button = buttons.find((candidate) => candidate.textContent?.trim() === text);
  expect(button).not.toBeNull();
  await act(async () => {
    button?.click();
  });
}

function createCanvasControls(args: { navigator: boolean }) {
  const navigatorControls = args.navigator
    ? { navigatorVisible: false, onSetNavigatorVisible: vi.fn() }
    : {};
  return {
    gridVisible: true,
    magnetEnabled: false,
    onFit: vi.fn(),
    onSetGridVisible: vi.fn(),
    onSetMagnetEnabled: vi.fn(),
    onSetSnapToGrid: vi.fn(),
    onZoomIn: vi.fn(),
    onZoomOne: vi.fn(),
    onZoomOut: vi.fn(),
    scale: 0.75,
    snapToGrid: false,
    zoomMode: 'fit' as const,
    ...navigatorControls,
  };
}
