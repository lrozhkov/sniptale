import { beforeEach, describe, expect, it, vi } from 'vitest';

import { normalizeScaledAnnotationTarget } from './annotation-resize';

const objectFactoryMocks = vi.hoisted(() => ({
  getBlurSettings: vi.fn(() => ({ amount: 12 })),
  isBlurObject: vi.fn(() => false),
  normalizeScaledBlurTarget: vi.fn(() => true),
  updateBlurObject: vi.fn(),
}));

vi.mock('../../objects/annotation/blur/object', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/annotation/blur/object')>()),
  getBlurSettings: objectFactoryMocks.getBlurSettings,
  isBlurObject: objectFactoryMocks.isBlurObject,
  normalizeScaledBlurTarget: objectFactoryMocks.normalizeScaledBlurTarget,
  updateBlurObject: objectFactoryMocks.updateBlurObject,
}));

function createStrokeTarget() {
  return {
    set: vi.fn(function apply(this: { strokeUniform?: boolean }, payload: Record<string, unknown>) {
      Object.assign(this, payload);
    }),
    strokeUniform: undefined,
  };
}

function createStepTextTarget() {
  return {
    fontSize: 17,
    scaleX: 2,
    scaleY: 1.5,
    set: vi.fn(function apply(this: Record<string, unknown>, payload: Record<string, unknown>) {
      Object.assign(this, payload);
    }),
    top: -1,
    width: 27,
  };
}

function resetObjectFactoryMocks() {
  vi.clearAllMocks();
  objectFactoryMocks.isBlurObject.mockReturnValue(false);
  objectFactoryMocks.normalizeScaledBlurTarget.mockReturnValue(true);
}

function registerBlurNormalizationTests() {
  it('normalizes blur owners through the blur factory seam', () => {
    const blur = { sniptaleType: 'blur' };
    objectFactoryMocks.isBlurObject.mockReturnValueOnce(true);

    expect(normalizeScaledAnnotationTarget(blur as never)).toBe(true);
    expect(objectFactoryMocks.normalizeScaledBlurTarget).toHaveBeenCalledWith(blur);
    expect(objectFactoryMocks.updateBlurObject).toHaveBeenCalledWith(blur, {
      settings: { amount: 12 },
    });
  });

  it('returns false when blur owner normalization rejects the target', () => {
    objectFactoryMocks.isBlurObject.mockReturnValueOnce(true);
    objectFactoryMocks.normalizeScaledBlurTarget.mockReturnValueOnce(false);

    expect(normalizeScaledAnnotationTarget({ sniptaleType: 'blur' } as never)).toBe(false);
    expect(objectFactoryMocks.updateBlurObject).not.toHaveBeenCalled();
  });
}

function registerAnnotationNormalizationTests() {
  it('normalizes freehand and step owners through stroke and text geometry resets', () => {
    const pencil = { ...createStrokeTarget(), sniptaleType: 'pencil' };
    const highlighter = { ...createStrokeTarget(), sniptaleType: 'highlighter' };
    const circle = createStrokeTarget();
    const text = createStepTextTarget();
    const step = {
      dirty: false,
      getObjects: () => [circle, text],
      sniptaleType: 'step',
      scaleX: 2,
      scaleY: 1.5,
      set: vi.fn(function apply(this: Record<string, unknown>, payload: Record<string, unknown>) {
        Object.assign(this, payload);
      }),
      setCoords: vi.fn(),
    };

    expect(normalizeScaledAnnotationTarget(pencil as never)).toBe(true);
    expect(normalizeScaledAnnotationTarget(highlighter as never)).toBe(true);
    expect(normalizeScaledAnnotationTarget(step as never)).toBe(true);
    expect(pencil.strokeUniform).toBe(true);
    expect(highlighter.strokeUniform).toBe(true);
    expect(circle.strokeUniform).toBe(true);
    expect(step.scaleX).toBe(1);
    expect(step.scaleY).toBe(1);
    expect(text.scaleX).toBe(1);
    expect(text.scaleY).toBe(1);
    expect(text.fontSize).toBeGreaterThan(17);
  });

  it('returns false for unsupported or incomplete owners', () => {
    const fallbackBrush = { sniptaleType: 'pencil', strokeUniform: false };

    expect(normalizeScaledAnnotationTarget(fallbackBrush as never)).toBe(true);
    expect(fallbackBrush.strokeUniform).toBe(true);
    expect(normalizeScaledAnnotationTarget({ sniptaleType: 'image' } as never)).toBe(false);
    expect(normalizeScaledAnnotationTarget({ sniptaleType: 'step' } as never)).toBe(false);
    expect(
      normalizeScaledAnnotationTarget({ getObjects: () => [], sniptaleType: 'step' } as never)
    ).toBe(false);
  });
}

describe('editor-controller annotation resize normalization', () => {
  beforeEach(resetObjectFactoryMocks);
  registerBlurNormalizationTests();
  registerAnnotationNormalizationTests();
});
