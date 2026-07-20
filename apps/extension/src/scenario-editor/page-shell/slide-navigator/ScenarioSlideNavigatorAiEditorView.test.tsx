// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createScenarioCaptureStep,
  createScenarioNoteStep,
  createScenarioProject,
} from '../../../features/scenario/project/public';
import type { AIProviderSelectorEntry } from '../../../contracts/messaging/ai-settings-runtime';
import type { AIModel } from '../../../contracts/settings';
import type { ScenarioAiEditorController } from './types';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../../features/ai/model-selector', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../features/ai/model-selector')>()),
  AIModelSelector: (props: { onSelect: (id: string) => void }) => (
    <button type="button" onClick={() => props.onSelect('model-1')}>
      select-model
    </button>
  ),
}));

vi.mock('@sniptale/ui/product-modal/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-modal/actions')>()),
  ProductActionButton: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props} />
  ),
}));

vi.mock('@sniptale/ui/product-form-controls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-form-controls')>()),
  ProductTextarea: (
    props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }
  ) => <textarea {...props} />,
}));

import { ScenarioSlideNavigatorAiEditorView } from './ScenarioSlideNavigatorAiEditorView';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

interface CreateControllerOverrides {
  ai?: Partial<ScenarioAiEditorController['ai']>;
  project?: Partial<ScenarioAiEditorController['project']>;
  ui?: Partial<ScenarioAiEditorController['ui']>;
}

function createController(overrides: CreateControllerOverrides = {}): ScenarioAiEditorController {
  const captureStep = createScenarioCaptureStep({ assetId: 'asset-1', title: 'Capture step' });
  const step = createScenarioNoteStep({ title: 'AI step', body: 'Body' });
  const project = { ...createScenarioProject('Scenario'), steps: [captureStep, step] };

  return {
    ai: {
      activeAttachmentDisclosure: null,
      attachmentMode: 'none',
      availableModels: [],
      error: null,
      instruction: 'Rewrite this step',
      lastRunSummary: {
        appliedStepIds: [step.id],
        instruction: 'Rewrite this step',
        requestedStepIds: [step.id],
        submittedAt: 100,
      },
      loading: false,
      providers: [],
      selectedModelId: null,
      setActiveAttachmentDisclosure: vi.fn(),
      setAttachmentMode: vi.fn(),
      setInstruction: vi.fn(),
      setSelectedModelId: vi.fn(),
      submitRequest: vi.fn(),
      ...overrides.ai,
    },
    project: {
      project,
      selectedStepId: captureStep.id,
      setSelectedStepId: vi.fn(),
      ...overrides.project,
    },
    ui: {
      setNavigatorCollapsed: vi.fn(),
      ...overrides.ui,
    },
  };
}

function renderView(overrides: CreateControllerOverrides = {}) {
  const controller = createController(overrides);
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<ScenarioSlideNavigatorAiEditorView controller={controller} />);
  });

  return controller;
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

describe('ScenarioSlideNavigatorAiEditorView', () => {
  it('renders the empty-project hint and collapse action', () => {
    const controller = renderView({
      ai: {
        ...createController().ai,
        instruction: '',
        lastRunSummary: null,
      },
      project: {
        project: null,
      },
    });

    expect(container?.textContent).toContain('scenario.editor.aiEditorEmptyProject');

    act(() => {
      container
        ?.querySelector<HTMLButtonElement>('[aria-label="scenario.editor.collapseNavigator"]')
        ?.click();
    });

    expect(controller.ui.setNavigatorCollapsed).toHaveBeenCalledWith(true);
  });
});

describe('ScenarioSlideNavigatorAiEditorView interactions', () => {
  it(
    'submits AI requests, switches models, and selects changed steps',
    verifiesAiEditorInteractions
  );
  it(
    'shows provider, model, screenshot, and structured data disclosure before send',
    verifiesAiEditorDisclosure
  );
});

function verifiesAiEditorInteractions() {
  const controller = renderView();

  act(() => {
    container
      ?.querySelector<HTMLTextAreaElement>('textarea')
      ?.dispatchEvent(new Event('change', { bubbles: true }));
    clickTextButton('select-model');
    clickTextButton('scenario.editor.aiEditorAttachmentNone');
    clickTextButton('scenario.editor.aiEditorSend');
    clickTextButton('AI step');
  });

  expect(controller.ai.setSelectedModelId).toHaveBeenCalledWith('model-1');
  expect(controller.ai.setAttachmentMode).toHaveBeenCalledWith('none');
  expect(controller.ai.submitRequest).toHaveBeenCalledTimes(1);
  expect(controller.project.setSelectedStepId).toHaveBeenCalledTimes(1);
  expect(container?.textContent).toContain('scenario.editor.aiEditorAttachmentDisclosure');
}

function verifiesAiEditorDisclosure() {
  renderView({
    ai: {
      attachmentMode: 'current',
      availableModels: [createExternalAiModel()],
      providers: [createExternalAiProvider()],
      selectedModelId: 'model-1',
    },
  });

  const disclosure = container?.querySelector('[data-ui="scenario.editor.ai-disclosure"]');
  expect(disclosure?.textContent).toContain('scenario.editor.aiEditorDisclosureTitle');
  expect(disclosure?.textContent).toContain('Provider 1');
  expect(disclosure?.textContent).toContain('scenario.editor.aiEditorDisclosureProviderExternal');
  expect(disclosure?.textContent).toContain('Model 1');
  expect(disclosure?.textContent).toContain('scenario.editor.aiEditorDisclosureFieldPageContext');
  expect(disclosure?.textContent).toContain('scenario.editor.aiEditorDisclosureFieldAttachments');
}

function clickTextButton(label: string) {
  Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? [])
    .find((button) => button.textContent?.includes(label))
    ?.click();
}

function createExternalAiProvider(): AIProviderSelectorEntry {
  return {
    connectionType: 'openai-compatible',
    createdAt: 1,
    destinationKind: 'external',
    hasStoredApiKey: true,
    id: 'provider-1',
    name: 'Provider 1',
  };
}

function createExternalAiModel(): AIModel {
  return {
    displayName: 'Model 1',
    id: 'model-1',
    modelCode: 'model-code',
    providerId: 'provider-1',
  };
}

describe('ScenarioSlideNavigatorAiEditorView loading disclosure', () => {
  it('freezes attachment controls while an AI request is loading', () => {
    const controller = renderView({
      ai: {
        loading: true,
      },
    });
    const noScreenshotsButton = Array.from(
      container?.querySelectorAll<HTMLButtonElement>('button') ?? []
    ).find((button) => button.textContent?.includes('scenario.editor.aiEditorAttachmentNone'));

    expect(noScreenshotsButton?.disabled).toBe(true);

    act(() => {
      noScreenshotsButton?.click();
    });

    expect(controller.ai.setAttachmentMode).not.toHaveBeenCalled();
  });

  it('renders the in-flight attachment disclosure when selected step changes while loading', () => {
    const baseController = createController();
    const captureStep = baseController.project.project?.steps[0];
    const noteStep = baseController.project.project?.steps[1];

    renderView({
      ai: {
        activeAttachmentDisclosure: {
          mode: 'current',
          screenshotCount: 1,
          selectedStepId: captureStep?.id ?? null,
        },
        loading: true,
      },
      project: {
        selectedStepId: noteStep?.id ?? null,
      },
    });

    expect(container?.textContent).toContain('scenario.editor.aiEditorAttachmentDisclosure 1');
    const disclosure = container?.querySelector('[data-ui="scenario.editor.ai-disclosure"]');
    expect(disclosure?.textContent).toContain('scenario.editor.aiEditorDisclosureScreenshots');
    expect(disclosure?.textContent).toContain('1');
    expect(disclosure?.textContent).toContain('scenario.editor.aiEditorDisclosureFieldAttachments');
  });
});
