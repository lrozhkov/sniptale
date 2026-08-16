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
  createScenarioShapeElement,
  createScenarioTextElement,
} from '../../features/scenario/project/v3';
import { translate } from '../../platform/i18n';
import type { ScenarioElement } from '@sniptale/runtime-contracts/scenario/types/v3';
import { SelectedElementInspector } from './element';
import { ElementSpecificFields } from './element-router';

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

it('routes text, code, image, and shape controls to typed patches', async () => {
  expect(commitTextPatch()).toEqual({ text: 'Edited text' });
  expect(commitCodePatch()).toEqual({ language: 'ts' });
  expect(await commitImageFitPatch()).toEqual({ fit: 'cover' });
  expect(await commitShapePatch()).toEqual({ shape: 'ellipse' });
});

it('routes connector and callout controls to typed patches', async () => {
  expect(commitLinePatch()).toEqual({ start: { x: 42, y: 100 } });
  expect(await commitArrowPatch()).toEqual({ head: 'both' });
  expect(commitCalloutPatch()).toEqual({
    connector: { end: { x: 520, y: 240 }, start: { x: 760, y: 240 } },
  });
});

it('exercises every text, code, image, and shape control', async () => {
  expect(await exerciseTextControls()).toHaveLength(4);
  expect(exerciseCodeControls()).toHaveLength(3);
  expect(await exerciseImageControls()).toHaveLength(2);
  expect(await exerciseShapeControls()).toHaveLength(3);
});

it('exercises every line, arrow, and callout control', async () => {
  expect(await exerciseLineControls()).toHaveLength(6);
  expect((await exerciseArrowControls()).at(-1)).toEqual({ head: 'both' });
  expect(exerciseCalloutControls()).toContainEqual({ connector: null });
});

it('updates the selected element opacity without exposing frame controls', () => {
  const text = createScenarioTextElement({ frame: { height: 180, width: 320, x: 40, y: 80 } });
  const onUpdateElement = vi.fn();
  cleanupMountedFields();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <SelectedElementInspector
        element={text}
        onDelete={vi.fn()}
        onUpdateElement={onUpdateElement}
      />
    );
  });

  expect(rangeFor(translate('scenario.editor.fontSize'))).not.toBeNull();
  expect(rangeFor('X')).toBeNull();
  const opacity = inputFor(translate('scenario.editor.opacity'));
  expect(opacity).not.toBeNull();
  act(() => {
    setNativeInputValue(opacity!, '50');
    opacity?.dispatchEvent(new InputEvent('input', { bubbles: true }));
    opacity?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  });
  expect(onUpdateElement).toHaveBeenCalledWith({ opacity: 0.5 });
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

async function commitImageFitPatch() {
  const { onChange } = renderFields(createScenarioImageElement({ fit: 'contain' }));
  await clickSelectOption(
    translate('scenario.editor.imageFit'),
    translate('scenario.editor.imageFitCover')
  );
  return onChange.mock.lastCall?.[0];
}

async function commitShapePatch() {
  const { onChange } = renderFields(createScenarioShapeElement({ shape: 'rect' }));
  await clickSelectOption(
    translate('scenario.editor.shape'),
    translate('scenario.editor.shapeEllipse')
  );
  return onChange.mock.lastCall?.[0];
}

function commitLinePatch() {
  const { onChange } = renderFields(createScenarioLineElement({ start: { x: 10, y: 100 } }));
  changeInput(0, '42');
  return onChange.mock.lastCall?.[0];
}

async function commitArrowPatch() {
  const { onChange } = renderFields(createScenarioArrowElement({ head: 'end' }));
  await clickSelectOption(translate('scenario.editor.head'), translate('scenario.editor.headBoth'));
  return onChange.mock.lastCall?.[0];
}

function commitCalloutPatch() {
  const { onChange } = renderFields(createScenarioCalloutElement({ connector: null }));
  act(() => {
    findButton(translate('scenario.editor.addConnector'))?.click();
  });
  return onChange.mock.lastCall?.[0];
}

async function exerciseTextControls() {
  const { onChange } = renderFields(createScenarioTextElement({ text: 'Original' }));
  changeTextarea('Edited text');
  changeInput(0, '28');
  changeInput(1, '800');
  await clickSelectOption(
    translate('scenario.editor.align'),
    translate('scenario.editor.alignRight')
  );
  return onChange.mock.calls.map((call) => call[0]);
}

function exerciseCodeControls() {
  const { onChange } = renderFields(createScenarioCodeElement({ code: 'old()', language: 'js' }));
  changeTextarea('new()');
  changeInput(0, 'ts');
  changeInput(1, '18');
  return onChange.mock.calls.map((call) => call[0]);
}

async function exerciseImageControls() {
  const { onChange, onEditImageElement } = renderFields(
    createScenarioImageElement({ fit: 'contain' })
  );
  await clickSelectOption(
    translate('scenario.editor.imageFit'),
    translate('scenario.editor.imageFitCover')
  );
  clickButton(translate('scenario.editor.resetContentTransform'));
  clickButton(translate('scenario.editor.editImage'));
  expect(onEditImageElement).toHaveBeenCalledTimes(1);
  return onChange.mock.calls.map((call) => call[0]);
}

async function exerciseShapeControls() {
  const { onChange } = renderFields(createScenarioShapeElement({ shape: 'rect' }));
  await clickSelectOption(
    translate('scenario.editor.shape'),
    translate('scenario.editor.shapeEllipse')
  );
  changeInput(0, '4');
  changeInput(1, '12');
  return onChange.mock.calls.map((call) => call[0]);
}

async function exerciseLineControls() {
  const { onChange } = renderFields(createScenarioLineElement());
  for (const [index, value] of ['1', '2', '3', '4', '6'].entries()) {
    changeInput(index, value);
  }
  await clickSelectOption(
    translate('scenario.editor.dash'),
    translate('scenario.editor.dashDotted')
  );
  return onChange.mock.calls.map((call) => call[0]);
}

async function exerciseArrowControls() {
  const { onChange } = renderFields(createScenarioArrowElement({ head: 'end' }));
  await clickSelectOption(
    translate('scenario.editor.dash'),
    translate('scenario.editor.dashDashed')
  );
  await clickSelectOption(translate('scenario.editor.head'), translate('scenario.editor.headBoth'));
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

async function clickSelectOption(label: string, optionLabel: string) {
  act(() => {
    container?.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)?.click();
  });
  await act(async () => {
    findOption(optionLabel)?.click();
    await Promise.resolve();
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
