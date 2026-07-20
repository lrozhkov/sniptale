// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createIntegrationBootstrapPayload,
  createIntegrationTemplatesState,
  createSharedUiTestMock,
  integrationTreeData,
} from './index.test-support';

const {
  aiModelSelectorMock,
  loggerErrorMock,
  loadSpoilerStateMock,
  reconcileSelectedAIModelIdMock,
  requestAIModelSelectionBootstrapMock,
  selectLastPromptMock,
  setLastPromptMock,
  usePromptTemplatesMock,
} = vi.hoisted(() => ({
  aiModelSelectorMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loadSpoilerStateMock: vi.fn(),
  reconcileSelectedAIModelIdMock: vi.fn(),
  requestAIModelSelectionBootstrapMock: vi.fn(),
  selectLastPromptMock: vi.fn(),
  setLastPromptMock: vi.fn(),
  usePromptTemplatesMock: vi.fn(),
}));

vi.mock('../../../../../workflows/ai-settings/query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../workflows/ai-settings/query')>()),
  requestAIModelSelectionBootstrap: requestAIModelSelectionBootstrapMock,
}));

vi.mock('../../../../../features/ai/selection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../features/ai/selection')>()),
  reconcileSelectedAIModelId: reconcileSelectedAIModelIdMock,
}));

vi.mock('../session/prompt-template-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../session/prompt-template-state')>()),
  usePromptTemplates: usePromptTemplatesMock,
}));

vi.mock('../../../state/ai-modal.store', () => ({
  selectLastPrompt: selectLastPromptMock,
  useAIModalStore: (
    selector: (state: { lastPrompt: string; setLastPrompt: typeof setLastPromptMock }) => unknown
  ) =>
    selector({
      lastPrompt: 'Stored prompt',
      setLastPrompt: setLastPromptMock,
    }),
}));

vi.mock('../../persistence/spoiler-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../persistence/spoiler-state')>()),
  loadSpoilerState: loadSpoilerStateMock,
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    debug: vi.fn(),
    error: loggerErrorMock,
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('../../../../../features/ai/model-selector', async (importOriginal) => {
  const mock = createSharedUiTestMock(aiModelSelectorMock);
  return {
    ...(await importOriginal<typeof import('../../../../../features/ai/model-selector')>()),
    AIModelSelector: mock.AIModelSelector,
  };
});
vi.mock('@sniptale/ui/product-form-controls', async (importOriginal) => {
  const mock = createSharedUiTestMock(aiModelSelectorMock);
  return {
    ...(await importOriginal<typeof import('@sniptale/ui/product-form-controls')>()),
    ProductField: mock.ProductField,
    ProductKeyboardHint: mock.ProductKeyboardHint,
    ProductTextarea: mock.ProductTextarea,
  };
});
vi.mock('@sniptale/ui/product-modal', async (importOriginal) => {
  const mock = createSharedUiTestMock(aiModelSelectorMock);
  return {
    ...(await importOriginal<typeof import('@sniptale/ui/product-modal')>()),
    ProductModal: mock.ProductModal,
    ProductModalBody: mock.ProductModalBody,
    ProductModalFooter: mock.ProductModalFooter,
    ProductModalHeader: mock.ProductModalHeader,
  };
});
vi.mock('@sniptale/ui/product-modal/actions', async (importOriginal) => {
  const mock = createSharedUiTestMock(aiModelSelectorMock);
  return {
    ...(await importOriginal<typeof import('@sniptale/ui/product-modal/actions')>()),
    ProductActionButton: mock.ProductActionButton,
  };
});

vi.mock('../../template-list', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../template-list')>()),
  TemplateList: () => <div data-ui="template-list" />,
}));

vi.mock('../../../../../features/prompt-templates/editor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../features/prompt-templates/editor')>()),
  PromptTemplateEditor: () => null,
}));

import AIModal from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function flushModalEffects() {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderModal() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(
      <AIModal
        isOpen
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        treeData={integrationTreeData}
        isLoading={false}
      />
    );
  });

  await act(async () => {
    await requestAIModelSelectionBootstrapMock.mock.results.at(-1)?.value;
    await reconcileSelectedAIModelIdMock.mock.results.at(-1)?.value;
  });
  await flushModalEffects();
}

function getModelTrigger() {
  return container?.querySelector<HTMLButtonElement>('[data-ui="ai-model-selector.trigger"]');
}

function readTokenCounter() {
  return container?.querySelector('.sniptale-ai-modal-token-text')?.textContent ?? '';
}

function readJsonPreview() {
  return container?.querySelector('.sniptale-json-preview')?.textContent ?? '';
}

async function clickElement(element: Element | null | undefined) {
  await act(async () => {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

async function expandDataPanel() {
  await clickElement(container?.querySelector('.sniptale-spoiler-header'));
}

async function toggleJsonPreview() {
  await clickElement(container?.querySelector('.sniptale-toggle-btn'));
}

async function toggleRowCheckboxByText(text: string) {
  const rowContent = Array.from(
    container?.querySelectorAll<HTMLDivElement>('.sniptale-ai-table-row-content') ?? []
  ).find((element) => element.textContent?.includes(text));
  const checkbox = rowContent?.previousElementSibling as HTMLInputElement | null;

  await clickElement(checkbox);
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  aiModelSelectorMock.mockReset();
  selectLastPromptMock.mockImplementation((state: { lastPrompt: string }) => state.lastPrompt);
  usePromptTemplatesMock.mockReturnValue(createIntegrationTemplatesState());
  loadSpoilerStateMock.mockResolvedValue(false);
  requestAIModelSelectionBootstrapMock.mockResolvedValue(createIntegrationBootstrapPayload());
  reconcileSelectedAIModelIdMock.mockResolvedValue('model-1');
  loggerErrorMock.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('AIModal integration', () => {
  it('hydrates the default model label during modal bootstrap', async () => {
    await renderModal();

    expect(loggerErrorMock).not.toHaveBeenCalled();
    expect(reconcileSelectedAIModelIdMock).toHaveBeenCalledWith(
      createIntegrationBootstrapPayload().models,
      'model-1'
    );
    expect(aiModelSelectorMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        models: createIntegrationBootstrapPayload().models,
        selectedModelId: 'model-1',
      })
    );
    expect(getModelTrigger()?.textContent).toContain('GPT 4.1');
  });

  it('keeps the model selector interactive after bootstrap', async () => {
    await renderModal();
    await clickElement(getModelTrigger());

    expect(aiModelSelectorMock).toHaveBeenCalled();
  });

  it('recomputes the token counter when selection checkboxes change on the real modal state path', async () => {
    await renderModal();
    await expandDataPanel();

    const initialTokens = readTokenCounter();
    await toggleRowCheckboxByText('Bob Example');

    expect(readTokenCounter()).not.toBe(initialTokens);
  });

  it('updates the visible JSON preview when table row selection changes on the real modal state path', async () => {
    await renderModal();
    await expandDataPanel();
    await toggleJsonPreview();

    expect(readJsonPreview()).toContain('Bob Example');

    await toggleRowCheckboxByText('Bob Example');

    expect(readJsonPreview()).not.toContain('Bob Example');
  });
});
