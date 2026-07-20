// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { EditorDocumentExportPreferencesFormatSection } from './section';
import { useEditorExportSettingsState } from '../../export-settings';

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

it('renders the format section with the available options', () => {
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

  act(() => {
    root?.render(<EditorDocumentExportPreferencesFormatSection settings={settings} />);
  });

  expect(container?.textContent).toContain('PNG');
  expect(container?.textContent).toContain('JPG');
  expect(container?.textContent).toContain('WEBP');
  expect(container?.querySelector('[aria-pressed="true"]')?.textContent).toContain('JPG');
  expect(container?.querySelectorAll('button[aria-pressed]')).toHaveLength(3);

  const pngButton = Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
    button.textContent?.includes('PNG')
  );

  act(() => {
    pngButton?.click();
  });

  expect(settings.setImageFormat).toHaveBeenCalledWith('png');
});
