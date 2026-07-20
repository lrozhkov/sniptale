// @vitest-environment jsdom

import type { ComponentProps } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { translate } from '../../../platform/i18n';
import type { SavePreset } from '../../../contracts/settings';
import {
  expectFileMenuButtonOrder,
  expectFileMenuDividers,
  expectFileMenuFormatContent,
  expectFileMenuGroupOrder,
  expectFileMenuKeyActionStates,
} from './hierarchy.test-support';
import type { EditorInspectorDocumentActionsProps } from './props';

let root: Root | null = null;
let container: HTMLDivElement | null = null;
const DOCUMENT_ACTIONS_TEST_TIMEOUT_MS = 30000;
let EditorInspectorDocumentActionsModule: typeof import('./') | null = null;

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sniptale/platform/browser/runtime')>();
  const runtimeInfo = {
    getContexts: vi.fn(),
    getLastError: vi.fn(),
    getManifest: vi.fn(() => ({ version: '0.0.0-test' })),
    getPlatformInfo: vi.fn(),
    getURL: vi.fn(),
  };

  return {
    ...actual,
    browserRuntime: {
      ...runtimeInfo,
      subscribeToMessages: vi.fn(),
    },
    runtimeInfo,
  };
});

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('navigator', {
    clipboard: {
      write: vi.fn(),
    },
  });
  vi.stubGlobal('ClipboardItem', {
    supports: (mimeType: string) => mimeType === 'image/png',
  });
  window.localStorage.clear();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

function createSavePresets(): SavePreset[] {
  return [
    { enabled: true, id: 'preset-default', name: 'Команда', order: 0, path: 'team' },
    { enabled: true, id: 'preset-archive', name: 'Архив', order: 1, path: 'archive' },
  ];
}

async function renderDocumentActions(overrides: Partial<EditorInspectorDocumentActionsProps> = {}) {
  EditorInspectorDocumentActionsModule ??= await import('./');
  const { EditorInspectorDocumentActions } = EditorInspectorDocumentActionsModule;

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  const props: ComponentProps<typeof EditorInspectorDocumentActions> = {
    canvasSize: { height: 720, width: 1280 },
    defaultImagePresetId: 'preset-default',
    onCloseDocument: () => undefined,
    onCopyRenderedImage: () => undefined,
    onExportSession: () => undefined,
    onImportSession: () => undefined,
    onOpenImage: () => undefined,
    onSaveImage: () => undefined,
    onSaveImageAs: () => undefined,
    onSaveToPreset: () => undefined,
    savePresets: createSavePresets(),
    ...overrides,
  };

  act(() => {
    root?.render(<EditorInspectorDocumentActions {...props} />);
  });
}

async function waitForSelector(selector: string, timeoutMs = 1500) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const element = document.querySelector(selector);
    if (element) {
      return element;
    }

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 16));
    });
  }

  return document.querySelector(selector);
}

async function openSaveToFolderDisclosure() {
  if (
    document.querySelector('[data-ui="editor.file-actions.presets-list"]') ||
    document.querySelector('[data-ui="editor.file-actions.presets-empty"]')
  ) {
    return;
  }

  const disclosureButton = document.querySelector<HTMLButtonElement>(
    '[data-ui="editor.file-actions.content.save-to-folder"] button'
  );
  expect(disclosureButton).not.toBeNull();

  await act(async () => {
    disclosureButton?.click();
  });

  await waitForSelector(
    '[data-ui="editor.file-actions.presets-list"], [data-ui="editor.file-actions.presets-empty"]'
  );
}

async function expectDefaultPresetState() {
  await openSaveToFolderDisclosure();

  const defaultPreset = document.querySelector<HTMLElement>(
    '[data-ui="editor.file-actions.preset.preset-default"]'
  );
  expect(defaultPreset?.dataset['default']).toBe('true');
}

async function expectExpandedDocumentHierarchy() {
  expectFileMenuGroupOrder();
  expectFileMenuDividers();
  expectFileMenuFormatContent();
  expectFileMenuButtonOrder();
  expectFileMenuKeyActionStates();
  await expectDefaultPresetState();
}

async function expectFileMenuFlatFormatState() {
  await renderDocumentActions();

  const saveDisclosure = document.querySelector<HTMLElement>(
    '[data-ui="editor.file-actions.content.save-to-folder"]'
  );
  const imageFormat = document.querySelector<HTMLElement>(
    '[data-ui="editor.file-actions.content.image-format"]'
  );

  expect(
    document.querySelector('[data-ui="editor.file-actions.action.save-image"]')?.textContent
  ).toContain('Сохранить в загрузки');
  expect(saveDisclosure?.textContent).toContain('Сохранить в папку');
  expect(saveDisclosure?.textContent).not.toContain('Команда');
  expect(imageFormat?.textContent).toContain('PNG');
  expect(imageFormat?.textContent).toContain('JPG');
  expect(imageFormat?.textContent).toContain('WEBP');
  expect(
    document.querySelector('[data-ui="editor.file-actions.content.export-preferences"]')
  ).toBeNull();
  expect(document.querySelector('[data-ui="editor.file-actions.presets-list"]')).toBeNull();
}

async function expectEmptyPresetsHint() {
  await renderDocumentActions({
    defaultImagePresetId: null,
    savePresets: [],
  });

  await openSaveToFolderDisclosure();

  const emptyState = document.querySelector<HTMLElement>(
    '[data-ui="editor.file-actions.presets-empty"]'
  );
  expect(emptyState).not.toBeNull();
  expect(emptyState?.className.includes('border')).toBe(false);
}

async function expectSavedFeedbackForSaveActions() {
  await renderDocumentActions({
    onSaveImage: async () => undefined,
    onSaveToPreset: async () => undefined,
  });

  const saveButton = document.querySelector<HTMLButtonElement>(
    '[data-ui="editor.file-actions.action.save-image"]'
  );
  await act(async () => {
    saveButton?.click();
    await Promise.resolve();
  });
  expect(
    saveButton?.querySelector(`[aria-label="${translate('common.states.saved')}"]`)
  ).not.toBeNull();

  await openSaveToFolderDisclosure();

  const presetButton = document.querySelector<HTMLButtonElement>(
    '[data-ui="editor.file-actions.preset.preset-default"]'
  );
  await act(async () => {
    presetButton?.click();
    await Promise.resolve();
  });
  expect(
    presetButton?.querySelector(`[aria-label="${translate('common.states.saved')}"]`)
  ).not.toBeNull();
  expect(presetButton?.textContent).not.toContain('По умолчанию');
}

async function expectExplicitCopyDisabledReasonWins() {
  await renderDocumentActions({
    copyRenderedImageDisabledReason: 'custom-disabled',
  });

  const copyButton = document.querySelector<HTMLButtonElement>(
    '[data-ui="editor.file-actions.action.copy-png"]'
  );
  expect(copyButton?.disabled).toBe(true);
  expect(copyButton?.title).toBe('custom-disabled');
}

describe('EditorInspectorDocumentActions', () => {
  it(
    'renders save flow first and keeps advanced actions below presets',
    async () => {
      await renderDocumentActions();
      await expectExpandedDocumentHierarchy();
    },
    DOCUMENT_ACTIONS_TEST_TIMEOUT_MS
  );

  it('renders a flat file menu with image format visible immediately', async () => {
    await expectFileMenuFlatFormatState();
  });

  it('renders presets empty state as an inline hint', async () => {
    await expectEmptyPresetsHint();
  });

  it('shows saved feedback for save and save-to-folder actions', async () => {
    await expectSavedFeedbackForSaveActions();
  });

  it('prefers explicit copy disabled reasons over fallback export constraints', async () => {
    await expectExplicitCopyDisabledReasonWins();
  });
});
