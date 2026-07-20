// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { translate } from '../../../platform/i18n';
import { useScenarioEditorDeckAiState, type ScenarioEditorDeckAiState } from './deck-state';

const aiSelectionMock = vi.hoisted(() => ({
  requestAIModelSelectionBootstrap: vi.fn(),
}));

vi.mock('../../../workflows/ai-settings/query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../workflows/ai-settings/query')>()),
  requestAIModelSelectionBootstrap: aiSelectionMock.requestAIModelSelectionBootstrap,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ScenarioEditorDeckAiState | null = null;

function Harness() {
  latestState = useScenarioEditorDeckAiState();
  return <div>{latestState.selectedModelId}</div>;
}

beforeEach(() => {
  vi.clearAllMocks();
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
  latestState = null;
  vi.unstubAllGlobals();
});

it('loads model bootstrap state for the deck AI panel', async () => {
  aiSelectionMock.requestAIModelSelectionBootstrap.mockResolvedValue({
    defaultModelId: 'model-1',
    models: [{ displayName: 'Model', id: 'model-1', modelCode: 'm', providerId: 'p' }],
    providers: [
      {
        connectionType: 'openai-compatible',
        createdAt: 1,
        destinationKind: 'external',
        hasStoredApiKey: true,
        id: 'p',
        name: 'Provider',
      },
    ],
  });

  await renderHarness();

  expect(latestState?.selectedModelId).toBe('model-1');
  expect(latestState?.availableModels).toHaveLength(1);
  expect(latestState?.providers).toHaveLength(1);
});

it('surfaces bootstrap errors in the deck AI state', async () => {
  aiSelectionMock.requestAIModelSelectionBootstrap.mockRejectedValue(new Error('load failed'));

  await renderHarness();

  expect(latestState?.error).toBe('load failed');
});

it('uses the generic AI error label for unknown bootstrap failures', async () => {
  aiSelectionMock.requestAIModelSelectionBootstrap.mockRejectedValue('load failed');

  await renderHarness();

  expect(latestState?.error).toBe(translate('scenario.editor.aiEditorRequestFailed'));
});

it('ignores model bootstrap results after the deck AI hook unmounts', async () => {
  let resolveBootstrap: (value: unknown) => void = () => undefined;
  aiSelectionMock.requestAIModelSelectionBootstrap.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveBootstrap = resolve;
      })
  );

  await renderHarness();
  act(() => root?.unmount());
  await act(async () => {
    resolveBootstrap({ defaultModelId: 'late-model', models: [], providers: [] });
    await Promise.resolve();
  });

  expect(latestState?.selectedModelId).toBeNull();
});

async function renderHarness() {
  await act(async () => {
    root?.render(<Harness />);
    await Promise.resolve();
  });
}
