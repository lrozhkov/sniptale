// @vitest-environment jsdom

import { Canvas, Rect } from 'fabric';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_TOOL_SETTINGS } from '../../../features/editor/document/constants';
import { DEFAULT_BORDER_PRESET } from '../../../features/highlighter/style/public';

const mocks = vi.hoisted(() => ({
  readEditorDrawingObject: vi.fn(),
  replaceEditorDrawingFabricGeometry: vi.fn(),
}));

vi.mock('../../drawing/object/metadata', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../drawing/object/metadata')>()),
  readEditorDrawingObject: mocks.readEditorDrawingObject,
}));
vi.mock('../../drawing/object/vector', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../drawing/object/vector')>()),
  replaceEditorDrawingFabricGeometry: mocks.replaceEditorDrawingFabricGeometry,
}));

import { applySelectionToolSettingsToObjects } from './apply/dispatch';

const settings = {
  ...DEFAULT_EDITOR_TOOL_SETTINGS(DEFAULT_BORDER_PRESET),
  arrow: { color: '#aa0000', design: 'standard' as const, dynamicWidth: true, width: 7 },
  marker: { color: '#00aa00', opacity: 0.5, width: 18 },
  pencil: { color: '#0000aa', width: 5 },
  shape: {
    color: '#333333',
    fillColor: '#eeeeee',
    kind: 'ellipse' as const,
    width: 4,
  },
  text: {
    backgroundColor: null,
    color: '#111111',
    fontFamily: 'handwritten' as const,
    fontSize: 24,
  },
};

function createCanvasWithObject(object: Rect) {
  const surface = new Canvas(document.createElement('canvas'));
  surface.add(object);
  Object.defineProperties(surface, {
    discardActiveObject: { configurable: true, value: vi.fn(() => surface) },
    insertAt: { configurable: true, value: vi.fn() },
    remove: { configurable: true, value: vi.fn() },
    setActiveObject: { configurable: true, value: vi.fn(() => true) },
  });
  return surface;
}

describe('drawing selection settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.replaceEditorDrawingFabricGeometry.mockImplementation(() => new Rect());
  });

  it.each([
    ['pencil', { color: '#old', id: 'p', kind: 'pencil', points: [], width: 1 }],
    ['marker', { color: '#old', id: 'm', kind: 'marker', opacity: 1, points: [], width: 10 }],
    [
      'arrow',
      {
        color: '#old',
        dynamicWidth: false,
        end: { x: 10, y: 10 },
        id: 'a',
        kind: 'arrow',
        start: { x: 0, y: 0 },
        width: 2,
      },
    ],
    [
      'text',
      {
        backgroundColor: '#fff',
        bounds: { height: 40, width: 100, x: 0, y: 0 },
        color: '#old',
        fontSize: 12,
        id: 't',
        kind: 'text',
        text: 'Text',
      },
    ],
  ] as const)('replaces a selected %s object with current shared settings', (type, drawing) => {
    const object = new Rect();
    const surface = createCanvasWithObject(object);
    const prepareObject = vi.fn();
    mocks.readEditorDrawingObject.mockReturnValueOnce(drawing);

    applySelectionToolSettingsToObjects(surface, [object], type, settings, prepareObject);

    expect(mocks.replaceEditorDrawingFabricGeometry).toHaveBeenCalledWith(
      object,
      expect.objectContaining(settings[type])
    );
    expect(surface.remove).toHaveBeenCalledWith(object);
    expect(surface.insertAt).toHaveBeenCalledWith(0, expect.any(Rect));
    expect(prepareObject).toHaveBeenCalledOnce();
  });

  it('applies shared shape style while retaining an existing parallelogram kind', () => {
    const object = new Rect();
    const surface = createCanvasWithObject(object);
    mocks.readEditorDrawingObject.mockReturnValueOnce({
      bounds: { height: 20, width: 40, x: 0, y: 0 },
      color: '#old',
      fillColor: null,
      id: 'shape',
      kind: 'parallelogram',
      skewX: 20,
      width: 2,
    });

    applySelectionToolSettingsToObjects(surface, [object], 'shape', {
      ...settings,
      shape: { ...settings.shape, kind: 'rectangle' },
    });

    expect(mocks.replaceEditorDrawingFabricGeometry).toHaveBeenCalledWith(
      object,
      expect.objectContaining({ kind: 'parallelogram', color: '#333333', width: 4 })
    );
  });

  it('leaves blur and objects without shared drawing metadata untouched', () => {
    const object = new Rect();
    const surface = createCanvasWithObject(object);
    mocks.readEditorDrawingObject.mockReturnValueOnce({ kind: 'blur' }).mockReturnValueOnce(null);

    applySelectionToolSettingsToObjects(surface, [object], 'blur', settings);
    applySelectionToolSettingsToObjects(surface, [object], 'pencil', settings);

    expect(surface.remove).not.toHaveBeenCalled();
    expect(mocks.replaceEditorDrawingFabricGeometry).not.toHaveBeenCalled();
  });

  it('preserves selected layer indices and interleaving during a mass update', () => {
    const first = new Rect();
    const between = new Rect();
    const second = new Rect();
    const after = new Rect();
    const surface = new Canvas(document.createElement('canvas'));
    surface.add(first, between, second, after);
    const firstReplacement = new Rect();
    const secondReplacement = new Rect();
    mocks.replaceEditorDrawingFabricGeometry
      .mockReturnValueOnce(firstReplacement)
      .mockReturnValueOnce(secondReplacement);
    mocks.readEditorDrawingObject.mockReturnValue({
      bounds: { height: 20, width: 40, x: 0, y: 0 },
      color: '#old',
      fillColor: null,
      id: 'shape',
      kind: 'rectangle',
      width: 2,
    });
    const insertAt = vi.spyOn(surface, 'insertAt');

    applySelectionToolSettingsToObjects(surface, [second, first], 'shape', settings);

    expect(insertAt).toHaveBeenNthCalledWith(1, 0, firstReplacement);
    expect(insertAt).toHaveBeenNthCalledWith(2, 2, secondReplacement);
    expect(surface.getObjects()).toEqual([firstReplacement, between, secondReplacement, after]);
  });
});
