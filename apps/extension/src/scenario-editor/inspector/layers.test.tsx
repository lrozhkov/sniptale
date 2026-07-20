// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createScenarioProjectV3,
  createScenarioSlide,
  createScenarioTextElement,
} from '../../features/scenario/project/v3';
import { translate } from '../../platform/i18n';
import { SelectedElementInspector } from './element';
import { FrameFields } from './frame';
import { ScenarioLayersInspector } from './layers';
import { ProjectPresentationFields } from './project-presentation';
import { SlideCanvasFields } from './slide-canvas';
import { SlidePresentationFields } from './slide-presentation';
import type {
  ScenarioInspectorElementPatch,
  ScenarioInspectorProjectPresentationPatch,
  ScenarioInspectorSlidePatch,
} from './types';
import type { ScenarioElementFrame } from '@sniptale/runtime-contracts/scenario/types/v3';
import { createScenarioInspectorLayerElements } from './layers.test-support';
let container: HTMLDivElement | null = null;
let root: Root | null = null;
type ConstrainedFieldCallbacks = {
  onFrameChange: (frame: Partial<ScenarioElementFrame>) => void;
  onUpdateElement: (patch: ScenarioInspectorElementPatch) => void;
  onUpdatePresentation: (patch: ScenarioInspectorProjectPresentationPatch) => void;
  onUpdateSlide: (patch: ScenarioInspectorSlidePatch) => void;
};
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
it('renders every scenario layer kind with editor-style action rows', () => {
  const callbacks = renderLayers();
  const dock = container?.querySelector('[data-ui="scenario.inspector.layers-dock"]');
  const scrollBody = dock?.children.item(1);

  expect(dock?.className).toContain('flex-1');
  expect(dock?.className).not.toContain('max-h');
  expect(scrollBody?.className).toContain('flex-1');
  expect(container?.textContent).toContain('Arrow');
  expect(container?.textContent).toContain('Callout');
  expect(container?.textContent).toContain('Code');
  expect(container?.textContent).toContain('Image');
  expect(container?.textContent).toContain('Line');
  expect(container?.textContent).toContain('Shape');
  expect(container?.textContent).toContain('Text');

  act(() => {
    clickByLabel(translate('scenario.editor.showLayer'));
    clickByLabel(translate('scenario.editor.unlockLayer'));
  });

  expect(callbacks.onUpdateElement).toHaveBeenCalledWith('text', { visible: true });
  expect(callbacks.onUpdateElement).toHaveBeenCalledWith('text', { locked: false });
});
it('routes image imports from the layer header action', () => {
  const onInsertImageFile = vi.fn();
  const file = new File(['image'], 'layer-image.png', { type: 'image/png' });

  renderLayers({ onInsertImageFile });

  act(() => {
    clickByLabel(translate('scenario.editor.insertImage'));
    const input = container?.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    if (!input) {
      throw new Error('Expected image input');
    }
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  expect(onInsertImageFile).toHaveBeenCalledWith(file);
});

it('keeps floating layers expanded when collapse controls are disabled', () => {
  renderLayers({ layersCollapsible: false });

  const dock = container?.querySelector('[data-ui="scenario.inspector.layers-dock"]');
  expect(dock?.className).toContain('flex-1');
  expect(dock?.className).not.toContain('border-t');
  expect(container?.querySelector('[data-ui="scenario.inspector.layers"]')).not.toBeNull();
  expect(
    container?.querySelector(`[aria-label="${translate('scenario.editor.layers')}"]`)
  ).toBeNull();
});

it('commits constrained element, frame, slide, and grid numeric rows', () => {
  const callbacks = createConstrainedFieldCallbacks();

  renderConstrainedFields(callbacks);
  performConstrainedFieldEdits();
  assertElementAndFrameUpdates(callbacks);
  assertSlideUpdates(callbacks.onUpdateSlide);
  assertPresentationUpdates(callbacks.onUpdatePresentation);
});

function createConstrainedFieldCallbacks(): ConstrainedFieldCallbacks {
  return {
    onFrameChange: vi.fn(),
    onUpdateElement: vi.fn(),
    onUpdatePresentation: vi.fn(),
    onUpdateSlide: vi.fn(),
  };
}

function renderConstrainedFields(callbacks: ConstrainedFieldCallbacks) {
  const text = createScenarioTextElement({
    frame: { height: 180, width: 320, x: 40, y: 80 },
  });
  const slide = createScenarioSlide();
  const transparentSlide = {
    ...slide,
    canvas: { ...slide.canvas, background: { kind: 'transparent' as const } },
  };
  const transitionSlide = {
    ...slide,
    backgroundTransition: { durationMs: 420, easing: 'ease' as const, kind: 'fade' as const },
    transition: { durationMs: 420, easing: 'ease' as const, kind: 'fade' as const },
  };
  const nullTransitionSlide = { ...slide, backgroundTransition: null, transition: null };
  const project = createScenarioProjectV3('Constrained fields');

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <>
        <SelectedElementInspector element={text} onUpdateElement={callbacks.onUpdateElement} />
        <FrameFields element={text} onFrameChange={callbacks.onFrameChange} />
        <SlideCanvasFields slide={slide} onUpdateSlide={callbacks.onUpdateSlide} />
        <SlideCanvasFields slide={transparentSlide} onUpdateSlide={callbacks.onUpdateSlide} />
        <SlidePresentationFields
          slide={nullTransitionSlide}
          onUpdateSlide={callbacks.onUpdateSlide}
        />
        <SlidePresentationFields slide={transitionSlide} onUpdateSlide={callbacks.onUpdateSlide} />
        <ProjectPresentationFields
          presentation={project.presentation}
          onUpdatePresentation={callbacks.onUpdatePresentation}
        />
      </>
    );
  });
}

function performConstrainedFieldEdits() {
  changeInputByLabel(translate('scenario.editor.showAtClick'), '4');
  changeInputByLabel(translate('scenario.editor.hideAtClick'), '6');
  changeInputByLabel(translate('scenario.editor.hideAtClick'), '0');
  changeInputByLabel(translate('scenario.editor.order'), '2');
  changeInputByLabel('X', '64', 1);
  changeInputByLabel('Y', '96', 1);
  changeInputByLabel('Width', '640', 1);
  changeInputByLabel('Height', '360', 1);
  changeInputByLabel(translate('scenario.editor.width'), '1440');
  changeInputByLabel(translate('scenario.editor.height'), '900');
  changeInputByLabel(translate('scenario.editor.clicks'), '8');
  clickSelectOption(
    translate('scenario.editor.background'),
    translate('scenario.editor.backgroundTransparent')
  );
  clickSelectOption(
    translate('scenario.editor.transition'),
    translate('scenario.editor.transitionFade')
  );
  clickSelectOption(
    translate('scenario.editor.backgroundTransition'),
    translate('scenario.editor.transitionFade')
  );
  clickSelectOption(
    translate('scenario.editor.animation'),
    translate('scenario.editor.animationFade')
  );
  clickSelectOption(
    translate('scenario.editor.transition'),
    translate('scenario.editor.transitionFade'),
    2
  );
  clickSelectOption(
    translate('scenario.editor.backgroundTransition'),
    translate('scenario.editor.transitionFade'),
    2
  );
  changeInputByLabel(translate('scenario.editor.gridColumns'), '10');
  changeInputByLabel(translate('scenario.editor.gridRows'), '6');
  changeInputByLabel(translate('scenario.editor.gridGutter'), '18');
  changeInputByLabel(translate('scenario.editor.gridMargin'), '32');
}

function assertElementAndFrameUpdates(callbacks: ConstrainedFieldCallbacks) {
  expect(callbacks.onUpdateElement).toHaveBeenCalledWith({ build: { showAtClick: 4 } });
  expect(callbacks.onUpdateElement).toHaveBeenCalledWith({ build: { hideAtClick: 6 } });
  expect(callbacks.onUpdateElement).toHaveBeenCalledWith({ build: { hideAtClick: null } });
  expect(callbacks.onUpdateElement).toHaveBeenCalledWith({ build: { order: 2 } });
  expect(callbacks.onFrameChange).toHaveBeenCalledWith({ x: 64 });
  expect(callbacks.onFrameChange).toHaveBeenCalledWith({ y: 96 });
  expect(callbacks.onFrameChange).toHaveBeenCalledWith({ width: 640 });
  expect(callbacks.onFrameChange).toHaveBeenCalledWith({ height: 360 });
  expect(callbacks.onUpdateElement).toHaveBeenCalledWith({ animation: { preset: 'fade' } });
}

function assertSlideUpdates(onUpdateSlide: (patch: ScenarioInspectorSlidePatch) => void) {
  expect(onUpdateSlide).toHaveBeenCalledWith({ canvas: { width: 1440 } });
  expect(onUpdateSlide).toHaveBeenCalledWith({ canvas: { height: 900 } });
  expect(onUpdateSlide).toHaveBeenCalledWith({
    canvas: { background: { kind: 'transparent' } },
  });
  expect(onUpdateSlide).toHaveBeenCalledWith({ clicks: { count: 8 } });
  expect(onUpdateSlide).toHaveBeenCalledWith({
    transition: { durationMs: 420, easing: 'ease', kind: 'fade' },
  });
  expect(onUpdateSlide).toHaveBeenCalledWith({
    backgroundTransition: { durationMs: 420, easing: 'ease', kind: 'fade' },
  });
}

function assertPresentationUpdates(
  onUpdatePresentation: (patch: ScenarioInspectorProjectPresentationPatch) => void
) {
  expect(onUpdatePresentation).toHaveBeenCalledWith({ grid: { columns: 10 } });
  expect(onUpdatePresentation).toHaveBeenCalledWith({ grid: { rows: 6 } });
  expect(onUpdatePresentation).toHaveBeenCalledWith({ grid: { gutter: 18 } });
  expect(onUpdatePresentation).toHaveBeenCalledWith({ grid: { margin: 32 } });
  expect(onUpdatePresentation).toHaveBeenCalledWith({
    transition: { durationMs: 420, easing: 'ease', kind: 'fade' },
  });
  expect(onUpdatePresentation).toHaveBeenCalledWith({
    backgroundTransition: { durationMs: 420, easing: 'ease', kind: 'fade' },
  });
}

function renderLayers(
  overrides: { layersCollapsible?: boolean; onInsertImageFile?: (file?: File) => void } = {}
) {
  const callbacks = {
    onDeleteElement: vi.fn(),
    onMoveElement: vi.fn(),
    onSelectElement: vi.fn(),
    onUpdateElement: vi.fn(),
  };

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <ScenarioLayersInspector
        elements={createScenarioInspectorLayerElements()}
        selectedElementId="text"
        {...callbacks}
        {...overrides}
      />
    );
  });

  return callbacks;
}

function clickByLabel(label: string) {
  container?.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)?.click();
}

function clickSelectOption(label: string, optionLabel: string, index = 0) {
  act(() => {
    container?.querySelectorAll<HTMLButtonElement>(`[aria-label="${label}"]`)[index]?.click();
  });
  act(() => {
    Array.from(document.body.querySelectorAll<HTMLButtonElement>('[role="option"]'))
      .find((option) => option.textContent?.includes(optionLabel))
      ?.click();
  });
}

function changeInputByLabel(label: string, value: string, index = 0) {
  const input = container?.querySelectorAll<HTMLInputElement>(
    `input:not([type="range"])[aria-label="${label}"]`
  )[index];
  expect(input).not.toBeNull();
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input?.dispatchEvent(new InputEvent('input', { bubbles: true }));
    input?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  });
}
