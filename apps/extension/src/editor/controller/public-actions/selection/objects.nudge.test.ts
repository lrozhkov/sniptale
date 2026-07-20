import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isEditableObjectMock: vi.fn(() => true),
  isSourceObjectMock: vi.fn((_object?: unknown) => false),
  syncSourceStateFromObjectMock: vi.fn((source, object) =>
    object?.id === 'source'
      ? {
          ...(source ?? {}),
          syncedId: object.id,
        }
      : source
  ),
}));

vi.mock('../../../document/model', async () => ({
  ...(await vi.importActual<typeof import('../../../document/model')>('../../../document/model')),
  isEditableObject: mocks.isEditableObjectMock,
  isSourceObject: mocks.isSourceObjectMock,
}));

vi.mock('../../document/source', async () => ({
  ...(await vi.importActual<typeof import('../../document/source')>('../../document/source')),
  syncSourceStateFromObject: mocks.syncSourceStateFromObjectMock,
}));

import { nudgeEditorSelection } from './objects';

function createCanvas(activeObjects: any[]) {
  return {
    getActiveObject: vi.fn(() => ({ setCoords: vi.fn() })),
    getActiveObjects: vi.fn(() => activeObjects),
    requestRenderAll: vi.fn(),
  } as any;
}

function registerNudgeMoveGeometryTest() {
  it('nudges selected objects and syncs source state through the final geometry', () => {
    const source = { id: 'source', left: 12, set: vi.fn(), setCoords: vi.fn(), top: 8 };
    const rectangle = { id: 'rect', left: 20, set: vi.fn(), setCoords: vi.fn(), top: 30 };
    const canvas = createCanvas([source, rectangle]);
    const ensureObjectReachable = vi.fn();
    const setSource = vi.fn();
    const syncRuntimeState = vi.fn();
    mocks.isSourceObjectMock.mockImplementation((object?: unknown) => object === source);

    const moved = nudgeEditorSelection({
      canvas,
      deltaX: 5,
      deltaY: -1,
      ensureObjectReachable,
      setSource,
      source: { id: 'source-state' } as any,
      syncRuntimeState,
    });

    expect(moved).toBe(true);
    expect(source.set).toHaveBeenCalledWith({ left: 17, top: 7 });
    expect(rectangle.set).toHaveBeenCalledWith({ left: 25, top: 29 });
    expect(ensureObjectReachable).toHaveBeenCalledWith(source);
    expect(ensureObjectReachable).toHaveBeenCalledWith(rectangle);
    expect(setSource).toHaveBeenCalledWith({ id: 'source-state', syncedId: 'source' });
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(syncRuntimeState).toHaveBeenCalledOnce();
  });
}

function registerLockedNudgeGeometryTest() {
  it('does not nudge locked selections', () => {
    const locked = { id: 'locked', left: 20, sniptaleLocked: true, set: vi.fn(), top: 30 };
    const canvas = createCanvas([locked]);
    const setSource = vi.fn();
    const syncRuntimeState = vi.fn();

    const moved = nudgeEditorSelection({
      canvas,
      deltaX: 5,
      deltaY: -1,
      ensureObjectReachable: vi.fn(),
      setSource,
      source: null,
      syncRuntimeState,
    });

    expect(moved).toBe(false);
    expect(locked.set).not.toHaveBeenCalled();
    expect(setSource).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    expect(syncRuntimeState).not.toHaveBeenCalled();
  });
}

function registerNudgeGuardTest() {
  it('keeps selection nudge inert when the canvas is missing or empty', () => {
    expect(
      nudgeEditorSelection({
        canvas: null,
        deltaX: 1,
        deltaY: 0,
        ensureObjectReachable: vi.fn(),
        setSource: vi.fn(),
        source: null,
        syncRuntimeState: vi.fn(),
      })
    ).toBe(false);

    expect(
      nudgeEditorSelection({
        canvas: createCanvas([]),
        deltaX: 1,
        deltaY: 0,
        ensureObjectReachable: vi.fn(),
        setSource: vi.fn(),
        source: null,
        syncRuntimeState: vi.fn(),
      })
    ).toBe(false);
  });
}

describe('selection object public action nudge', () => {
  registerNudgeMoveGeometryTest();
  registerLockedNudgeGeometryTest();
  registerNudgeGuardTest();
});
