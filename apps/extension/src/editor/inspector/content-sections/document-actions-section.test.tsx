// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

const { documentActionsSpy } = vi.hoisted(() => ({
  documentActionsSpy: vi.fn(),
}));

vi.mock('../document-actions', () => ({
  EditorInspectorDocumentActions: (props: unknown) => {
    documentActionsSpy(props);
    return <div>document-actions</div>;
  },
}));

import { EditorInspectorDocumentActionsSection } from './document-actions-section';

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  documentActionsSpy.mockReset();
});

afterEach(() => {
  root?.unmount();
  root = null;
  container?.remove();
  container = null;
});

it('forwards document-action handlers without widening the disabled reason surface', () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() =>
    root?.render(
      <EditorInspectorDocumentActionsSection
        canvasSize={{ height: 720, width: 1280 }}
        savePresets={[]}
        defaultImagePresetId={null}
        saveToPreset={vi.fn(async () => undefined)}
        onSaveImage={vi.fn(async () => undefined)}
        onSaveImageAs={vi.fn(async () => undefined)}
        onCopyRenderedImage={vi.fn()}
        onOpenImage={vi.fn()}
        onCloseDocument={vi.fn()}
        onExportSession={vi.fn()}
        onImportSession={vi.fn()}
      />
    )
  );

  expect(container.textContent).toContain('document-actions');
  expect(container.firstElementChild?.className).toContain('space-y-5');
  expect(documentActionsSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      canvasSize: { height: 720, width: 1280 },
      defaultImagePresetId: null,
      savePresets: [],
    })
  );
  expect(documentActionsSpy).toHaveBeenCalledWith(
    expect.not.objectContaining({
      copyRenderedImageDisabledReason: expect.anything(),
    })
  );
});

it('forwards explicit disabled reason values to the document-actions owner', () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() =>
    root?.render(
      <EditorInspectorDocumentActionsSection
        canvasSize={{ height: 720, width: 1280 }}
        savePresets={[]}
        defaultImagePresetId={null}
        saveToPreset={vi.fn(async () => undefined)}
        onSaveImage={vi.fn(async () => undefined)}
        onSaveImageAs={vi.fn(async () => undefined)}
        onCopyRenderedImage={vi.fn()}
        copyRenderedImageDisabledReason={null}
        onOpenImage={vi.fn()}
        onCloseDocument={vi.fn()}
        onExportSession={vi.fn()}
        onImportSession={vi.fn()}
      />
    )
  );

  expect(documentActionsSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      copyRenderedImageDisabledReason: null,
      onSaveToPreset: expect.any(Function),
    })
  );
});
