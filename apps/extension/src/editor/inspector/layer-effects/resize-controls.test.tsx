// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { INSPECTOR_PRIMARY_BUTTON_CLASS_NAME } from '../chrome';

const numericValueFieldMock = vi.hoisted(() =>
  vi.fn<(props: Record<string, unknown>) => null>(() => null)
);

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../chrome/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../chrome/ui')>()),
  NumericValueField: numericValueFieldMock,
  EditorIconButton: (props: Record<string, unknown>) => (
    <button type="button" title={String(props['title'])} onClick={props['onClick'] as never}>
      {String(props['title'])}
    </button>
  ),
  cx: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
}));

vi.mock('../tools/sections', () => ({
  CollapsibleSection: (props: { children: React.ReactNode }) => <section>{props.children}</section>,
  HeaderValueToggleSection: () => null,
  PanelSection: (props: { children: React.ReactNode }) => <section>{props.children}</section>,
  renderSelectionActionsSectionWithController: () => null,
}));

import { ResizeTransformationControls } from './resize-controls';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderControls() {
  const onResizeLayer = vi.fn();
  const setLayerSizeDraft = vi.fn();
  const setLayerSizeLocked = vi.fn();
  const updateLockedDraft = vi.fn((state, field, value) => ({ ...state, [field]: value }));

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <ResizeTransformationControls
        layerId="layer-1"
        layerAspectRatio={4 / 3}
        layerSizeDraft={{ height: 120, width: 160 }}
        layerSizeLocked={true}
        layerSizeText="160 x 120"
        onResizeLayer={onResizeLayer}
        setLayerSizeDraft={setLayerSizeDraft}
        setLayerSizeLocked={setLayerSizeLocked}
        updateLockedDraft={updateLockedDraft}
      />
    )
  );

  return { onResizeLayer, setLayerSizeDraft, setLayerSizeLocked, updateLockedDraft };
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  numericValueFieldMock.mockClear();
});

it('updates draft dimensions, toggles aspect ratio lock, and applies resize', () => {
  const { onResizeLayer, setLayerSizeDraft, setLayerSizeLocked, updateLockedDraft } =
    renderControls();
  const lockButton = container?.querySelector(
    'button[title="editor.compact.keepAspectRatio"]'
  ) as HTMLButtonElement | null;
  const applyButton = Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
    button.textContent?.includes('editor.toolbar.layerEffectsApplyResize')
  );
  const widthInputProps = numericValueFieldMock.mock.calls.at(0)?.[0] as
    | { onPreviewValue?: (value: number) => void }
    | undefined;

  act(() => widthInputProps?.onPreviewValue?.(320));
  act(() => lockButton?.click());
  act(() => applyButton?.click());

  const draftUpdater = setLayerSizeDraft.mock.calls[0]?.[0] as
    | ((state: { width: number; height: number }) => { width: number; height: number })
    | undefined;
  const lockUpdater = setLayerSizeLocked.mock.calls[0]?.[0] as
    | ((state: boolean) => boolean)
    | undefined;

  expect(draftUpdater?.({ height: 120, width: 160 })).toEqual({ height: 120, width: 320 });
  expect(updateLockedDraft).toHaveBeenCalledWith(
    { height: 120, width: 160 },
    'width',
    320,
    true,
    4 / 3
  );
  expect(lockUpdater?.(true)).toBe(false);
  expect(onResizeLayer).toHaveBeenCalledWith('layer-1', 160, 120);
  expect(applyButton?.className).toContain(INSPECTOR_PRIMARY_BUTTON_CLASS_NAME);
  expect(applyButton?.className).toContain('bg-transparent');
  expect(applyButton?.className).not.toContain('text-white');
});

it('keeps both dimension inputs and the lock icon on the same compact row', () => {
  renderControls();

  const inputs = numericValueFieldMock.mock.calls.map((call) => call[0]);
  expect(inputs).toHaveLength(2);
  expect(inputs[0]).toEqual(expect.objectContaining({ unit: 'px', value: 160 }));
  expect(inputs[1]).toEqual(expect.objectContaining({ unit: 'px', value: 120 }));
  expect(container?.querySelector('button[title="editor.compact.keepAspectRatio"]')).not.toBeNull();
});

it('passes numeric dimension values directly into the deferred state updater', () => {
  const { setLayerSizeDraft, updateLockedDraft } = renderControls();
  const widthInputProps = numericValueFieldMock.mock.calls.at(0)?.[0] as
    | { onPreviewValue?: (value: number) => void }
    | undefined;

  act(() => widthInputProps?.onPreviewValue?.(320));

  const draftUpdater = setLayerSizeDraft.mock.calls[0]?.[0] as
    | ((state: { width: number; height: number }) => { width: number; height: number })
    | undefined;

  expect(() => draftUpdater?.({ height: 120, width: 160 })).not.toThrow();
  expect(updateLockedDraft).toHaveBeenCalledWith(
    { height: 120, width: 160 },
    'width',
    320,
    true,
    4 / 3
  );
});
