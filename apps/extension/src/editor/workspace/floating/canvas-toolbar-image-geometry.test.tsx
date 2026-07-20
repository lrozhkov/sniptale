// @vitest-environment jsdom

import { act, type SetStateAction } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, expect, it, vi } from 'vitest';

import type { EditorToolbarSelectionState } from '../toolbar/types';
import { createCanvasToolbarImageGeometryGroup } from './canvas-toolbar-image-geometry';
import { createFloatingDocumentControllerFixture } from './document-controller.test-support';

vi.mock('../../inspector/compact', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../inspector/compact')>()),
  CompactCommandField: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

function createSelection(
  overrides: Partial<EditorToolbarSelectionState> = {}
): EditorToolbarSelectionState {
  return {
    hasSelection: true,
    selectedObjectCount: 1,
    selectedObjectId: 'layer-1',
    selectedObjectType: 'image',
    ...overrides,
  };
}

function createDocumentController() {
  let nextDraft = { height: 120, width: 160 };
  const updateLockedDraft = vi.fn(
    (state: typeof nextDraft, dimension: 'height' | 'width', value: number) => ({
      ...state,
      [dimension]: value,
    })
  );
  const setLayerSizeDraft = vi.fn((update: SetStateAction<typeof nextDraft>) => {
    nextDraft = typeof update === 'function' ? update(nextDraft) : update;
  });
  const onResizeLayer = vi.fn();
  const controller = createFloatingDocumentControllerFixture({
    DimensionInput: (props: { label: string; onChange: (value: number) => void }) => (
      <button type="button" aria-label={props.label} onClick={() => props.onChange(222)}>
        {props.label}
      </button>
    ),
    isResizableLayerSelection: true,
    layerAspectRatio: 4 / 3,
    layerSizeDraft: { height: 120, width: 160 },
    layerSizeLocked: true,
    onResizeLayer,
    setLayerSizeDraft,
    updateLockedDraft,
  });

  return { controller, getNextDraft: () => nextDraft, onResizeLayer, updateLockedDraft };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

it('omits image geometry without a resizable selected layer', () => {
  const { controller } = createDocumentController();

  expect(
    createCanvasToolbarImageGeometryGroup({
      documentController: { ...controller, isResizableLayerSelection: false },
      selection: createSelection(),
    })
  ).toBeNull();
  expect(
    createCanvasToolbarImageGeometryGroup({
      documentController: controller,
      selection: createSelection({ selectedObjectId: null }),
    })
  ).toBeNull();
});

it('renders image dimensions and routes draft and apply actions', () => {
  const fixture = createDocumentController();
  const group = createCanvasToolbarImageGeometryGroup({
    documentController: fixture.controller,
    selection: createSelection(),
  });
  const container = document.createElement('div');
  const root = createRoot(container);

  act(() => root.render(<>{group?.content}</>));
  const buttons = Array.from(container.querySelectorAll('button'));
  act(() => buttons.forEach((button) => button.click()));

  expect(group).toEqual(expect.objectContaining({ id: 'geometry', width: 'simple' }));
  expect(fixture.updateLockedDraft).toHaveBeenCalledWith(
    expect.anything(),
    'width',
    222,
    true,
    4 / 3
  );
  expect(fixture.updateLockedDraft).toHaveBeenCalledWith(
    expect.anything(),
    'height',
    222,
    true,
    4 / 3
  );
  expect(fixture.getNextDraft()).toEqual({ height: 222, width: 222 });
  expect(fixture.onResizeLayer).toHaveBeenCalledWith('layer-1', 160, 120);

  act(() => root.unmount());
});
