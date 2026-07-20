// @vitest-environment jsdom
/* eslint-disable max-lines-per-function -- utility coverage keeps related helper branches together */
import { describe, expect, it } from 'vitest';

import { extractBrowserVersion, parseRgbColor } from '../../color/parsing';
import {
  clamp,
  createObjectLabel,
  CUSTOM_JSON_PROPS,
  fontFamilyToCss,
  getEditorObjectTypeLabel,
  getFabricImageIntrinsicSize,
  getSingleSelectionType,
  hexToRgba,
  isBrowserFrameObject,
  isEditableObject,
  isFrameObject,
  isSourceObject,
  isTransparentColor,
  isUserObject,
} from './';

describe('utils color parsing', () => {
  it('parses rgb and rgba colors without regex helpers', () => {
    expect(parseRgbColor('rgb(255, 103, 29)')).toEqual({
      red: 255,
      green: 103,
      blue: 29,
      alpha: null,
    });
    expect(parseRgbColor('rgba(255 103 29 / 0.4)')).toEqual({
      red: 255,
      green: 103,
      blue: 29,
      alpha: 0.4,
    });
  });

  it('keeps transparent rgba detection intact', () => {
    expect(isTransparentColor(null)).toBe(true);
    expect(isTransparentColor('none')).toBe(true);
    expect(isTransparentColor('#00000000')).toBe(true);
    expect(isTransparentColor('rgba(255, 103, 29, 0)')).toBe(true);
    expect(isTransparentColor('rgb(255, 103, 29)')).toBe(false);
  });

  it('clamps values and preserves rgb strings when converting colors', () => {
    expect(clamp(12, 0, 10)).toBe(10);
    expect(clamp(-4, 0, 10)).toBe(0);
    expect(hexToRgba('#f60', 0.5)).toBe('rgba(255, 102, 0, 0.5)');
    expect(hexToRgba('rgb(10, 20, 30)', 0.2)).toBe('rgb(10, 20, 30)');
    expect(hexToRgba('transparent', 0.2)).toBe('transparent');
  });

  it('keeps annotation shadow and arrow metadata in custom Fabric JSON props', () => {
    expect(CUSTOM_JSON_PROPS).toContain('sniptaleTextCalloutFormat');
    expect(CUSTOM_JSON_PROPS).toContain('sniptaleTextLayoutMode');
    expect(CUSTOM_JSON_PROPS).toContain('sniptaleTextVerticalAlign');
    expect(CUSTOM_JSON_PROPS).toContain('sniptaleTextBackgroundOpacity');
    expect(CUSTOM_JSON_PROPS).toContain('sniptaleTextCalloutShadow');
    expect(CUSTOM_JSON_PROPS).toContain('sniptaleTextCalloutWidth');
    expect(CUSTOM_JSON_PROPS).toContain('sniptaleTextCalloutHeight');
    expect(CUSTOM_JSON_PROPS).toContain('sniptaleBrushShadow');
    expect(CUSTOM_JSON_PROPS).toContain('sniptaleBrushShadowAngle');
    expect(CUSTOM_JSON_PROPS).toContain('sniptaleBrushShadowColor');
    expect(CUSTOM_JSON_PROPS).toContain('sniptaleBrushSmoothing');
    expect(CUSTOM_JSON_PROPS).toContain('sniptaleBrushDynamicWidth');
    expect(CUSTOM_JSON_PROPS).toContain('sniptaleBrushWidth');
    expect(CUSTOM_JSON_PROPS).toContain('sniptaleBrushPointsJson');
    expect(CUSTOM_JSON_PROPS).toContain('sniptaleBrushSamplesJson');
    expect(CUSTOM_JSON_PROPS).not.toContain('sniptaleTextVariant');
    expect(CUSTOM_JSON_PROPS).toContain('sniptaleArrowWidth');
    expect(CUSTOM_JSON_PROPS).toContain('sniptaleArrowVariant');
    expect(CUSTOM_JSON_PROPS).toContain('sniptaleArrowType');
    expect(CUSTOM_JSON_PROPS).toContain('sniptaleArrowDynamicWidth');
    expect(CUSTOM_JSON_PROPS).toContain('sniptaleArrowStartHeadSize');
    expect(CUSTOM_JSON_PROPS).toContain('sniptaleArrowEndHeadSize');
    expect(CUSTOM_JSON_PROPS).toContain('sniptaleArrowShadow');
    expect(CUSTOM_JSON_PROPS).toContain('sniptaleArrowShadowAngle');
    expect(CUSTOM_JSON_PROPS).toContain('sniptaleArrowShadowColor');
    expect(CUSTOM_JSON_PROPS).toContain('sniptaleLinePointsJson');
    expect(CUSTOM_JSON_PROPS).toContain('sniptaleLineStyle');
    expect(CUSTOM_JSON_PROPS).toContain('sniptaleLineShadow');
    expect(CUSTOM_JSON_PROPS).toContain('sniptaleLineShadowAngle');
    expect(CUSTOM_JSON_PROPS).toContain('sniptaleLineShadowColor');
    expect(CUSTOM_JSON_PROPS).toContain('sniptaleLineFillMode');
    expect(CUSTOM_JSON_PROPS).toContain('sniptaleLineGradientStops');
    expect(CUSTOM_JSON_PROPS).toContain('sniptaleShapeStrokeOpacity');
    expect(CUSTOM_JSON_PROPS).toContain('sniptaleShapeFillOpacity');
    expect(CUSTOM_JSON_PROPS).toContain('sniptaleShapeCustomCss');
    expect(CUSTOM_JSON_PROPS).toContain('sniptaleShapeInheritCustomCss');
    expect(CUSTOM_JSON_PROPS).toContain('sniptaleBlurAmount');
    expect(CUSTOM_JSON_PROPS).toContain('sniptaleBlurType');
    expect(CUSTOM_JSON_PROPS).toContain('sniptaleBlurShowBorder');
    expect(CUSTOM_JSON_PROPS).toContain('sniptaleBlurStrokeStyle');
    expect(CUSTOM_JSON_PROPS).toContain('sniptaleBackgroundMode');
    expect(CUSTOM_JSON_PROPS).toContain('sniptaleBackgroundGradientColorStops');
    expect(CUSTOM_JSON_PROPS).toContain('sniptaleBackgroundFit');
    expect(CUSTOM_JSON_PROPS).toContain('sniptaleBackgroundImageData');
  });

  it('maps editor font families to CSS stacks', () => {
    expect(fontFamilyToCss('serif')).toContain('Georgia');
    expect(fontFamilyToCss('mono')).toContain('ui-monospace');
    expect(fontFamilyToCss('sans')).toContain('system-ui');
  });
});

describe('utils browser version parsing', () => {
  it('extracts browser versions from user agents', () => {
    expect(extractBrowserVersion('Mozilla/5.0 Edg/122.0.1 Safari/537.36', 'Edg/')).toBe('122.0.1');
    expect(extractBrowserVersion('Mozilla/5.0 Chrome/132.0.0.0 Safari/537.36', 'Chrome/')).toBe(
      '132.0.0.0'
    );
    expect(extractBrowserVersion('Mozilla/5.0 Safari/537.36', 'Chrome/')).toBeNull();
  });
});

describe('utils object helpers', () => {
  it('classifies frame, browser frame, user, source, and editable objects', () => {
    const frameObject = { sniptaleRole: 'frame' };
    const browserFrameObject = { sniptaleType: 'browser-frame' };
    const cropGuideObject = { sniptaleRole: 'crop-guide' };
    const sourceObject = { sniptaleRole: 'source', sniptaleType: 'source-image' };
    const backgroundObject = { sniptaleRole: 'background', sniptaleType: 'background' };
    const annotationObject = { sniptaleRole: 'annotation', sniptaleType: 'text' };

    expect(isFrameObject(frameObject as never)).toBe(true);
    expect(isBrowserFrameObject(browserFrameObject as never)).toBe(true);
    expect(isUserObject(annotationObject as never)).toBe(true);
    expect(isUserObject(backgroundObject as never)).toBe(true);
    expect(isUserObject(browserFrameObject as never)).toBe(true);
    expect(isUserObject(cropGuideObject as never)).toBe(false);
    expect(isUserObject(frameObject as never)).toBe(false);
    expect(isEditableObject(browserFrameObject as never)).toBe(true);
    expect(isEditableObject(annotationObject as never)).toBe(true);
    expect(isSourceObject(sourceObject as never)).toBe(true);
  });

  it('creates layer labels and resolves single selection types', () => {
    expect(createObjectLabel('source-image', 3)).not.toContain('3');
    expect(createObjectLabel('background', 3)).not.toContain('3');
    expect(createObjectLabel('image', 2)).toContain('2');
    expect(createObjectLabel('browser-frame', 1)).toMatch(/1$/);
    expect(createObjectLabel('meta-stamp', 1)).toMatch(/1$/);
    expect(getEditorObjectTypeLabel('transparent-base')).toBeTruthy();
    expect(getEditorObjectTypeLabel('source-image')).toBeTruthy();
    expect(getEditorObjectTypeLabel('background')).toBeTruthy();
    expect(getEditorObjectTypeLabel('blur')).toBeTruthy();
    expect(getEditorObjectTypeLabel('line')).toBeTruthy();
    expect(getEditorObjectTypeLabel('rectangle')).toBeTruthy();
    expect(getEditorObjectTypeLabel('image')).toBeTruthy();
    expect(getEditorObjectTypeLabel('browser-frame')).toBeTruthy();
    expect(getEditorObjectTypeLabel('meta-stamp')).toBeTruthy();
    expect(
      getSingleSelectionType([
        { sniptaleType: 'rectangle' },
        { sniptaleType: 'rectangle' },
      ] as never)
    ).toBe('rectangle');
    expect(
      getSingleSelectionType([{ sniptaleType: 'rectangle' }, { sniptaleType: 'ellipse' }] as never)
    ).toBeNull();
    expect(getSingleSelectionType([{ sniptaleType: null }] as never)).toBeNull();
  });

  it('reads intrinsic fabric image size from the backing image element', () => {
    const size = getFabricImageIntrinsicSize({
      getElement: () => ({ height: 360, width: 640 }),
      height: undefined,
      width: undefined,
    } as never);
    const imageElement = document.createElement('img');
    Object.defineProperty(imageElement, 'naturalWidth', { value: 800 });
    Object.defineProperty(imageElement, 'naturalHeight', { value: 600 });
    const imageSize = getFabricImageIntrinsicSize({
      getElement: () => imageElement,
      height: undefined,
      width: undefined,
    } as never);

    expect(size).toEqual({ height: 360, width: 640 });
    expect(imageSize).toEqual({ height: 600, width: 800 });
  });

  it('covers transparent hex branches and empty selection handling', () => {
    expect(isTransparentColor('#ff00ff00')).toBe(true);
    expect(isTransparentColor('rgba(255, 103, 29, 0.5)')).toBe(false);
    expect(hexToRgba('#abc', 0.5)).toBe('rgba(170, 187, 204, 0.5)');
    expect(hexToRgba('#abcd', 0.5)).toBe('rgba(171, 205, 0, 0.5)');
    expect(getSingleSelectionType([] as never)).toBeNull();
  });
});
