// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createScenarioCaptureStep,
  createScenarioNoteStep,
  createScenarioSectionStep,
} from '../../../features/scenario/project/public';
import type { ScenarioDividerStep } from '../../../features/scenario/contracts/types/project';
import type { ScenarioStepPatch } from '../../project/mutation/helpers';
import { ScenarioEditorStepCardContent } from './ScenarioEditorStepCardContent';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../capture-canvas/view', () => ({
  ScenarioWorkspaceCaptureCanvas: () => <div data-testid="workspace-canvas" />,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
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

function verifiesCaptureFieldChrome() {
  act(() => {
    root?.render(
      <ScenarioEditorStepCardContent
        onOpenQuickEdit={vi.fn()}
        onUpdateStep={vi.fn()}
        step={createScenarioCaptureStep({
          assetId: 'asset-1',
          title: 'Capture title',
          body: 'Body',
        })}
      />
    );
  });

  const titleInput = container?.querySelector('input');
  const bodyInput = container?.querySelector('textarea');

  expect(titleInput?.className).toContain('text-base');
  expect(titleInput?.className).toContain('font-semibold');
  expect(titleInput?.className).toContain('border-[');
  expect(bodyInput?.className).toContain('text-sm');
  expect(bodyInput?.className).toContain('bg-[');
}

function renderSectionStepContent(onUpdateStep: (patch: ScenarioStepPatch) => void) {
  act(() => {
    root?.render(
      <ScenarioEditorStepCardContent
        onOpenQuickEdit={vi.fn()}
        onUpdateStep={onUpdateStep}
        step={createScenarioSectionStep({
          title: 'Section title',
          body: 'Section body',
        })}
      />
    );
  });
}

function updateTextControl(
  element: HTMLInputElement | HTMLTextAreaElement,
  prototype: typeof HTMLInputElement | typeof HTMLTextAreaElement,
  value: string
) {
  const setValue = Object.getOwnPropertyDescriptor(prototype.prototype, 'value')?.set;

  act(() => {
    setValue?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function flushDraftCommit() {
  await act(async () => {
    vi.advanceTimersByTime(700);
  });
}

async function verifiesSectionFieldPatchFlow() {
  const onUpdateStep = vi.fn();
  vi.useFakeTimers();

  try {
    renderSectionStepContent(onUpdateStep);
    const titleInput = container?.querySelector<HTMLInputElement>('input');
    if (!titleInput) {
      throw new Error('Expected section title input');
    }

    updateTextControl(titleInput, HTMLInputElement, 'Updated title');
    await flushDraftCommit();

    expect(onUpdateStep).toHaveBeenNthCalledWith(1, { title: 'Updated title' });
    expect(onUpdateStep).toHaveBeenCalledTimes(1);
    expect(container?.querySelector('textarea')).toBeNull();
  } finally {
    vi.useRealTimers();
  }
}

function createDividerStep(overrides: Partial<ScenarioDividerStep> = {}): ScenarioDividerStep {
  return {
    id: 'divider-1',
    kind: 'divider',
    title: '',
    body: '',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function verifiesDividerConditionalEditors() {
  act(() => {
    root?.render(
      <ScenarioEditorStepCardContent
        onOpenQuickEdit={vi.fn()}
        onUpdateStep={vi.fn()}
        step={createDividerStep()}
      />
    );
  });

  expect(container?.querySelector('input')).toBeNull();

  act(() => {
    root?.render(
      <ScenarioEditorStepCardContent
        onOpenQuickEdit={vi.fn()}
        onUpdateStep={vi.fn()}
        step={createDividerStep({
          title: 'Divider title',
          body: 'Divider body',
        })}
      />
    );
  });

  expect(container?.querySelectorAll('input')).toHaveLength(2);
}

function verifiesNoteToneCycling() {
  const onUpdateStep = vi.fn();

  act(() => {
    root?.render(
      <ScenarioEditorStepCardContent
        onOpenQuickEdit={vi.fn()}
        onUpdateStep={onUpdateStep}
        step={createScenarioNoteStep({
          title: 'Note title',
          tone: 'neutral',
        })}
      />
    );
  });

  act(() => {
    container
      ?.querySelector<HTMLButtonElement>('button')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  expect(container?.textContent).toContain('scenario.editor.noteTone.neutral');
  expect(onUpdateStep).toHaveBeenCalledWith({ tone: 'info' });
}

function verifiesAdditionalNoteToneLabels() {
  act(() => {
    root?.render(
      <ScenarioEditorStepCardContent
        onOpenQuickEdit={vi.fn()}
        onUpdateStep={vi.fn()}
        step={createScenarioNoteStep({
          title: 'Warning note',
          tone: 'warning',
        })}
      />
    );
  });

  expect(container?.textContent).toContain('scenario.editor.noteTone.warning');
}

function verifiesRootSwitchRoutesDividerAndNoteBranches() {
  act(() => {
    root?.render(
      <ScenarioEditorStepCardContent
        onOpenQuickEdit={vi.fn()}
        onUpdateStep={vi.fn()}
        step={createDividerStep({ title: 'Divider title', body: 'Divider body' })}
      />
    );
  });

  expect(container?.querySelectorAll('input')).toHaveLength(2);

  act(() => {
    root?.render(
      <ScenarioEditorStepCardContent
        onOpenQuickEdit={vi.fn()}
        onUpdateStep={vi.fn()}
        step={createScenarioNoteStep({ title: 'Error note', tone: 'error' })}
      />
    );
  });

  expect(container?.textContent).toContain('scenario.editor.noteTone.error');
}

function runScenarioEditorStepCardContentSuite() {
  it(
    'renders stronger title hierarchy and explicit editable chrome for capture steps',
    verifiesCaptureFieldChrome
  );
  it(
    'routes title and body edits through the shared step patch callbacks',
    verifiesSectionFieldPatchFlow
  );
  it('shows divider editors only when divider copy is present', verifiesDividerConditionalEditors);
  it('cycles note tone labels through the dedicated note action button', verifiesNoteToneCycling);
  it('renders translated labels for additional note tones', verifiesAdditionalNoteToneLabels);
  it(
    'routes divider and note steps through the root switch facade',
    verifiesRootSwitchRoutesDividerAndNoteBranches
  );
}

describe('ScenarioEditorStepCardContent', runScenarioEditorStepCardContentSuite);
