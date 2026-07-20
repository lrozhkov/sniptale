import { Point, Rect } from 'fabric';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getArrowGeometryMock: vi.fn(() => ({ end: { x: 20, y: 0 }, start: { x: 0, y: 0 } })),
  isArrowObjectMock: vi.fn(() => false),
  isBlurObjectMock: vi.fn(() => false),
  resizeTextCalloutMock: vi.fn(),
  updateArrowObjectMock: vi.fn(),
  updateBlurObjectMock: vi.fn(),
}));

vi.mock('../../objects/annotation/blur/object/identity', () => ({
  isBlurObject: mocks.isBlurObjectMock,
}));
vi.mock('../../objects/annotation/blur/object/update', () => ({
  updateBlurObject: mocks.updateBlurObjectMock,
}));
vi.mock('../../objects/arrow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/arrow')>()),
  getArrowGeometry: mocks.getArrowGeometryMock,
  isArrowObject: mocks.isArrowObjectMock,
  updateArrowObject: mocks.updateArrowObjectMock,
}));
vi.mock('../../objects/annotation/text/callout/resize', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/annotation/text/callout/resize')>()),
  resizeTextCallout: mocks.resizeTextCalloutMock,
}));

import {
  createDiamondDraft,
  createEllipseDraft,
  createRectangleDraft,
  isCompletedDrawSessionTooSmall,
  updateEditorDrawSessionObject,
} from './';

const defaultShapeSettings = { strokeWidth: 4 } as never;
const defaultBlurSettings = { amount: 10, blurType: 'gaussian', showBorder: false } as never;

function runDraftCreationSuite() {
  it('creates rectangle, ellipse, and diamond drafts anchored at the pointer', () => {
    const point = new Point(40, 60);
    const rectangle = createRectangleDraft(point);
    const ellipse = createEllipseDraft(point);
    const diamond = createDiamondDraft(point);

    expect(rectangle.left).toBe(40);
    expect(rectangle.top).toBe(60);
    expect(ellipse.left).toBe(40);
    expect(ellipse.top).toBe(60);
    expect(diamond.left).toBe(40);
    expect(diamond.top).toBe(60);
  });
}

function runShapeAndCropUpdateSuite() {
  it('updates shape and crop draw sessions in place', () => {
    const rectangle = new Rect({ left: 10, top: 20, width: 1, height: 1 });
    const cropGuide = new Rect({ left: 10, top: 20, width: 1, height: 1 });

    const rectangleResult = updateEditorDrawSessionObject(
      {
        object: rectangle,
        start: { x: 10, y: 20 },
        tool: 'rectangle',
      } as never,
      new Point(25, 45),
      { width: 4 } as never,
      defaultShapeSettings,
      defaultBlurSettings
    );
    const cropResult = updateEditorDrawSessionObject(
      {
        object: cropGuide,
        start: { x: 10, y: 20 },
        tool: 'crop',
      } as never,
      new Point(25, 45),
      { width: 4 } as never,
      defaultShapeSettings,
      defaultBlurSettings
    );

    expect(rectangleResult).toBeNull();
    expect(rectangle.left).toBe(12);
    expect(rectangle.top).toBe(22);
    expect(rectangle.width).toBe(11);
    expect(rectangle.height).toBe(21);
    expect(cropResult).toEqual({
      left: 10,
      top: 20,
      width: 15,
      height: 25,
    });
  });
}

function runEllipseUpdateSuite() {
  it('updates ellipse sessions and skips incompatible objects', () => {
    const ellipse = createEllipseDraft(new Point(12, 18));
    const wrongShape = new Rect({ width: 5, height: 6 });

    expect(
      updateEditorDrawSessionObject(
        {
          object: ellipse,
          start: { x: 12, y: 18 },
          tool: 'ellipse',
        } as never,
        new Point(30, 42),
        { width: 4 } as never,
        defaultShapeSettings,
        defaultBlurSettings
      )
    ).toBeNull();
    expect(ellipse.rx).toBe(9);
    expect(ellipse.ry).toBe(12);

    expect(
      updateEditorDrawSessionObject(
        {
          object: wrongShape,
          start: { x: 12, y: 18 },
          tool: 'ellipse',
        } as never,
        new Point(32, 44),
        { width: 4 } as never,
        defaultShapeSettings,
        defaultBlurSettings
      )
    ).toBeNull();
  });
}

function runDiamondAndUnsupportedToolSuite() {
  it('updates diamond sessions and ignores unsupported tools', () => {
    const diamond = createDiamondDraft(new Point(12, 18));

    expect(
      updateEditorDrawSessionObject(
        {
          object: diamond,
          start: { x: 12, y: 18 },
          tool: 'text',
        } as never,
        new Point(32, 44),
        { width: 4 } as never,
        defaultShapeSettings,
        defaultBlurSettings
      )
    ).toBeNull();
  });
}

function runTextUpdateSuite() {
  it('updates text sessions through the width-only text callout resize seam', () => {
    const textbox = { set: vi.fn(), type: 'textbox' };

    expect(
      updateEditorDrawSessionObject(
        {
          object: textbox,
          start: { x: 12, y: 18 },
          tool: 'text',
        } as never,
        new Point(42, 40),
        { color: '#fff', width: 4 } as never,
        defaultShapeSettings,
        defaultBlurSettings
      )
    ).toBeNull();

    expect(textbox.set).toHaveBeenCalledWith({ left: 12, top: 18 });
    expect(mocks.resizeTextCalloutMock).toHaveBeenCalledWith(textbox, 30, 1);
  });
}

function runArrowUpdateSuite() {
  it('updates arrow draw sessions through the arrow object adapter', () => {
    const arrow = { sniptaleArrowPointsJson: '[{"x":5,"y":6},{"x":5,"y":6}]' };
    mocks.isArrowObjectMock.mockReturnValue(true);
    const result = updateEditorDrawSessionObject(
      {
        object: arrow,
        start: { x: 5, y: 6 },
        tool: 'arrow',
      } as never,
      new Point(20, 30),
      { color: '#fff', width: 4 } as never,
      defaultShapeSettings,
      defaultBlurSettings
    );
    expect(result).toBeNull();
    expect(mocks.updateArrowObjectMock).toHaveBeenCalledWith(arrow, {
      points: [
        { x: 5, y: 6 },
        { x: 20, y: 30 },
      ],
      settings: { color: '#fff', width: 4 },
    });
  });
}

function runBlurUpdateSuite() {
  it('updates blur draw sessions through the blur object adapter', () => {
    const blur = { sniptaleType: 'blur' };
    mocks.isBlurObjectMock.mockReturnValue(true);

    const result = updateEditorDrawSessionObject(
      {
        object: blur,
        start: { x: 5, y: 6 },
        tool: 'blur',
      } as never,
      new Point(20, 30),
      { color: '#fff', width: 4 } as never,
      defaultShapeSettings,
      { amount: 12, blurType: 'solid', showBorder: true } as never
    );

    expect(result).toBeNull();
    expect(mocks.updateBlurObjectMock).toHaveBeenCalledWith(blur, {
      bounds: {
        left: 5,
        top: 6,
        width: 15,
        height: 24,
      },
      settings: { amount: 12, blurType: 'solid', showBorder: true },
    });

    updateEditorDrawSessionObject(
      {
        object: blur,
        start: { x: 20, y: 30 },
        tool: 'blur',
      } as never,
      new Point(5, 6),
      { color: '#fff', width: 4 } as never,
      defaultShapeSettings,
      { amount: 8, blurType: 'pixelate', showBorder: false } as never
    );
    expect(mocks.updateBlurObjectMock).toHaveBeenLastCalledWith(blur, {
      bounds: {
        left: 5,
        top: 6,
        width: 15,
        height: 24,
      },
      settings: { amount: 8, blurType: 'pixelate', showBorder: false },
    });
  });
}

function runSizeThresholdSuite() {
  it('detects too-small sessions for both shapes and arrows', () => {
    const shape = new Rect({ width: 5, height: 12 });
    const largeShape = new Rect({ width: 25, height: 30 });
    const arrow = {
      getBoundingRect: () => ({ height: 0, width: 0 }),
      sniptaleType: 'arrow',
    };

    mocks.getArrowGeometryMock.mockReturnValue({
      start: { x: 0, y: 0 },
      end: { x: 3, y: 4 },
    });

    expect(isCompletedDrawSessionTooSmall({ object: shape, tool: 'rectangle' } as never, 8)).toBe(
      true
    );
    expect(
      isCompletedDrawSessionTooSmall({ object: largeShape, tool: 'rectangle' } as never, 8)
    ).toBe(false);
    mocks.isArrowObjectMock.mockReturnValueOnce(true);
    expect(isCompletedDrawSessionTooSmall({ object: arrow, tool: 'arrow' } as never, 8)).toBe(true);
  });
}

describe('editor-controller-drawing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isArrowObjectMock.mockReturnValue(false);
    mocks.isBlurObjectMock.mockReturnValue(false);
    mocks.getArrowGeometryMock.mockReturnValue({ end: { x: 20, y: 0 }, start: { x: 0, y: 0 } });
  });
  runDraftCreationSuite();
  runShapeAndCropUpdateSuite();
  runEllipseUpdateSuite();
  runDiamondAndUnsupportedToolSuite();
  runTextUpdateSuite();
  runArrowUpdateSuite();
  runBlurUpdateSuite();
  runSizeThresholdSuite();
});
