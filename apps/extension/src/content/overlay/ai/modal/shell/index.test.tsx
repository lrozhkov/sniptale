// @vitest-environment jsdom

import { act, type ComponentProps } from 'react';
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
  rememberAIScenarioModelSelectionMock,
  requestAIScenarioModelSelectionMock,
  selectLastPromptMock,
  setLastPromptMock,
  usePromptTemplatesMock,
} = vi.hoisted(() => ({
  aiModelSelectorMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  rememberAIScenarioModelSelectionMock: vi.fn(),
  requestAIScenarioModelSelectionMock: vi.fn(),
  selectLastPromptMock: vi.fn(),
  setLastPromptMock: vi.fn(),
  usePromptTemplatesMock: vi.fn(),
}));

vi.mock('../../../../../workflows/ai-settings/query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../workflows/ai-settings/query')>()),
  requestAIScenarioModelSelection: requestAIScenarioModelSelectionMock,
  rememberAIScenarioModelSelection: rememberAIScenarioModelSelectionMock,
}));

vi.mock(
  '../../../../../features/prompt-templates/hooks/use-prompt-templates',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../../features/prompt-templates/hooks/use-prompt-templates')
    >()),
    usePromptTemplates: usePromptTemplatesMock,
  })
);

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
  const actual = await importOriginal<typeof import('../../../../../features/ai/model-selector')>();
  return {
    ...actual,
    AIModelSelector: (props: ComponentProps<typeof actual.AIModelSelector>) => {
      aiModelSelectorMock(props);
      return <actual.AIModelSelector {...props} />;
    },
  };
});
const trusted = vi.hoisted(() => new WeakSet<Event>());
vi.mock('../../../../platform/trusted-events', () => ({
  isTrustedDomEvent: (event: Event) => event.isTrusted || trusted.has(event),
  isTrustedKeyboardEvent: (event: Event) => event.isTrusted || trusted.has(event),
}));
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

vi.mock('../../../../../features/prompt-templates/editor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../features/prompt-templates/editor')>()),
  PromptTemplateEditor: () => null,
}));

import { dispatchBridgedMouseEvent } from '../../../../platform/trusted-events/synthetic-mouse';
import { installEditableKeydownBridge } from '../../../../runtime/ui-activation-bridge/targets';
import AIModal from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let disposeKeyboardBridge: (() => void) | null = null;

async function flushModalEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderModal(isOpen = true, onSubmit = vi.fn()) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    disposeKeyboardBridge = installEditableKeydownBridge(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(
      <AIModal
        isOpen={isOpen}
        onClose={vi.fn()}
        onSubmit={onSubmit}
        treeData={integrationTreeData}
        isLoading={false}
      />
    );
  });

  await flushModalEffects();
}

function getModelTrigger() {
  return container?.querySelector<HTMLButtonElement>('.sniptale-ai-model-selector-trigger');
}

function readTokenCounter() {
  return container?.querySelector('.sniptale-ai-modal-token-text')?.textContent ?? '';
}

function readJsonPreview() {
  return container?.querySelector('.sniptale-json-preview')?.textContent ?? '';
}

async function clickElement(element: Element | null | undefined, admitted = true) {
  const event = new MouseEvent('click', { bubbles: true });
  if (admitted) trusted.add(event);
  await act(async () => {
    element?.dispatchEvent(event);
  });
}

async function expandDataPanel() {
  expect(
    container?.querySelector('.sniptale-ai-spoiler-toggle')?.getAttribute('aria-expanded')
  ).toBe('true');
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
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 20,
    y: 20,
    top: 20,
    left: 20,
    bottom: 50,
    right: 220,
    width: 200,
    height: 30,
    toJSON: () => ({}),
  });
  aiModelSelectorMock.mockReset();
  selectLastPromptMock.mockImplementation((state: { lastPrompt: string }) => state.lastPrompt);
  usePromptTemplatesMock.mockReturnValue(createIntegrationTemplatesState());
  requestAIScenarioModelSelectionMock.mockResolvedValue(createIntegrationBootstrapPayload());
  rememberAIScenarioModelSelectionMock.mockResolvedValue(undefined);
  loggerErrorMock.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  disposeKeyboardBridge?.();
  disposeKeyboardBridge = null;
  container?.remove();
  container = null;
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('AIModal integration', () => {
  it('shows the scenario candidate without writing a global default or preference', async () => {
    await renderModal();

    expect(loggerErrorMock).not.toHaveBeenCalled();
    expect(requestAIScenarioModelSelectionMock).toHaveBeenCalledWith('page-extract');
    expect(rememberAIScenarioModelSelectionMock).not.toHaveBeenCalled();
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

function button(text: string) {
  return Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []).findLast(
    (node) => node.textContent?.trim() === text
  );
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it('accepts a trusted choice through the actual selector and blocks a host synthetic choice', async () => {
  await renderModal();
  await clickElement(getModelTrigger());
  await clickElement(button('GPT 4.1'), false);
  expect(rememberAIScenarioModelSelectionMock).not.toHaveBeenCalled();
  await clickElement(button('GPT 4.1'));
  expect(rememberAIScenarioModelSelectionMock).toHaveBeenCalledWith(
    expect.objectContaining({ scenario: 'page-extract' }),
    'page-extract',
    'model-1',
    'explicit'
  );
});

it('blocks pending choice and submit, preserves a failed choice and permits explicit retry', async () => {
  await renderModal();
  const write = deferred<void>();
  rememberAIScenarioModelSelectionMock.mockReturnValueOnce(write.promise);
  await clickElement(getModelTrigger());
  await clickElement(button('GPT 4.1'));
  expect(getModelTrigger()?.disabled).toBe(true);
  expect(button('Отправить запрос')?.disabled).toBe(true);
  await act(async () => write.resolve());
  expect(button('Отправить запрос')?.disabled).toBe(false);
  rememberAIScenarioModelSelectionMock.mockRejectedValueOnce(new Error('write refused'));
  await clickElement(getModelTrigger());
  await clickElement(button('GPT 4.1'));
  expect(container?.querySelector('[role="alert"]')?.textContent).toContain('модель');
  expect(getModelTrigger()?.textContent).toContain('GPT 4.1');
  await clickElement(getModelTrigger());
  await clickElement(button('GPT 4.1'));
  expect(container?.textContent).not.toContain('Выберите модель повторно');
});

it('requires explicit replacement for an unavailable remembered model without writing on open', async () => {
  const value = createIntegrationBootstrapPayload();
  requestAIScenarioModelSelectionMock.mockResolvedValue({
    ...value,
    resolution: { status: 'unavailable', modelId: null },
  });
  await renderModal();
  expect(button('Отправить запрос')?.disabled).toBe(true);
  expect(container?.querySelector('[role="status"]')).not.toBeNull();
  expect(rememberAIScenarioModelSelectionMock).not.toHaveBeenCalled();
});

it('keeps the prompt after a catalog failure and recovers through Retry', async () => {
  requestAIScenarioModelSelectionMock.mockRejectedValueOnce(new Error('catalog refused'));
  await renderModal();
  expect(container?.querySelector<HTMLTextAreaElement>('#ai-prompt')?.value).toBe('Stored prompt');
  expect(container?.querySelector('[role="alert"]')).not.toBeNull();
  await clickElement(button('Повторить'));
  expect(getModelTrigger()?.textContent).toContain('GPT 4.1');
  expect(rememberAIScenarioModelSelectionMock).not.toHaveBeenCalled();
});

it('rechecks the visible destination and refuses changed provider before submission', async () => {
  const submit = vi.fn();
  await renderModal(true, submit);
  const value = createIntegrationBootstrapPayload();
  requestAIScenarioModelSelectionMock.mockResolvedValue({
    ...value,
    providers: value.providers.map((provider) => ({ ...provider, incarnation: 'recreated' })),
  });
  await clickElement(button('Отправить запрос'));
  expect(submit).not.toHaveBeenCalled();
  expect(rememberAIScenarioModelSelectionMock).not.toHaveBeenCalled();
  expect(button('Отправить запрос')?.disabled).toBe(true);
});

it('cancels preparation on close and refuses a late result after reopening', async () => {
  const submit = vi.fn();
  await renderModal(true, submit);
  const read = deferred<ReturnType<typeof createIntegrationBootstrapPayload>>();
  requestAIScenarioModelSelectionMock.mockReturnValueOnce(read.promise);
  await clickElement(button('Отправить запрос'));
  expect(button('Отправить запрос')?.disabled).toBe(true);
  await renderModal(false, submit);
  await renderModal(true, submit);
  await act(async () => read.resolve(createIntegrationBootstrapPayload()));
  expect(submit).not.toHaveBeenCalled();
  expect(rememberAIScenarioModelSelectionMock).not.toHaveBeenCalled();
});

it('prepares and remembers the displayed first-use candidate before submitting once', async () => {
  const submit = vi.fn();
  await renderModal(true, submit);
  await clickElement(button('Отправить запрос'));
  expect(rememberAIScenarioModelSelectionMock).toHaveBeenCalledWith(
    expect.objectContaining({ scenario: 'page-extract' }),
    'page-extract',
    'model-1',
    'initial'
  );
  expect(submit).toHaveBeenCalledTimes(1);
  expect(submit).toHaveBeenCalledWith('Stored prompt', expect.any(String), 'model-1');
});

it.each(['catalog', 'preference'])(
  'preserves prompt and data after a %s failure during preparation',
  async (failure) => {
    const submit = vi.fn();
    await renderModal(true, submit);
    const originalData = readJsonPreview();
    if (failure === 'catalog')
      requestAIScenarioModelSelectionMock.mockRejectedValueOnce(new Error('read refused'));
    else rememberAIScenarioModelSelectionMock.mockRejectedValueOnce(new Error('write refused'));
    await clickElement(button('Отправить запрос'));
    expect(submit).not.toHaveBeenCalled();
    expect(container?.querySelector<HTMLTextAreaElement>('#ai-prompt')?.value).toBe(
      'Stored prompt'
    );
    expect(readJsonPreview()).toBe(originalData);
    expect(container?.querySelector('[role="alert"]')).not.toBeNull();
  }
);

it('refuses duplicate keyboard submission while preparation is pending', async () => {
  const submit = vi.fn();
  await renderModal(true, submit);
  const read = deferred<ReturnType<typeof createIntegrationBootstrapPayload>>();
  requestAIScenarioModelSelectionMock.mockReturnValueOnce(read.promise);
  const before = requestAIScenarioModelSelectionMock.mock.calls.length;
  await clickElement(button('Отправить запрос'));
  await act(async () => {
    container?.querySelector('#ai-prompt')?.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        ctrlKey: true,
        bubbles: true,
      })
    );
  });
  expect(requestAIScenarioModelSelectionMock).toHaveBeenCalledTimes(before + 1);
  await act(async () => read.resolve(createIntegrationBootstrapPayload()));
  expect(submit).toHaveBeenCalledTimes(1);
});

it.each(['click', 'keyboard'])(
  'rejects synthetic %s before first-use persistence and submission',
  async (route) => {
    const submit = vi.fn();
    await renderModal(true, submit);
    const reads = requestAIScenarioModelSelectionMock.mock.calls.length;
    if (route === 'click') await clickElement(button('Отправить запрос'), false);
    else
      await act(async () => {
        container?.querySelector('#ai-prompt')?.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Enter',
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
          })
        );
      });
    expect(requestAIScenarioModelSelectionMock).toHaveBeenCalledTimes(reads);
    expect(rememberAIScenarioModelSelectionMock).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  }
);

it('accepts synchronous activation-bridge model choice and refuses its retained replay', async () => {
  await renderModal();
  const pointer = new MouseEvent('pointerdown', { button: 0, buttons: 1 });
  await act(async () => {
    dispatchBridgedMouseEvent(getModelTrigger()!, 'click', pointer);
  });
  expect(container?.querySelector('.sniptale-dropdown-menu')).not.toBeNull();
  const retained: Event[] = [];
  button('GPT 4.1')!.addEventListener('click', (event) => retained.push(event));
  await act(async () => {
    dispatchBridgedMouseEvent(button('GPT 4.1')!, 'click', pointer);
  });
  expect(rememberAIScenarioModelSelectionMock).toHaveBeenCalledTimes(1);
  expect(retained).toHaveLength(1);
  await clickElement(getModelTrigger());
  await act(async () => {
    button('GPT 4.1')!.dispatchEvent(retained[0]!);
  });
  expect(rememberAIScenarioModelSelectionMock).toHaveBeenCalledTimes(1);
});

it('accepts activation-bridge Submit only during its original dispatch', async () => {
  const submit = vi.fn();
  await renderModal(true, submit);
  const retained: Event[] = [];
  const target = button('Отправить запрос')!;
  target.addEventListener('click', (event) => retained.push(event));
  await act(async () => {
    dispatchBridgedMouseEvent(target, 'click', new MouseEvent('pointerdown'));
  });
  expect(submit).toHaveBeenCalledTimes(1);
  expect(rememberAIScenarioModelSelectionMock).toHaveBeenCalledTimes(1);
  await act(async () => {
    target.dispatchEvent(retained[0]!);
  });
  expect(submit).toHaveBeenCalledTimes(1);
  expect(rememberAIScenarioModelSelectionMock).toHaveBeenCalledTimes(1);
});

it.each([true, false])(
  'submits the trusted original shortcut once through the editable bridge (ctrl=%s)',
  async (ctrl) => {
    const submit = vi.fn();
    await renderModal(true, submit);
    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      ctrlKey: ctrl,
      metaKey: !ctrl,
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    trusted.add(event);
    await act(async () => {
      container?.querySelector('#ai-prompt')?.dispatchEvent(event);
    });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(rememberAIScenarioModelSelectionMock).toHaveBeenCalledTimes(1);
  }
);

it('ignores trusted shortcuts outside the prompt and during IME composition', async () => {
  const submit = vi.fn();
  await renderModal(true, submit);
  const outside = document.createElement('textarea');
  document.body.append(outside);
  try {
    for (const target of [outside, container!.querySelector('#ai-prompt')!]) {
      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
        isComposing: target !== outside,
      });
      trusted.add(event);
      await act(async () => {
        target.dispatchEvent(event);
      });
    }
    expect(submit).not.toHaveBeenCalled();
    expect(rememberAIScenarioModelSelectionMock).not.toHaveBeenCalled();
  } finally {
    outside.remove();
  }
});
