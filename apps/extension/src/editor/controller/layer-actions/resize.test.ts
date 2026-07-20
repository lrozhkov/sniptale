import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBlurObject } from '../../objects/annotation/blur/object';

const mocks = vi.hoisted(() => ({
  findObjectByIdMock: vi.fn(),
  isEditableObjectMock: vi.fn(() => true),
  isTextboxMock: vi.fn(() => false),
}));

vi.mock('../document/layers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../document/layers')>()),
  findObjectById: mocks.findObjectByIdMock,
}));

vi.mock('../../document/model', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../document/model')>();
  return {
    ...actual,
    isEditableObject: mocks.isEditableObjectMock,
    isUserObject: vi.fn(() => true),
  };
});

vi.mock('../core/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../core/helpers')>()),
  isTextbox: mocks.isTextboxMock,
}));

import { resizeLayerObject } from './';

function createCanvas(target: object) {
  return {
    getObjects: vi.fn(() => [target]),
    requestRenderAll: vi.fn(),
  };
}

function createBlurSource(overrides: Record<string, unknown> = {}) {
  return {
    dataUrl: 'data:image/png;base64,asset',
    displayHeight: 180,
    displayWidth: 320,
    id: 'source-1',
    intrinsicHeight: 180,
    intrinsicWidth: 320,
    left: 0,
    locked: true,
    name: null,
    top: 0,
    visible: true,
    ...overrides,
  };
}

function createObject(id: string, overrides: Record<string, unknown> = {}) {
  return {
    getScaledHeight: () => 50,
    getScaledWidth: () => 100,
    sniptaleId: id,
    scaleX: 1,
    scaleY: 1,
    strokeUniform: undefined as boolean | undefined,
    set: vi.fn(function apply(this: Record<string, unknown>, payload: Record<string, unknown>) {
      Object.assign(this, payload);
    }),
    setCoords: vi.fn(),
    ...overrides,
  };
}

function expectUniformResize(
  id: string,
  overrides: Record<string, unknown>,
  ensureObjectReachable: ReturnType<typeof vi.fn>
) {
  const object = createObject(id, overrides);
  mocks.findObjectByIdMock.mockReturnValueOnce(object);
  expect(
    resizeLayerObject(createCanvas(object) as never, id, 180, 60, ensureObjectReachable as never)
  ).toBe(object);
  return object;
}

function registerPencilResizeTest() {
  it('keeps pencil strokes uniform when resizing through layer actions', () => {
    const ensureObjectReachable = vi.fn(() => true);
    const pencil = expectUniformResize(
      'pencil-1',
      { sniptaleType: 'pencil' },
      ensureObjectReachable
    );
    expect(pencil.strokeUniform).toBe(true);
  });
}

function registerHighlighterResizeTest() {
  it('keeps highlighter strokes uniform when resizing through layer actions', () => {
    const ensureObjectReachable = vi.fn(() => true);
    const highlighter = expectUniformResize(
      'highlighter-1',
      { sniptaleType: 'highlighter' },
      ensureObjectReachable
    );
    expect(highlighter.strokeUniform).toBe(true);
  });
}

function registerStepResizeTest() {
  it('keeps step circle strokes uniform when resizing through layer actions', () => {
    const ensureObjectReachable = vi.fn(() => true);
    const stepCircle = {
      set: vi.fn(function apply(
        this: { strokeUniform?: boolean },
        payload: Record<string, unknown>
      ) {
        Object.assign(this, payload);
      }),
      strokeUniform: undefined,
    };
    const step = expectUniformResize(
      'step-1',
      {
        getObjects: () => [stepCircle, { set: vi.fn() }],
        sniptaleType: 'step',
      },
      ensureObjectReachable
    );
    expect(step).toBeTruthy();
    expect(stepCircle.strokeUniform).toBe(true);
  });
}

function registerRectangleResizeTest() {
  it('normalizes rectangle geometry after layer resize without overwriting the radius intent', () => {
    const ensureObjectReachable = vi.fn(() => true);
    const rectangle = createObject('rectangle-1', {
      getCenterPoint: () => ({ x: 60, y: 35 }),
      getScaledHeight: () => 20,
      getScaledWidth: () => 100,
      height: 20,
      left: 10,
      sniptaleRole: 'annotation',
      sniptaleShapeRadius: 40,
      sniptaleType: 'rectangle',
      rx: 10,
      ry: 10,
      strokeWidth: 2,
      top: 25,
      width: 100,
    }) as Record<string, unknown>;

    mocks.findObjectByIdMock.mockReturnValueOnce(rectangle);

    expect(
      resizeLayerObject(
        createCanvas(rectangle) as never,
        'rectangle-1',
        200,
        10,
        ensureObjectReachable
      )
    ).toBe(rectangle);
    expect(rectangle['scaleX']).toBe(1);
    expect(rectangle['scaleY']).toBe(1);
    expect(rectangle['width']).toBe(200);
    expect(rectangle['height']).toBe(10);
    expect(rectangle['rx']).toBe(5);
    expect(rectangle['ry']).toBe(5);
    expect(rectangle['sniptaleShapeRadius']).toBe(40);
  });
}

function registerBlurResizeTest() {
  it('normalizes blur geometry after layer resize instead of leaving scale-only bounds', () => {
    const ensureObjectReachable = vi.fn(() => true);
    const blur = createBlurObject({
      height: 20,
      id: 'blur-1',
      labelIndex: 1,
      left: 10,
      settings: {
        amount: 8,
        blurType: 'gaussian',
        showBorder: false,
      },
      source: createBlurSource(),
      top: 12,
      width: 40,
    });

    mocks.findObjectByIdMock.mockReturnValueOnce(blur);

    expect(
      resizeLayerObject(createCanvas(blur) as never, 'blur-1', 180, 60, ensureObjectReachable)
    ).toBe(blur);
    expect(blur.scaleX).toBe(1);
    expect(blur.scaleY).toBe(1);
    expect(blur.width).toBe(180);
    expect(blur.height).toBe(60);
  });
}

function runLayerActionsResizeSuite() {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  registerPencilResizeTest();
  registerHighlighterResizeTest();
  registerStepResizeTest();
  registerRectangleResizeTest();
  registerBlurResizeTest();
}

describe('layer-actions resize annotation integration', runLayerActionsResizeSuite);
