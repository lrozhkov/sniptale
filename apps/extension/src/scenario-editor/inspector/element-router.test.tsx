// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createScenarioArrowElement,
  createScenarioCalloutElement,
  createScenarioCodeElement,
  createScenarioImageElement,
  createScenarioLineElement,
  createScenarioProjectV3,
  createScenarioShapeElement,
  createScenarioSlide,
  createScenarioTextElement,
} from '../../features/scenario/project/v3';
import { translate } from '../../platform/i18n';
import type { ScenarioElement } from '@sniptale/runtime-contracts/scenario/types/v3';
import { SelectedElementInspector } from './element';
import { ElementSpecificFields } from './element-router';
import { FrameFields } from './frame';
import { ProjectPresentationFields } from './project-presentation';
import { SlideCanvasFields } from './slide-canvas';
import { SlidePresentationFields } from './slide-presentation';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderFields(element: ScenarioElement) {
  const onChange = vi.fn();
  const onEditImageElement = vi.fn();
  cleanupMountedFields();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <ElementSpecificFields
        element={element}
        onChange={onChange}
        onEditImageElement={onEditImageElement}
      />
    );
  });

  return { onChange, onEditImageElement };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  cleanupMountedFields();
  vi.unstubAllGlobals();
});

function cleanupMountedFields() {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
}

it('routes text, code, image, and shape controls to typed patches', () => {
  expect(commitTextPatch()).toEqual({ text: 'Edited text' });
  expect(commitCodePatch()).toEqual({ language: 'ts' });
  expect(commitImageFitPatch()).toEqual({ fit: 'cover' });
  expect(commitShapePatch()).toEqual({ shape: 'ellipse' });
});

it('routes connector and callout controls to typed patches', () => {
  expect(commitLinePatch()).toEqual({ start: { x: 42, y: 100 } });
  expect(commitArrowPatch()).toEqual({ head: 'both' });
  expect(commitCalloutPatch()).toEqual({
    connector: { end: { x: 520, y: 240 }, start: { x: 760, y: 240 } },
  });
});

it('exercises every text, code, image, and shape control', () => {
  expect(exerciseTextControls()).toHaveLength(4);
  expect(exerciseCodeControls()).toHaveLength(3);
  expect(exerciseImageControls()).toHaveLength(5);
  expect(exerciseShapeControls()).toHaveLength(3);
});

it('exercises every line, arrow, and callout control', () => {
  expect(exerciseLineControls()).toHaveLength(6);
  expect(exerciseArrowControls().at(-1)).toEqual({ head: 'both' });
  expect(exerciseCalloutControls()).toContainEqual({ connector: null });
});

it('renders bounded element, frame, slide, and grid fields with scrub ranges', () => {
  const text = createScenarioTextElement({ frame: { height: 180, width: 320, x: 40, y: 80 } });
  const slide = createScenarioSlide();
  const project = createScenarioProjectV3('Constrained fields');
  cleanupMountedFields();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <>
        <SelectedElementInspector element={text} onUpdateElement={vi.fn()} />
        <FrameFields element={text} onFrameChange={vi.fn()} />
        <SlideCanvasFields slide={slide} onUpdateSlide={vi.fn()} />
        <SlidePresentationFields slide={slide} onUpdateSlide={vi.fn()} />
        <ProjectPresentationFields
          presentation={project.presentation}
          onUpdatePresentation={vi.fn()}
        />
      </>
    );
  });

  expect(rangeFor('X')).not.toBeNull();
  expect(rangeFor(translate('scenario.editor.fontSize'))).not.toBeNull();
  expect(rangeFor(translate('scenario.editor.width'))).not.toBeNull();
  expect(rangeFor(translate('scenario.editor.gridMargin'))).not.toBeNull();
  expect(inputFor(translate('scenario.editor.clicks'))).not.toBeNull();
});

function commitTextPatch() {
  const { onChange } = renderFields(createScenarioTextElement({ text: 'Original' }));
  changeTextarea('Edited text');
  return onChange.mock.lastCall?.[0];
}

function commitCodePatch() {
  const { onChange } = renderFields(createScenarioCodeElement({ language: 'js' }));
  changeInput(0, 'ts');
  return onChange.mock.lastCall?.[0];
}

function commitImageFitPatch() {
  const { onChange } = renderFields(createScenarioImageElement({ fit: 'contain' }));
  clickSelectOption(
    translate('scenario.editor.imageFit'),
    translate('scenario.editor.imageFitCover')
  );
  return onChange.mock.lastCall?.[0];
}

function commitShapePatch() {
  const { onChange } = renderFields(createScenarioShapeElement({ shape: 'rect' }));
  clickSelectOption(translate('scenario.editor.shape'), translate('scenario.editor.shapeEllipse'));
  return onChange.mock.lastCall?.[0];
}

function commitLinePatch() {
  const { onChange } = renderFields(createScenarioLineElement({ start: { x: 10, y: 100 } }));
  changeInput(0, '42');
  return onChange.mock.lastCall?.[0];
}

function commitArrowPatch() {
  const { onChange } = renderFields(createScenarioArrowElement({ head: 'end' }));
  clickSelectOption(translate('scenario.editor.head'), translate('scenario.editor.headBoth'));
  return onChange.mock.lastCall?.[0];
}

function commitCalloutPatch() {
  const { onChange } = renderFields(createScenarioCalloutElement({ connector: null }));
  act(() => {
    findButton(translate('scenario.editor.addConnector'))?.click();
  });
  return onChange.mock.lastCall?.[0];
}

function exerciseTextControls() {
  const { onChange } = renderFields(createScenarioTextElement({ text: 'Original' }));
  changeTextarea('Edited text');
  changeInput(0, '28');
  changeInput(1, '800');
  clickSelectOption(translate('scenario.editor.align'), translate('scenario.editor.alignRight'));
  return onChange.mock.calls.map((call) => call[0]);
}

function exerciseCodeControls() {
  const { onChange } = renderFields(createScenarioCodeElement({ code: 'old()', language: 'js' }));
  changeTextarea('new()');
  changeInput(0, 'ts');
  changeInput(1, '18');
  return onChange.mock.calls.map((call) => call[0]);
}

function exerciseImageControls() {
  const { onChange, onEditImageElement } = renderFields(
    createScenarioImageElement({ fit: 'contain' })
  );
  clickSelectOption(
    translate('scenario.editor.imageFit'),
    translate('scenario.editor.imageFitCover')
  );
  changeInput(0, '12');
  changeInput(1, '18');
  changeInput(2, '1.4');
  clickButton(translate('scenario.editor.resetContentTransform'));
  clickButton(translate('scenario.editor.editImage'));
  expect(onEditImageElement).toHaveBeenCalledTimes(1);
  return onChange.mock.calls.map((call) => call[0]);
}

function exerciseShapeControls() {
  const { onChange } = renderFields(createScenarioShapeElement({ shape: 'rect' }));
  clickSelectOption(translate('scenario.editor.shape'), translate('scenario.editor.shapeEllipse'));
  changeInput(0, '4');
  changeInput(1, '12');
  return onChange.mock.calls.map((call) => call[0]);
}

function exerciseLineControls() {
  const { onChange } = renderFields(createScenarioLineElement());
  for (const [index, value] of ['1', '2', '3', '4', '6'].entries()) {
    changeInput(index, value);
  }
  clickSelectOption(translate('scenario.editor.dash'), translate('scenario.editor.dashDotted'));
  return onChange.mock.calls.map((call) => call[0]);
}

function exerciseArrowControls() {
  const { onChange } = renderFields(createScenarioArrowElement({ head: 'end' }));
  clickSelectOption(translate('scenario.editor.dash'), translate('scenario.editor.dashDashed'));
  clickSelectOption(translate('scenario.editor.head'), translate('scenario.editor.headBoth'));
  return onChange.mock.calls.map((call) => call[0]);
}

function exerciseCalloutControls() {
  const connector = { end: { x: 2, y: 2 }, start: { x: 1, y: 1 } };
  const { onChange } = renderFields(createScenarioCalloutElement({ connector, text: 'Old' }));
  changeTextarea('New');
  changeInput(0, '3');
  clickButton(translate('scenario.editor.removeConnector'));
  return onChange.mock.calls.map((call) => call[0]);
}

function changeInput(index: number, value: string) {
  const input = container?.querySelectorAll<HTMLInputElement>('input:not([type="range"])')[index];
  expect(input).toBeDefined();
  act(() => {
    setNativeInputValue(input!, value);
    input?.dispatchEvent(new InputEvent('input', { bubbles: true }));
    input?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  });
}

function changeTextarea(value: string) {
  const textarea = container?.querySelector<HTMLTextAreaElement>('textarea');
  expect(textarea).toBeDefined();
  act(() => {
    setNativeTextareaValue(textarea!, value);
    textarea?.dispatchEvent(new InputEvent('input', { bubbles: true }));
  });
}

function clickSelectOption(label: string, optionLabel: string) {
  act(() => {
    container?.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)?.click();
  });
  act(() => {
    findOption(optionLabel)?.click();
  });
}

function clickButton(label: string) {
  act(() => {
    findButton(label)?.click();
  });
}

function findButton(label: string) {
  return Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []).find((button) =>
    button.textContent?.includes(label)
  );
}

function findOption(label: string) {
  return Array.from(
    document.body.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []
  ).find((option) => option.textContent?.includes(label));
}

function rangeFor(label: string) {
  return container?.querySelector<HTMLInputElement>(`input[aria-label="${label} range"]`) ?? null;
}

function inputFor(label: string) {
  return container?.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`) ?? null;
}

function setNativeInputValue(field: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(field, value);
}

function setNativeTextareaValue(field: HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(field, value);
}
