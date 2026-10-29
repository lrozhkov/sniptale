// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
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

vi.mock('../../../../../features/prompt-templates/editor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../features/prompt-templates/editor')>()),
  PromptTemplateEditor: () => null,
}));

vi.mock('../../../../platform/trusted-events', () => ({
  isTrustedDomEvent: () => true,
  isTrustedKeyboardEvent: () => true,
}));

import {
  cleanupBodyHarness,
  dispatchBodyModalEscape,
  dispatchBodyTextareaSubmitShortcut,
  readBodyJsonPreview,
  readTokenCounter,
  renderBodyHarness,
  selectFirstBodyModel,
  toggleBodyJsonPreview,
  unsetBodyModel,
} from './body.test-support';
import { getBodyHarnessContainer } from './body.test-support.harness';

function expectBodyDataPanelOpen() {
  expect(
    getBodyHarnessContainer()
      ?.querySelector('.sniptale-ai-spoiler-toggle')
      ?.getAttribute('aria-expanded')
  ).toBe('true');
}

async function uncheckBodySelection(target: 'section' | 'row' | 'column') {
  const container = getBodyHarnessContainer();
  expect(container).not.toBeNull();
  const checkbox = Array.from(
    container!.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
  ).find((input) => {
    if (target === 'section') return input.getAttribute('aria-label') === 'Section';
    if (target === 'column') return input.closest('label')?.textContent?.trim() === 'Assignee';
    const labelId = input.getAttribute('aria-labelledby');
    return (
      labelId !== null && document.getElementById(labelId)?.textContent?.includes('Alice Example')
    );
  });
  expect(checkbox).toBeDefined();
  expect(checkbox!.checked).toBe(true);
  await act(async () => {
    checkbox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  expect(checkbox!.checked).toBe(false);
}

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
    expectBodyDataPanelOpen();

    const initialTokens = readTokenCounter();
    await uncheckBodySelection('section');

    expect(readTokenCounter()).not.toBe(initialTokens);
  });

  it('recomputes the token counter when a row checkbox changes', async () => {
    await renderBodyHarness();
    expectBodyDataPanelOpen();

    const initialTokens = readTokenCounter();
    await uncheckBodySelection('row');

    expect(readTokenCounter()).not.toBe(initialTokens);
  });

  it('recomputes the token counter when a column checkbox changes', async () => {
    await renderBodyHarness();
    expectBodyDataPanelOpen();

    const initialTokens = readTokenCounter();
    await uncheckBodySelection('column');

    expect(readTokenCounter()).not.toBe(initialTokens);
  });

  it('updates the visible JSON preview when a row checkbox changes', async () => {
    await renderBodyHarness();
    expectBodyDataPanelOpen();
    await toggleBodyJsonPreview();

    expect(readBodyJsonPreview()).toContain('Alice Example');

    await uncheckBodySelection('row');

    expect(readBodyJsonPreview()).not.toContain('Alice Example');
    expect(readBodyJsonPreview()).toContain('Bob Example');
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

  it.each([{ voiceActive: true }, { voicePending: true }])(
    'cancels voice on the first Escape and closes on the second (%j)',
    async (voice) => {
      const onClose = vi.fn();
      const onStopVoice = vi.fn();

      await renderBodyHarness({ onClose, onStopVoice, ...voice });
      await dispatchBodyModalEscape();

      expect(onStopVoice).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();

      await dispatchBodyModalEscape();

      expect(onClose).toHaveBeenCalledTimes(1);
    }
  );
});
