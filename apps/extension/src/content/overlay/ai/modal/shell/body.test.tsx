// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSharedUiTestMock } from './index.test-support';

const { aiModelSelectorMock } = vi.hoisted(() => ({
  aiModelSelectorMock: vi.fn(),
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

import {
  cleanupBodyHarness,
  dispatchBodyModalEscape,
  dispatchBodyTextareaSubmitShortcut,
  expandBodyDataPanel,
  readBodyJsonPreview,
  readTokenCounter,
  renderBodyHarness,
  selectFirstBodyModel,
  toggleBodyJsonPreview,
  toggleBodyCheckboxAt,
  unsetBodyModel,
} from './body.test-support';

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  cleanupBodyHarness();
  vi.unstubAllGlobals();
});

describe('AIModalContent token counter', () => {
  it('recomputes the token counter when a section checkbox changes', async () => {
    await renderBodyHarness();
    await expandBodyDataPanel();

    const initialTokens = readTokenCounter();
    await toggleBodyCheckboxAt(0);

    expect(readTokenCounter()).not.toBe(initialTokens);
  });

  it('recomputes the token counter when a row checkbox changes', async () => {
    await renderBodyHarness();
    await expandBodyDataPanel();

    const initialTokens = readTokenCounter();
    await toggleBodyCheckboxAt(2);

    expect(readTokenCounter()).not.toBe(initialTokens);
  });

  it('recomputes the token counter when a column checkbox changes', async () => {
    await renderBodyHarness();
    await expandBodyDataPanel();

    const initialTokens = readTokenCounter();
    await toggleBodyCheckboxAt(3);

    expect(readTokenCounter()).not.toBe(initialTokens);
  });

  it('updates the visible JSON preview when a row checkbox changes', async () => {
    await renderBodyHarness();
    await expandBodyDataPanel();
    await toggleBodyJsonPreview();

    expect(readBodyJsonPreview()).toContain('Alice Example');

    await toggleBodyCheckboxAt(2);

    expect(readBodyJsonPreview()).not.toContain('Alice Example');
  });
});

describe('AIModalContent keyboard shortcuts', () => {
  it('does not submit on Ctrl+Enter when the model is unset, but submits once the model is back', async () => {
    const onSubmit = vi.fn();

    await renderBodyHarness({ onSubmit });
    await unsetBodyModel();
    await dispatchBodyTextareaSubmitShortcut();
    expect(onSubmit).not.toHaveBeenCalled();

    await selectFirstBodyModel();
    await dispatchBodyTextareaSubmitShortcut();

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape from the modal surface', async () => {
    const onClose = vi.fn();

    await renderBodyHarness({ onClose });
    await dispatchBodyModalEscape();

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
