// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import type { Canvas } from 'fabric';
import { createDefaultRichShapeObject } from '../../../features/editor/document/rich-shape';

const richShapeMocks = vi.hoisted(() => ({
  applyRichShapeDocumentObjectToObject: vi.fn(),
  exportRichShapeDocumentObject: vi.fn(),
  getRichShapeTextCapability: vi.fn(),
  isRichShapeObject: vi.fn(),
}));

vi.mock('../../objects/rich-shape', () => richShapeMocks);

import {
  cancelRichShapeTextEditor,
  commitRichShapeTextEditor,
  refreshRichShapeTextEditorForCanvas,
  refreshRichShapeTextEditor,
  startRichShapeTextEditor,
} from './session';

type MockRichShape = {
  calcTransformMatrix: () => [number, number, number, number, number, number];
  getObjects: () => never[];
  sniptaleId: string;
  sniptaleRichShape: ReturnType<typeof createDefaultRichShapeObject>;
  sniptaleType: 'rich-shape';
  supportsText?: boolean;
};

function createObject(overrides: Partial<MockRichShape['sniptaleRichShape']> = {}): MockRichShape {
  return {
    calcTransformMatrix: () => [1, 0, 0, 1, 0, 0],
    getObjects: () => [],
    sniptaleId: overrides.id ?? 'shape-1',
    sniptaleRichShape: createDefaultRichShapeObject({
      frame: { height: 90, left: 10, top: 20, width: 160 },
      id: overrides.id ?? 'shape-1',
      text: {
        ...createDefaultRichShapeObject().text,
        color: '#111111',
        content: 'Original',
        fontSize: 18,
      },
      ...overrides,
    }),
    sniptaleType: 'rich-shape',
  };
}

function createCanvas(objects: MockRichShape[], activeObjects = objects) {
  const element = document.createElement('canvas');
  Object.defineProperty(element, 'width', { configurable: true, value: 200 });
  Object.defineProperty(element, 'height', { configurable: true, value: 100 });
  element.getBoundingClientRect = vi.fn(() => ({
    bottom: 100,
    height: 100,
    left: 0,
    right: 200,
    top: 0,
    width: 200,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  }));

  return {
    getActiveObjects: vi.fn(() => activeObjects),
    getElement: () => element,
    getHeight: () => 100,
    getObjects: vi.fn(() => objects),
    getSelectionElement: () => element,
    getWidth: () => 200,
    off: vi.fn(),
    on: vi.fn(),
    requestRenderAll: vi.fn(),
    setActiveObject: vi.fn(),
    viewportTransform: null,
  } as unknown as Canvas;
}

function createOwner(canvas: Canvas | null) {
  return {
    canvas,
    commitHistory: vi.fn(),
    syncRuntimeState: vi.fn(),
    withHistoryMuted: vi.fn((callback: () => unknown) => callback()) as unknown as <T>(
      callback: () => T
    ) => T,
  };
}

function activeTextarea() {
  const element = document.querySelector('textarea');
  if (!(element instanceof HTMLTextAreaElement)) {
    throw new Error('Expected active textarea');
  }
  return element;
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  richShapeMocks.isRichShapeObject.mockImplementation(
    (object: unknown) => (object as MockRichShape | null)?.sniptaleType === 'rich-shape'
  );
  richShapeMocks.getRichShapeTextCapability.mockImplementation(
    (object: unknown) =>
      richShapeMocks.isRichShapeObject(object) && (object as MockRichShape).supportsText !== false
  );
  richShapeMocks.exportRichShapeDocumentObject.mockImplementation((object: MockRichShape) =>
    structuredClone(object.sniptaleRichShape)
  );
  richShapeMocks.applyRichShapeDocumentObjectToObject.mockImplementation(
    (object: MockRichShape, shape: MockRichShape['sniptaleRichShape']) => {
      object.sniptaleRichShape = structuredClone(shape);
      return true;
    }
  );
});

it('starts editing and commits history once on blur', () => {
  const object = createObject();
  const canvas = createCanvas([object]);
  const owner = createOwner(canvas);

  expect(startRichShapeTextEditor({ canvas, object: object as never, owner })).toBe(true);
  const textarea = activeTextarea();
  textarea.value = 'Edited';
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('blur'));

  expect(object.sniptaleRichShape.text.content).toBe('Edited');
  expect(owner.commitHistory).toHaveBeenCalledOnce();
  expect(owner.syncRuntimeState).toHaveBeenCalledTimes(2);
  expect(document.querySelector('textarea')).toBeNull();
});

it('commits text input when selection changes before blur', () => {
  const object = createObject();
  const nextObject = createObject({ id: 'shape-2' });
  const canvas = createCanvas([object, nextObject]);
  const owner = createOwner(canvas);

  startRichShapeTextEditor({ canvas, object: object as never, owner });
  const textarea = activeTextarea();
  textarea.value = 'Edited before selection switch';
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  vi.mocked(canvas.getActiveObjects).mockReturnValue([nextObject as never]);
  textarea.dispatchEvent(new Event('blur'));

  expect(object.sniptaleRichShape.text.content).toBe('Edited before selection switch');
  expect(owner.commitHistory).toHaveBeenCalledOnce();
  expect(document.querySelector('textarea')).toBeNull();
});

it('commits text input when selection refresh closes the overlay', () => {
  const object = createObject();
  const nextObject = createObject({ id: 'shape-2' });
  const canvas = createCanvas([object, nextObject]);
  const owner = createOwner(canvas);

  startRichShapeTextEditor({ canvas, object: object as never, owner });
  const textarea = activeTextarea();
  textarea.value = 'Edited before refresh';
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  vi.mocked(canvas.getActiveObjects).mockReturnValue([nextObject as never]);

  expect(refreshRichShapeTextEditor(owner)).toBe(false);
  expect(object.sniptaleRichShape.text.content).toBe('Edited before refresh');
  expect(owner.commitHistory).toHaveBeenCalledOnce();
  expect(document.querySelector('textarea')).toBeNull();
});

it('commits with Escape and closes the overlay', () => {
  const object = createObject();
  const canvas = createCanvas([object]);
  const owner = createOwner(canvas);
  startRichShapeTextEditor({ canvas, object: object as never, owner });

  const textarea = activeTextarea();
  textarea.value = 'Draft';
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));

  expect(object.sniptaleRichShape.text.content).toBe('Draft');
  expect(owner.commitHistory).toHaveBeenCalledOnce();
  expect(document.querySelector('textarea')).toBeNull();
});

it('does not commit stale overlays for deleted objects', () => {
  const object = createObject();
  const owner = createOwner(createCanvas([object]));
  startRichShapeTextEditor({ canvas: owner.canvas!, object: object as never, owner });
  owner.canvas = createCanvas([], []);

  activeTextarea().value = 'Deleted object text';
  expect(commitRichShapeTextEditor(owner)).toBe(false);
  expect(owner.commitHistory).not.toHaveBeenCalled();

  expect(object.sniptaleRichShape.text.content).toBe('Original');
  expect(owner.commitHistory).not.toHaveBeenCalled();
});

it('closes already closing sessions without applying duplicate commits', () => {
  const object = createObject();
  const canvas = createCanvas([object]);
  const owner = createOwner(canvas);
  startRichShapeTextEditor({ canvas, object: object as never, owner });

  const textarea = activeTextarea();
  textarea.value = 'Duplicate close';
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));

  expect(commitRichShapeTextEditor(owner)).toBe(false);
  expect(owner.commitHistory).toHaveBeenCalledOnce();
});

it('restores original text on explicit cancel without committing history', () => {
  const object = createObject();
  const canvas = createCanvas([object]);
  const owner = createOwner(canvas);
  startRichShapeTextEditor({ canvas, object: object as never, owner });

  const textarea = activeTextarea();
  textarea.value = 'Draft to discard';
  textarea.dispatchEvent(new Event('input', { bubbles: true }));

  expect(cancelRichShapeTextEditor(owner)).toBe(true);
  expect(object.sniptaleRichShape.text.content).toBe('Original');
  expect(owner.commitHistory).not.toHaveBeenCalled();
  expect(document.querySelector('textarea')).toBeNull();
});

it('refreshes active overlay styling when inspector text controls update the rich shape', () => {
  const object = createObject();
  const canvas = createCanvas([object]);
  const owner = createOwner(canvas);
  startRichShapeTextEditor({ canvas, object: object as never, owner });

  object.sniptaleRichShape = {
    ...object.sniptaleRichShape,
    text: { ...object.sniptaleRichShape.text, color: '#ff0000', fontSize: 24 },
  };

  expect(refreshRichShapeTextEditor(owner)).toBe(true);
  expect(activeTextarea().style.color).toBe('rgb(255, 0, 0)');
  expect(activeTextarea().style.fontSize).toBe('24px');
});

it('refreshes active overlay styling through the canvas-only public facade', () => {
  const object = createObject();
  const canvas = createCanvas([object]);
  const owner = createOwner(canvas);
  startRichShapeTextEditor({ canvas, object: object as never, owner });

  object.sniptaleRichShape = {
    ...object.sniptaleRichShape,
    text: { ...object.sniptaleRichShape.text, color: '#00aa44', fontSize: 22 },
  };

  expect(refreshRichShapeTextEditorForCanvas(canvas)).toBe(true);
  expect(activeTextarea().style.color).toBe('rgb(0, 170, 68)');
  expect(activeTextarea().style.fontSize).toBe('22px');
});

it('rejects unsupported rich shapes and allows explicit cancel cleanup', () => {
  const object = createObject();
  object.supportsText = false;
  const canvas = createCanvas([object]);
  const owner = createOwner(canvas);

  expect(startRichShapeTextEditor({ canvas, object: object as never, owner })).toBe(false);
  expect(cancelRichShapeTextEditor(owner)).toBe(false);
  expect(document.querySelector('textarea')).toBeNull();
});
