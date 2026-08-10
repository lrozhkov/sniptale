import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readEditorDrawingObject: vi.fn(),
  syncRichShapeSelectionSettings: vi.fn(),
  syncStepSelectionSettings: vi.fn(),
  updateSelectionDrawingToolSettings: vi.fn(),
}));

vi.mock('../../drawing/object/metadata', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../drawing/object/metadata')>()),
  readEditorDrawingObject: mocks.readEditorDrawingObject,
}));
vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: () => ({
      updateSelectionDrawingToolSettings: mocks.updateSelectionDrawingToolSettings,
    }),
  },
}));
vi.mock('./rich-shape-sync', () => ({
  syncRichShapeSelectionSettings: mocks.syncRichShapeSelectionSettings,
}));
vi.mock('./sync-step', () => ({
  syncStepSelectionSettings: mocks.syncStepSelectionSettings,
}));

import { syncSelectionToolSettingsFromObject } from './sync/dispatch';

describe('editor-controller selection sync drawing dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    [
      'pencil',
      { color: '#111111', kind: 'pencil', points: [], width: 4 },
      { color: '#111111', width: 4 },
    ],
    [
      'marker',
      { color: '#222222', kind: 'marker', opacity: 0.4, points: [], width: 16 },
      { color: '#222222', opacity: 0.4, width: 16 },
    ],
    [
      'arrow',
      {
        color: '#333333',
        dynamicWidth: true,
        end: { x: 20, y: 20 },
        kind: 'arrow',
        start: { x: 0, y: 0 },
        width: 6,
      },
      { color: '#333333', design: 'standard', dynamicWidth: true, width: 6 },
    ],
    [
      'text',
      {
        backgroundColor: null,
        color: '#444444',
        fontSize: 24,
        height: 30,
        kind: 'text',
        text: 'Text',
        width: 100,
        x: 0,
        y: 0,
      },
      {
        backgroundColor: null,
        color: '#444444',
        fontFamily: 'handwritten',
        fontSize: 24,
      },
    ],
    [
      'shape',
      {
        color: '#555555',
        fillColor: null,
        height: 20,
        kind: 'rectangle',
        width: 3,
        x: 0,
        y: 0,
      },
      { color: '#555555', fillColor: null, kind: 'rectangle', width: 3 },
    ],
  ] as const)('syncs %s drawing settings', (type, drawing, expected) => {
    mocks.readEditorDrawingObject.mockReturnValueOnce(drawing);

    syncSelectionToolSettingsFromObject({} as never, type);

    expect(mocks.updateSelectionDrawingToolSettings).toHaveBeenCalledWith(type, expected);
  });

  it('ignores blur and objects without shared drawing metadata', () => {
    mocks.readEditorDrawingObject.mockReturnValueOnce({ kind: 'blur' }).mockReturnValueOnce(null);

    syncSelectionToolSettingsFromObject({} as never, 'blur');
    syncSelectionToolSettingsFromObject({} as never, 'pencil');

    expect(mocks.updateSelectionDrawingToolSettings).not.toHaveBeenCalled();
  });

  it('keeps retained step and rich-shape owners', () => {
    const step = { id: 'step' };
    const richShape = { id: 'rich-shape' };

    syncSelectionToolSettingsFromObject(step as never, 'step');
    syncSelectionToolSettingsFromObject(richShape as never, 'rich-shape');

    expect(mocks.syncStepSelectionSettings).toHaveBeenCalledWith(step);
    expect(mocks.syncRichShapeSelectionSettings).toHaveBeenCalledWith(richShape);
  });
});
