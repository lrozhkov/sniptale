/* eslint-disable max-lines-per-function */
import { describe, expect, it, vi } from 'vitest';

const fabricMock = vi.hoisted(() => {
  class Point {
    constructor(
      public x: number,
      public y: number
    ) {}
    transform() {
      return this;
    }
  }

  class Path {
    sniptaleType?: string;
    pathOffset = { x: 0, y: 0 };
    stroke: string | null = '#123456';
    strokeWidth = 4;
    constructor(public path: any[]) {}
    calcTransformMatrix() {
      return {};
    }
  }

  class Line {
    stroke: string | null = '#654321';
    strokeWidth = 3;
    constructor(private points: { x1: number; x2: number; y1: number; y2: number }) {}
    calcLinePoints() {
      return this.points;
    }
    calcTransformMatrix() {
      return {};
    }
  }

  class Group {
    sniptaleArrowMode?: string;
    sniptaleId?: string;
    sniptaleType?: string;
    visible = true;
    constructor(private objects: any[]) {}
    getObjects() {
      return this.objects;
    }
  }

  class Canvas {
    private objects: any[];
    add = vi.fn((object: any) => {
      this.objects.push(object);
    });
    moveObjectTo = vi.fn();
    remove = vi.fn((object: any) => {
      this.objects = this.objects.filter((item: any) => item !== object);
    });
    requestRenderAll = vi.fn();
    setActiveObject = vi.fn();
    constructor(objects: any[]) {
      this.objects = objects;
    }
    getObjects() {
      return this.objects;
    }
    getActiveObject() {
      return this.objects[0];
    }
    getActiveObjects() {
      return this.objects;
    }
    getScenePoint() {
      return { x: 10, y: 15 };
    }
  }

  return { Canvas, Group, Line, Path, Point };
});

vi.mock('fabric', () => fabricMock);

const mocks = vi.hoisted(() => ({
  createArrowObjectMock: vi.fn((options: Record<string, unknown>) => ({
    ...options,
    visible: true,
  })),
  isArrowObjectMock: vi.fn(() => false),
  isGroupMock: vi.fn((value) => value instanceof fabricMock.Group),
  isInteractiveShortcutTargetMock: vi.fn(() => false),
  isSpaceKeyMock: vi.fn((code: string) => code === 'Space'),
  isTextboxMock: vi.fn(() => false),
  parseColorForStoreMock: vi.fn((value: string | null | undefined) => value ?? '#123456'),
  resolveKeyboardActionMock: vi.fn(() => 'ignore'),
  storeGetStateMock: vi.fn(() => ({
    toolSettings: {
      arrow: {
        color: '#123456',
        endHead: 'triangle',
        mode: 'straight',
        startHead: 'none',
        width: 4,
      },
    },
  })),
  updateArrowOnDoubleClickMock: vi.fn(),
}));

vi.mock('../core/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../core/helpers')>()),
  isGroup: mocks.isGroupMock,
  isInteractiveShortcutTarget: mocks.isInteractiveShortcutTargetMock,
  isTextbox: mocks.isTextboxMock,
  parseColorForStore: mocks.parseColorForStoreMock,
}));
vi.mock('./interactions', () => ({
  configureEditorFreehandPath: vi.fn(),
  updateEditorArrowOnDoubleClick: mocks.updateArrowOnDoubleClickMock,
}));
vi.mock('./keyboard', () => ({
  isEditorSpaceKey: mocks.isSpaceKeyMock,
  resolveEditorKeyboardAction: mocks.resolveKeyboardActionMock,
}));
vi.mock('../../objects/arrow', () => ({
  createArrowObject: mocks.createArrowObjectMock,
  getArrowGeometry: vi.fn(),
  getArrowInteractionAppearance: vi.fn(),
  getArrowSettings: vi.fn(),
  insertArrowPoint: vi.fn(),
  isArrowObject: mocks.isArrowObjectMock,
  normalizeScaledArrowObject: vi.fn(),
  removeArrowPoint: vi.fn(),
  setArrowEditMode: vi.fn(),
  updateArrowObject: vi.fn(),
  updateArrowPointOnDoubleClick: vi.fn(),
}));
vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: mocks.storeGetStateMock,
  },
}));
import { handleEditorDoubleClick, handleEditorWindowBlur } from './';
import { handleEditorWindowKeyDown, handleEditorWindowKeyUp } from './';
import { upgradeLegacyArrowObjects } from '../core/legacy';

describe('editor controller input and legacy seams', () => {
  it('enters text editing on textbox double-click', () => {
    const textbox = { enterEditing: vi.fn(), selectAll: vi.fn() };
    mocks.isTextboxMock.mockReturnValueOnce(true);

    handleEditorDoubleClick({
      activeTool: 'select',
      canvas: null,
      commitHistory: vi.fn(),
      event: {} as never,
      syncRuntimeState: vi.fn(),
      target: textbox as never,
    });

    expect(textbox.enterEditing).toHaveBeenCalledOnce();
    expect(textbox.selectAll).toHaveBeenCalledOnce();
  });

  it('updates arrows on double-click and resolves keyboard actions', () => {
    const arrow = { id: 'arrow' };
    const canvas = new fabricMock.Canvas([arrow]);
    const commitHistory = vi.fn();
    const syncRuntimeState = vi.fn();
    mocks.isArrowObjectMock.mockReturnValue(true);

    handleEditorDoubleClick({
      activeTool: 'select',
      canvas: canvas as never,
      commitHistory,
      event: {} as never,
      syncRuntimeState,
      target: arrow as never,
    });

    expect(mocks.updateArrowOnDoubleClickMock).toHaveBeenCalled();
    expect(canvas.setActiveObject).toHaveBeenCalledWith(arrow);
    expect(commitHistory).toHaveBeenCalledOnce();
    expect(syncRuntimeState).toHaveBeenCalledOnce();

    const textbox = { exitEditing: vi.fn(), isEditing: true };
    mocks.isTextboxMock.mockReturnValueOnce(true);
    const actionCanvas = {
      getActiveObject: () => textbox,
      getActiveObjects: () => [textbox],
      requestRenderAll: vi.fn(),
    };
    const options = {
      altKey: false,
      applyCropSelection: vi.fn(),
      cancelTransientInteraction: vi.fn(() => true),
      canvas: actionCanvas as never,
      code: 'KeyZ',
      ctrlKey: true,
      deleteSelection: vi.fn(),
      duplicateSelection: vi.fn(),
      hasCropGuide: true,
      key: 'z',
      metaKey: false,
      nudgeSelection: vi.fn(() => true),
      redo: vi.fn(),
      shiftKey: false,
      target: null,
      undo: vi.fn(),
    };
    mocks.resolveKeyboardActionMock
      .mockReturnValueOnce('undo')
      .mockReturnValueOnce('redo')
      .mockReturnValueOnce('duplicate-selection')
      .mockReturnValueOnce('exit-text-edit')
      .mockReturnValueOnce('cancel-transient')
      .mockReturnValueOnce('delete-selection')
      .mockReturnValueOnce('apply-crop')
      .mockReturnValueOnce({ code: 'ArrowRight', deltaX: 1, deltaY: 0, step: 1 } as never)
      .mockReturnValueOnce('ignore');

    handleEditorWindowKeyDown(options as never);
    handleEditorWindowKeyDown(options as never);
    handleEditorWindowKeyDown(options as never);
    handleEditorWindowKeyDown(options as never);
    handleEditorWindowKeyDown(options as never);
    handleEditorWindowKeyDown(options as never);
    handleEditorWindowKeyDown(options as never);
    expect(handleEditorWindowKeyDown(options as never)).toEqual({ preventDefault: true });
    expect(options.nudgeSelection).toHaveBeenCalledWith({
      code: 'ArrowRight',
      deltaX: 1,
      deltaY: 0,
      step: 1,
    });
    expect(handleEditorWindowKeyDown(options as never)).toEqual({ preventDefault: false });
    expect(
      handleEditorWindowKeyUp({
        code: 'Space',
        finalizeSelectionNudge: vi.fn(),
      })
    ).toEqual({ nextSpacePressed: false });
    handleEditorWindowBlur({ finalizeSelectionNudge: vi.fn() });
  });

  it('upgrades legacy arrow groups into the current arrow format', () => {
    expect(upgradeLegacyArrowObjects(null)).toBeUndefined();

    const lineGroup = new fabricMock.Group([new fabricMock.Line({ x1: 0, x2: 10, y1: 0, y2: 12 })]);
    lineGroup.sniptaleType = 'arrow';
    lineGroup.sniptaleId = 'line-arrow';

    const curvePath = new fabricMock.Path([
      ['M', 0, 0],
      ['Q', 8, 4, 16, 12],
    ]);
    curvePath.sniptaleType = 'arrow';
    const pathGroup = new fabricMock.Group([curvePath]);
    pathGroup.sniptaleType = 'arrow';
    pathGroup.sniptaleArrowMode = 'curve';
    const canvas = new fabricMock.Canvas([lineGroup, pathGroup]);

    upgradeLegacyArrowObjects(canvas as never);

    expect(mocks.createArrowObjectMock).toHaveBeenCalledTimes(2);
    expect(canvas.remove).toHaveBeenCalledTimes(2);
    expect(canvas.add).toHaveBeenCalledTimes(2);
    expect(canvas.moveObjectTo).toHaveBeenCalledTimes(2);
  });

  it('skips legacy arrow groups without supported primitives or valid geometry', () => {
    vi.clearAllMocks();

    const emptyGroup = new fabricMock.Group([]);
    emptyGroup.sniptaleType = 'arrow';

    const invalidCurve = new fabricMock.Path([
      ['M', 0, 0],
      ['Q', 'x', 4, 16, 12],
    ]);
    invalidCurve.sniptaleType = 'arrow';
    const invalidCurveGroup = new fabricMock.Group([invalidCurve]);
    invalidCurveGroup.sniptaleType = 'arrow';
    invalidCurveGroup.sniptaleArrowMode = 'curve';

    const ignoredGroup = new fabricMock.Group([
      new fabricMock.Line({ x1: 0, x2: 4, y1: 0, y2: 4 }),
    ]);
    ignoredGroup.sniptaleType = 'note';

    const canvas = new fabricMock.Canvas([emptyGroup, invalidCurveGroup, ignoredGroup]);

    upgradeLegacyArrowObjects(canvas as never);

    expect(mocks.createArrowObjectMock).not.toHaveBeenCalled();
    expect(canvas.remove).not.toHaveBeenCalled();
    expect(canvas.add).not.toHaveBeenCalled();
  });
});
