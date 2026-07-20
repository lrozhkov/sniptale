// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createScenarioCaptureStep } from '../../../features/scenario/project/public';

vi.mock('../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

import { ScenarioQuickEditTransformSections } from './ScenarioQuickEditTransformSections';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function setInputValue(input: HTMLInputElement | null, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  valueSetter?.call(input, value);
  input?.dispatchEvent(new Event('input', { bubbles: true }));
  input?.dispatchEvent(new Event('change', { bubbles: true }));
}

function renderTransformSections() {
  const onStepChange = vi.fn();
  const step = createScenarioCaptureStep({
    assetId: 'asset-1',
    title: 'Step',
  });

  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<ScenarioQuickEditTransformSections onStepChange={onStepChange} step={step} />);
  });

  return { onStepChange, step };
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

it('updates zoom and image offsets through owner-local number fields', () => {
  const { onStepChange, step } = renderTransformSections();
  const inputs = Array.from(container?.querySelectorAll<HTMLInputElement>('input') ?? []);

  act(() => {
    setInputValue(inputs[0] ?? null, '1.5');
    setInputValue(inputs[1] ?? null, '24');
    setInputValue(inputs[2] ?? null, '-16');
  });

  expect(container?.textContent).toContain('scenario.editor.imageTransform');
  expect(onStepChange).toHaveBeenNthCalledWith(1, {
    imageTransform: { ...step.imageTransform, scale: 1.5 },
  });
  expect(onStepChange).toHaveBeenNthCalledWith(2, {
    imageTransform: { ...step.imageTransform, x: 24 },
  });
  expect(onStepChange).toHaveBeenNthCalledWith(3, {
    imageTransform: { ...step.imageTransform, y: -16 },
  });
});
