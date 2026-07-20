// @vitest-environment jsdom

import { useState } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { EditorDocumentExportPreferencesQualitySection } from './quality';
import { useEditorExportSettingsState } from '../export-settings';

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

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

function updateNumericValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function renderQualitySection(settings: ReturnType<typeof useEditorExportSettingsState>) {
  act(() => {
    root?.render(<EditorDocumentExportPreferencesQualitySection settings={settings} />);
  });
}

function renderPendingQualityHarness(args: {
  commitImageQuality: ReturnType<typeof vi.fn>;
  initialImageQuality: number;
}) {
  function QualityHarness() {
    const [imageQuality, setImageQuality] = useState(args.initialImageQuality);

    return (
      <EditorDocumentExportPreferencesQualitySection
        settings={
          {
            commitImageQuality: args.commitImageQuality,
            imageFormat: 'jpeg',
            imageQuality,
            isPersisting: true,
            isClipboardCopySupported: true,
            isQualityDisabled: false,
            persistErrorMessage: null,
            setImageFormat: vi.fn(),
            setImageQuality,
          } as ReturnType<typeof useEditorExportSettingsState>
        }
      />
    );
  }

  act(() => {
    root?.render(<QualityHarness />);
  });
}

function commitQualityInputValue(input: HTMLInputElement, value: string) {
  act(() => {
    input.focus();
    updateNumericValue(input, value);
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  });
}

it('renders the quality control only for non-PNG formats', () => {
  const settings = {
    commitImageQuality: vi.fn(),
    imageFormat: 'jpeg',
    imageQuality: 72,
    isPersisting: false,
    isClipboardCopySupported: true,
    isQualityDisabled: false,
    persistErrorMessage: null,
    setImageFormat: vi.fn(),
    setImageQuality: vi.fn(),
  } as ReturnType<typeof useEditorExportSettingsState>;

  renderQualitySection(settings);

  expect(
    container?.querySelector('[data-ui="shared.ui.compact-inspector.numeric-row"]')
  ).not.toBeNull();
  expect((container?.querySelector('input[type="text"]') as HTMLInputElement | null)?.value).toBe(
    '72'
  );
  expect(container?.textContent).toContain('%');
  expect(container?.querySelector('input[type="range"]')).not.toBeNull();
});

it('commits quality changes from numeric editing on Enter', () => {
  const settings = {
    commitImageQuality: vi.fn(),
    imageFormat: 'jpeg',
    imageQuality: 72,
    isPersisting: false,
    isClipboardCopySupported: true,
    isQualityDisabled: false,
    persistErrorMessage: null,
    setImageFormat: vi.fn(),
    setImageQuality: vi.fn(),
  } as ReturnType<typeof useEditorExportSettingsState>;

  renderQualitySection(settings);

  const input = container?.querySelector('input[type="text"]') as HTMLInputElement;

  act(() => {
    input.focus();
    updateNumericValue(input, '40');
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  });

  expect(settings.setImageQuality).toHaveBeenCalledWith(40);
  expect(settings.commitImageQuality).toHaveBeenCalledTimes(1);
});

it('keeps the range interactive while a quality persist is still pending', async () => {
  const pendingCommit = createDeferred();
  const commitImageQuality = vi.fn(() => pendingCommit.promise);

  renderPendingQualityHarness({ commitImageQuality, initialImageQuality: 72 });
  const input = container?.querySelector('input[type="text"]') as HTMLInputElement;
  commitQualityInputValue(input, '40');

  const currentInput = container?.querySelector('input[type="text"]') as HTMLInputElement;

  expect(currentInput.disabled).toBe(false);
  expect(currentInput.value).toBe('40');
  expect(container?.textContent).toContain('%');
  expect(commitImageQuality).toHaveBeenCalledTimes(1);

  act(() => {
    currentInput.focus();
    updateNumericValue(currentInput, '41');
  });

  const updatedInput = container?.querySelector('input[type="text"]') as HTMLInputElement;

  expect(updatedInput.disabled).toBe(false);
  expect(updatedInput.value).toBe('41');

  pendingCommit.resolve();
});

it('hides the quality control when PNG is selected', () => {
  const settings = {
    commitImageQuality: vi.fn(),
    imageFormat: 'png',
    imageQuality: 100,
    isPersisting: false,
    isClipboardCopySupported: true,
    isQualityDisabled: true,
    persistErrorMessage: null,
    setImageFormat: vi.fn(),
    setImageQuality: vi.fn(),
  } as ReturnType<typeof useEditorExportSettingsState>;

  renderQualitySection(settings);

  expect(container?.textContent).toBe('');
  expect(container?.querySelector('input[type="range"]')).toBeNull();
});
