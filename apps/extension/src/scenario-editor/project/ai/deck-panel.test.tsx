// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScenarioProjectV3 } from '../../../features/scenario/project/v3';
import { translate } from '../../../platform/i18n';
import type { AIProviderSelectorEntry } from '../../../contracts/messaging/ai-settings-runtime';
import type { AIModel } from '../../../contracts/settings';
import { ScenarioEditorDeckAiPanel } from './deck-panel';
import type { ScenarioEditorDeckAiState } from './deck-state';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('ScenarioEditorDeckAiPanel', () => {
  it(
    'renders as the right floating editor lane and closes through the header action',
    verifiesPanelLayout
  );
  it('submits non-empty AI instructions and renders the last run summary', verifiesPanelSubmit);
  it(
    'shows Chrome AI provider, model, screenshot, and structured data disclosure before send',
    verifiesPanelDisclosure
  );
});

function verifiesPanelLayout() {
  const onClose = vi.fn();
  renderPanel({ onClose });

  const panelClassName =
    container?.querySelector('[data-ui="scenario.editor.ai-panel"]')?.className ?? '';
  expect(panelClassName).toContain('right-3');
  expect(panelClassName).toContain('max-h-[min(42rem,calc(100vh-5.25rem))]');
  expect(panelClassName).not.toContain('bottom-3');
  clickButton(translate('scenario.editor.aiEditorClose'));

  expect(onClose).toHaveBeenCalled();
}

function verifiesPanelSubmit() {
  const onSubmit = vi.fn(async () => undefined);
  renderPanel({
    aiState: createAiState({
      instruction: 'Tighten the deck',
      lastRunSummary: {
        appliedOperations: [{ slideId: 'slide-1', title: 'New title', type: 'setSlideTitle' }],
        instruction: 'Tighten the deck',
        selectedSlideId: 'slide-1',
        submittedAt: 1,
      },
    }),
    onSubmit,
  });

  clickButton(translate('scenario.editor.aiEditorSend'));

  expect(container?.textContent).toContain(translate('scenario.editor.aiEditorLastRun'));
  expect(onSubmit).toHaveBeenCalled();
}

function verifiesPanelDisclosure() {
  renderPanel({
    aiState: createAiState({
      availableModels: [createChromeAiModel()],
      providers: [createChromeAiProvider()],
      selectedModelId: 'chrome-model',
    }),
  });

  const disclosure = container?.querySelector('[data-ui="scenario.editor.ai-disclosure"]');
  expect(disclosure?.textContent).toContain(translate('scenario.editor.aiEditorDisclosureTitle'));
  expect(disclosure?.textContent).toContain('Google');
  expect(disclosure?.textContent).toContain(
    translate('scenario.editor.aiEditorDisclosureProviderChrome')
  );
  expect(disclosure?.textContent).toContain('Google Chrome AI');
  expect(disclosure?.textContent).toContain(
    translate('scenario.editor.aiEditorDisclosureFieldDeckOutline')
  );
  expect(disclosure?.textContent).toContain('0');
}

function createChromeAiProvider(): AIProviderSelectorEntry {
  return {
    connectionType: 'chrome-built-in',
    createdAt: 0,
    destinationKind: 'chrome-built-in',
    hasStoredApiKey: false,
    id: 'chrome-provider',
    name: 'Google',
  };
}

function createChromeAiModel(): AIModel {
  return {
    displayName: 'Google Chrome AI',
    id: 'chrome-model',
    modelCode: 'chrome-prompt-api',
    providerId: 'chrome-provider',
  };
}

function renderPanel(args: {
  aiState?: ScenarioEditorDeckAiState;
  onClose?: () => void;
  onSubmit?: () => Promise<void>;
}) {
  const project = createScenarioProjectV3('AI deck');
  act(() => {
    root?.render(
      <ScenarioEditorDeckAiPanel
        aiState={args.aiState ?? createAiState()}
        onClose={args.onClose ?? vi.fn()}
        onSubmit={args.onSubmit ?? vi.fn(async () => undefined)}
        project={project}
        selectedElement={null}
        selectedSlide={project.slides[0]!}
      />
    );
  });
}

function createAiState(
  overrides: Partial<ScenarioEditorDeckAiState> = {}
): ScenarioEditorDeckAiState {
  return {
    availableModels: [],
    error: null,
    instruction: '',
    lastRunSummary: null,
    loading: false,
    providers: [],
    selectedModelId: null,
    setError: vi.fn(),
    setInstruction: vi.fn(),
    setLastRunSummary: vi.fn(),
    setLoading: vi.fn(),
    setSelectedModelId: vi.fn(),
    ...overrides,
  };
}

function clickButton(label: string) {
  const labeled = container?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  const textButton = Array.from(
    container?.querySelectorAll<HTMLButtonElement>('button') ?? []
  ).find((button) => button.textContent?.includes(label));
  const button = labeled ?? textButton;
  expect(button).not.toBeNull();
  act(() => button?.click());
}
