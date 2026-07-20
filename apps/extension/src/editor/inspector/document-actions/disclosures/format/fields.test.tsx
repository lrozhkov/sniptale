// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { EditorDocumentExportPreferencesFields } from './fields';
import type { EditorExportImageSizeState } from '../../export-image-size';
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

it('renders the format and quality controls from shared settings state', () => {
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
    root?.render(<EditorDocumentExportPreferencesFields settings={settings} />);
  });

  const header = container?.querySelector('[data-ui="editor.file-actions.export-settings-header"]');

  expect(container?.textContent).toContain('PNG');
  expect(container?.textContent).toContain('JPG');
  expect(container?.textContent).toContain('WEBP');
  expect(container?.textContent).toContain('Формат изображения');
  expect(
    container?.querySelector<HTMLInputElement>('input[aria-label="Качество изображения"]')?.value
  ).toBe('72');
  expect(container?.textContent).toContain('%');
  expect(header?.className).toContain('text-[12px]');
  expect(header?.className).toContain('font-bold');
  expect(header?.className).toContain('uppercase');
  expect(header?.className).not.toContain('text-[13px]');
});

it('renders inline export size inputs when size state is provided', () => {
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
  const sizeState = {
    draft: { height: 900, width: 1600 },
    locked: true,
    setHeight: vi.fn(),
    setLocked: vi.fn(),
    setWidth: vi.fn(),
  } satisfies EditorExportImageSizeState;

  act(() => {
    root?.render(
      <EditorDocumentExportPreferencesFields settings={settings} sizeState={sizeState} />
    );
  });

  expect(container?.textContent).toContain('Размер изображения');
  expect(
    container?.querySelector('[data-ui="editor.file-actions.export-size.width"]')
  ).not.toBeNull();
  expect(
    container?.querySelector('[data-ui="editor.file-actions.export-size.height"]')
  ).not.toBeNull();
});

it('renders an inline persistence error when export settings rollback fails', () => {
  const settings = {
    commitImageQuality: vi.fn(),
    imageFormat: 'jpeg',
    imageQuality: 72,
    isPersisting: false,
    isClipboardCopySupported: true,
    isQualityDisabled: false,
    persistErrorMessage: 'persist failed',
    setImageFormat: vi.fn(),
    setImageQuality: vi.fn(),
  } as ReturnType<typeof useEditorExportSettingsState>;

  act(() => {
    root?.render(<EditorDocumentExportPreferencesFields settings={settings} />);
  });

  expect(container?.textContent).toContain('persist failed');
});
