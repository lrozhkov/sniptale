import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findObjectByIdMock: vi.fn(),
  isEditableObjectMock: vi.fn(() => true),
  isTextboxMock: vi.fn(() => false),
  normalizeScaledAnnotationTargetMock: vi.fn(() => false),
  normalizeScaledRectangleTargetMock: vi.fn(() => false),
  resizeTextCalloutMock: vi.fn(),
}));

vi.mock('../../document/layers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../document/layers')>()),
  findObjectById: mocks.findObjectByIdMock,
}));

vi.mock('../../../document/model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../document/model')>()),
  isEditableObject: mocks.isEditableObjectMock,
}));

vi.mock('../../core/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../core/helpers')>()),
  isTextbox: mocks.isTextboxMock,
}));

vi.mock('../../../objects/shape-style', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../objects/shape-style')>()),
  normalizeScaledRectangleTarget: mocks.normalizeScaledRectangleTargetMock,
}));

vi.mock('../../tools/annotation-resize', () => ({
  normalizeScaledAnnotationTarget: mocks.normalizeScaledAnnotationTargetMock,
}));

vi.mock('../../../objects/annotation/text/callout/resize', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../objects/annotation/text/callout/resize')>()),
  resizeTextCallout: mocks.resizeTextCalloutMock,
}));

import { resizeLayerObject } from './resize';

function createObject(overrides: Record<string, unknown> = {}) {
  return {
    getScaledHeight: vi.fn(() => 40),
    getScaledWidth: vi.fn(() => 80),
    sniptaleId: 'layer-1',
    sniptaleLocked: false,
    sniptaleType: 'rectangle',
    scaleX: 1,
    scaleY: 1,
    set: vi.fn(function set(this: Record<string, unknown>, patch: Record<string, unknown>) {
      Object.assign(this, patch);
    }),
    setCoords: vi.fn(),
    ...overrides,
  };
}

function registerTextResizeTest() {
  it('routes text callout resize through the text owner', () => {
    const object = createObject({ sniptaleType: 'text' });
    const canvas = { requestRenderAll: vi.fn() };
    const ensureObjectReachable = vi.fn(() => true);
    mocks.findObjectByIdMock.mockReturnValue(object);
    mocks.isTextboxMock.mockReturnValue(true);

    expect(resizeLayerObject(canvas as never, 'layer-1', 121.7, 37.2, ensureObjectReachable)).toBe(
      object
    );

    expect(mocks.resizeTextCalloutMock).toHaveBeenCalledWith(object, 122, 37);
    expect(ensureObjectReachable).toHaveBeenCalledWith(object);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });
}

function registerScaledResizeTest() {
  it('normalizes scaled objects after proportional resize', () => {
    const object = createObject();
    const canvas = { requestRenderAll: vi.fn() };
    mocks.findObjectByIdMock.mockReturnValue(object);

    expect(
      resizeLayerObject(
        canvas as never,
        'layer-1',
        160,
        20,
        vi.fn(() => true)
      )
    ).toBe(object);

    expect(object.set).toHaveBeenCalledWith({ scaleX: 2, scaleY: 0.5 });
    expect(mocks.normalizeScaledRectangleTargetMock).toHaveBeenCalledWith(object);
    expect(mocks.normalizeScaledAnnotationTargetMock).toHaveBeenCalledWith(object);
    expect(object.setCoords).toHaveBeenCalledOnce();
  });
}

function registerRejectedResizeTargetTest() {
  it('rejects locked or zero-sized targets', () => {
    mocks.findObjectByIdMock.mockReturnValue(createObject({ sniptaleLocked: true }));
    expect(resizeLayerObject({} as never, 'locked', 10, 10, vi.fn())).toBeNull();

    mocks.findObjectByIdMock.mockReturnValue(
      createObject({ getScaledHeight: vi.fn(() => 0), getScaledWidth: vi.fn(() => 80) })
    );
    expect(resizeLayerObject({} as never, 'empty', 10, 10, vi.fn())).toBeNull();
  });
}

function runResizeStateSuite() {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isEditableObjectMock.mockReturnValue(true);
    mocks.isTextboxMock.mockReturnValue(false);
    mocks.normalizeScaledAnnotationTargetMock.mockReturnValue(false);
    mocks.normalizeScaledRectangleTargetMock.mockReturnValue(false);
  });

  registerTextResizeTest();
  registerScaledResizeTest();
  registerRejectedResizeTargetTest();
}

describe('layer action resize state owner', runResizeStateSuite);
