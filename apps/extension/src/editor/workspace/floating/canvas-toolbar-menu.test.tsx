// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { EditorToolbarSelectionState } from '../toolbar/types';
import {
  buildCanvasToolbarMoreContent,
  createCanvasToolbarEffectsGroup,
  type CanvasToolbarActionHandlers,
} from './canvas-toolbar-menu';
import { createFloatingDocumentControllerFixture } from './document-controller.test-support';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createSelection(
  overrides: Partial<EditorToolbarSelectionState> = {}
): EditorToolbarSelectionState {
  return {
    hasSelection: true,
    selectedObjectCount: 1,
    selectedObjectId: 'layer-1',
    selectedObjectType: 'rectangle',
    ...overrides,
  };
}

function createHandlers(): CanvasToolbarActionHandlers {
  return {
    arrangeSelection: vi.fn(),
    deleteSelection: vi.fn(),
    duplicateSelection: vi.fn(),
    openLayerEffects: vi.fn(),
    toggleLayerLock: vi.fn(),
  };
}

function renderContent(content: React.ReactNode): HTMLButtonElement[] {
  container = document.createElement('div');
  root = createRoot(container);
  act(() => root?.render(<>{content}</>));
  return Array.from(container.querySelectorAll('button'));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

it('routes enabled mutation, arrangement, and effect menu actions', () => {
  const handlers = createHandlers();
  const buttons = renderContent(
    buildCanvasToolbarMoreContent({
      documentController: createFloatingDocumentControllerFixture(),
      handlers,
      hasEffectsGroup: true,
      selection: createSelection(),
    })
  );

  expect(buttons).toHaveLength(9);
  act(() => buttons.forEach((button) => button.click()));

  expect(handlers.duplicateSelection).toHaveBeenCalledOnce();
  expect(handlers.deleteSelection).toHaveBeenCalledOnce();
  expect(handlers.arrangeSelection).toHaveBeenCalledTimes(4);
  expect(handlers.arrangeSelection).toHaveBeenCalledWith('forward');
  expect(handlers.arrangeSelection).toHaveBeenCalledWith('backward');
  expect(handlers.arrangeSelection).toHaveBeenCalledWith('front');
  expect(handlers.arrangeSelection).toHaveBeenCalledWith('back');
  expect(handlers.openLayerEffects).toHaveBeenNthCalledWith(
    1,
    'layer-1',
    'adjustments',
    'brightness'
  );
  expect(handlers.openLayerEffects).toHaveBeenNthCalledWith(2, 'layer-1', 'transformations', null);
  expect(handlers.openLayerEffects).toHaveBeenNthCalledWith(3, 'layer-1', 'filters', 'blur');
});

it('disables all selection mutations for a locked source image', () => {
  const buttons = renderContent(
    buildCanvasToolbarMoreContent({
      documentController: createFloatingDocumentControllerFixture(),
      handlers: createHandlers(),
      hasEffectsGroup: false,
      selection: createSelection({
        selectedObjectLocked: true,
        selectedObjectType: 'source-image',
      }),
    })
  );

  expect(buttons).toHaveLength(9);
  expect(buttons.every((button) => button.disabled)).toBe(true);
});

it('creates effects content only for an unlocked selected layer', () => {
  const handlers = createHandlers();

  expect(
    createCanvasToolbarEffectsGroup({
      handlers,
      selection: createSelection({ selectedObjectId: null }),
    })
  ).toBeNull();
  expect(
    createCanvasToolbarEffectsGroup({
      handlers,
      selection: createSelection({ selectedObjectLocked: true }),
    })
  ).toBeNull();

  const group = createCanvasToolbarEffectsGroup({ handlers, selection: createSelection() });
  const buttons = renderContent(group?.content);
  act(() => buttons.forEach((button) => button.click()));

  expect(group).toEqual(expect.objectContaining({ id: 'effects', width: 'rich' }));
  expect(handlers.openLayerEffects).toHaveBeenCalledTimes(3);
});
