// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const useEditorExportSettingsStateMock = vi.hoisted(() => vi.fn());

import { EditorDocumentImageFormatContent } from './content';
import type { EditorExportImageSizeState } from '../export-image-size';
import { useEditorExportSettingsState } from '../export-settings';

vi.mock('../export-settings', () => ({
  useEditorExportSettingsState: useEditorExportSettingsStateMock,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  useEditorExportSettingsStateMock.mockReturnValue({
    commitImageQuality: vi.fn(),
    imageFormat: 'jpeg',
    imageQuality: 72,
    isPersisting: false,
    isClipboardCopySupported: true,
    isQualityDisabled: false,
    persistErrorMessage: null,
    setImageFormat: vi.fn(),
    setImageQuality: vi.fn(),
  } as ReturnType<typeof useEditorExportSettingsState>);
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

it('renders the provided editor export settings without loading hook state', () => {
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

  act(() => {
    root?.render(<EditorDocumentImageFormatContent settings={settings} />);
  });

  expect(container?.textContent).toContain('PNG');
});

it('renders export size controls only when size state is provided', () => {
  const settings = {
    commitImageQuality: vi.fn(),
    imageFormat: 'jpeg',
    imageQuality: 80,
    isPersisting: false,
    isClipboardCopySupported: true,
    isQualityDisabled: false,
    persistErrorMessage: null,
    setImageFormat: vi.fn(),
    setImageQuality: vi.fn(),
  } as ReturnType<typeof useEditorExportSettingsState>;
  const sizeState = {
    draft: { height: 450, width: 800 },
    locked: true,
    setHeight: vi.fn(),
    setLocked: vi.fn(),
    setWidth: vi.fn(),
  } satisfies EditorExportImageSizeState;

  act(() => {
    root?.render(<EditorDocumentImageFormatContent settings={settings} sizeState={sizeState} />);
  });

  expect(container?.textContent).toContain('Размер изображения');
  expect(
    container?.querySelector('[data-ui="editor.file-actions.export-size.width"]')
  ).not.toBeNull();
});

it('renders the hook-provided editor export settings when no props are passed', () => {
  act(() => {
    root?.render(<EditorDocumentImageFormatContent />);
  });

  expect(container?.textContent).toContain('JPG');
  expect(
    container?.querySelector<HTMLInputElement>('input[aria-label="Качество изображения"]')?.value
  ).toBe('72');
  expect(container?.textContent).toContain('%');
  expect(useEditorExportSettingsStateMock).toHaveBeenCalledTimes(1);
});
