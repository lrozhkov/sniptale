// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { translate } from '../../../platform/i18n';
import { createScenarioCaptureStep } from '../../../features/scenario/project/public';
import { QuickEditStepFields } from './sidebar.sections';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createStep() {
  return createScenarioCaptureStep({
    assetId: 'asset-1',
    body: 'Step body',
    title: 'Step title',
  });
}

function setInputValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  descriptor?.set?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

async function renderFields(props: Parameters<typeof QuickEditStepFields>[0]) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<QuickEditStepFields {...props} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function runStepFieldMutationTest() {
  it('commits title and body edits through step patch seam', async () => {
    const onStepChange = vi.fn();
    await renderFields({
      canRedo: true,
      canUndo: true,
      onRedo: vi.fn(),
      onStepChange,
      onUndo: vi.fn(),
      step: createStep(),
    });

    const titleInput = container?.querySelector('input[value="Step title"]');
    const bodyInput = container?.querySelector('textarea') as HTMLTextAreaElement | null;
    expect(titleInput).not.toBeNull();
    expect(bodyInput).not.toBeNull();

    await act(async () => {
      setInputValue(titleInput as HTMLInputElement, 'Updated title');
      setInputValue(bodyInput!, 'Updated body');
    });

    expect(onStepChange).toHaveBeenCalledWith({ title: 'Updated title' });
    expect(onStepChange).toHaveBeenCalledWith({ body: 'Updated body' });
  });
}

function runUndoRedoButtonsTest() {
  it('wires undo and redo buttons through header actions', async () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    await renderFields({
      canRedo: true,
      canUndo: true,
      onRedo,
      onStepChange: vi.fn(),
      onUndo,
      step: createStep(),
    });

    const buttons = Array.from(container?.querySelectorAll('button[title]') ?? []);
    expect(buttons).toHaveLength(2);

    await act(async () => {
      buttons[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      buttons[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onRedo).toHaveBeenCalledTimes(1);
  });
}

function runFallbackTitleTest() {
  it('shows the fallback title for untitled steps', async () => {
    const step = createStep();
    step.title = '';

    await renderFields({
      canRedo: false,
      canUndo: false,
      onRedo: vi.fn(),
      onStepChange: vi.fn(),
      onUndo: vi.fn(),
      step,
    });

    expect(container?.textContent).toContain(translate('scenario.editor.selectedStep'));
  });
}

function runQuickEditStepFieldsSuite() {
  runStepFieldMutationTest();
  runUndoRedoButtonsTest();
  runFallbackTitleTest();
}

describe('scenario quick-edit sidebar sections', runQuickEditStepFieldsSuite);
