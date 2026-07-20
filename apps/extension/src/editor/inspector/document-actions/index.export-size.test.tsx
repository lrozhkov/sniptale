// @vitest-environment jsdom

import type { ComponentProps } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { useEditorExportImageSizeStateMock } = vi.hoisted(() => ({
  useEditorExportImageSizeStateMock: vi.fn(),
}));

vi.mock('./export-image-size', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./export-image-size')>()),
  useEditorExportImageSizeState: useEditorExportImageSizeStateMock,
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let EditorInspectorDocumentActionsModule: typeof import('./') | null = null;

async function renderDocumentActions(
  overrides: Partial<ComponentProps<typeof import('./').EditorInspectorDocumentActions>> = {}
) {
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
    savePresets: [{ enabled: true, id: 'preset-default', name: 'Команда', order: 0, path: 'team' }],
    ...overrides,
  };

  act(() => {
    root?.render(<EditorInspectorDocumentActions {...props} />);
  });
}

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
  useEditorExportImageSizeStateMock.mockReturnValue({
    draft: { height: 900, width: 1600 },
    locked: false,
    setHeight: vi.fn(),
    setLocked: vi.fn(),
    setWidth: vi.fn(),
  });
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

it('routes the inline export size draft into save and copy actions', async () => {
  const onSaveImage = vi.fn(async () => undefined);
  const onCopyRenderedImage = vi.fn(async () => undefined);

  await renderDocumentActions({
    onCopyRenderedImage,
    onSaveImage,
  });

  const saveButton = document.querySelector<HTMLButtonElement>(
    '[data-ui="editor.file-actions.action.save-image"]'
  );
  const copyButton = document.querySelector<HTMLButtonElement>(
    '[data-ui="editor.file-actions.action.copy-png"]'
  );

  await act(async () => {
    saveButton?.click();
    await Promise.resolve();
  });
  await act(async () => {
    copyButton?.click();
    await Promise.resolve();
  });

  expect(onSaveImage).toHaveBeenCalledWith({
    outputSize: { height: 900, width: 1600 },
  });
  expect(onCopyRenderedImage).toHaveBeenCalledWith({
    outputSize: { height: 900, width: 1600 },
  });
});
