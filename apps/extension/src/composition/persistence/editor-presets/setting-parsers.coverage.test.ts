import { describe, expect, it } from 'vitest';

import {
  parseArrowSettings,
  parseBlurSettings,
  parseBrushSettings,
  parseLineSettings,
  parseSceneBackgroundSettings,
  parseShapeSettings,
  parseStepSettings,
  parseTextSettings,
} from './setting-parsers';
import {
  arrowSettings,
  blurSettings,
  brushSettings,
  lineSettings,
  sceneBackgroundSettings,
  shapeSettings,
  stepSettings,
  textSettings,
} from './setting-parsers.coverage.test-support.ts';

describe('setting parsers coverage', () => {
  registerHappyPathParserTest();
  registerSceneBackgroundFallbackTest();
  registerRejectedContractTest();
});

function registerHappyPathParserTest() {
  registerBrushShapeLineParserTests();
  registerArrowBlurTextStepParserTests();
  registerSceneBackgroundParserTests();
}

function registerBrushShapeLineParserTests() {
  it('parses brush, shape, and line settings through the happy path', () => {
    expect(parseBrushSettings(brushSettings)).toEqual(brushSettings);
    expect(parseBrushSettings({ ...brushSettings, dynamicWidth: true })).toEqual({
      ...brushSettings,
      dynamicWidth: true,
    });
    expect(parseShapeSettings(shapeSettings)).toEqual(shapeSettings);
    expect(parseLineSettings(lineSettings)).toEqual(lineSettings);
    expect(
      parseLineSettings({ ...lineSettings, shadow: undefined, shadowAngle: undefined })
    ).toEqual({
      ...lineSettings,
      shadow: 0,
      shadowAngle: 90,
      shadowColor: lineSettings.color,
    });
    const {
      roughFillBowing: _legacyBowing,
      roughFillOpacity: _legacyOpacity,
      roughFillRoughness: _legacyRoughness,
      ...legacyLineSettings
    } = lineSettings;
    expect(parseLineSettings(legacyLineSettings)).toEqual({
      ...legacyLineSettings,
      roughFillBowing: lineSettings.bowing,
      roughFillOpacity: lineSettings.fillOpacity,
      roughFillRoughness: lineSettings.roughness,
    });
  });
}

function registerArrowBlurTextStepParserTests() {
  it('parses arrow, blur, text, and step settings through the happy path', () => {
    expect(
      parseArrowSettings({ ...arrowSettings, arrowType: 'elbow', dynamicWidth: true })
    ).toMatchObject({ ...arrowSettings, arrowType: 'elbow', dynamicWidth: true });
    expect(
      parseArrowSettings({
        ...arrowSettings,
        variant: 'tapered',
      })
    ).toMatchObject({
      ...arrowSettings,
      variant: 'tapered',
    });
    expect(
      parseArrowSettings({
        ...arrowSettings,
        variant: undefined,
      })
    ).toMatchObject(arrowSettings);
    expect(parseBlurSettings(blurSettings)).toEqual(blurSettings);
    expect(parseTextSettings(textSettings)).toEqual(textSettings);
    expect(parseStepSettings(stepSettings)).toEqual(stepSettings);
    expect(parseStepSettings({ ...stepSettings, type: 'manual', value: 'OK' })).toEqual({
      ...stepSettings,
      type: 'manual',
      value: 'OK',
    });
    expect(
      parseStepSettings({
        type: 'number',
        alphabet: 'latin',
        sizeLevel: 3,
        value: '1',
        color: '#111111',
      })
    ).toEqual(stepSettings);
  });
}

function registerSceneBackgroundParserTests() {
  it('parses scene background settings through the happy path', () => {
    expect(parseSceneBackgroundSettings(sceneBackgroundSettings)).toEqual(sceneBackgroundSettings);
    expect(
      parseSceneBackgroundSettings({
        ...sceneBackgroundSettings,
        backgroundGradientStops: ['#111111', '#555555', '#222222'],
      })
    ).toEqual({
      ...sceneBackgroundSettings,
      backgroundGradientFrom: '#111111',
      backgroundGradientStops: ['#111111', '#555555', '#222222'],
      backgroundGradientTo: '#222222',
    });
  });
}

function registerSceneBackgroundFallbackTest() {
  it('fills legacy scene background presets with canonical scene defaults', () => {
    expect(
      parseSceneBackgroundSettings({
        backgroundMode: 'gradient',
        backgroundColor: 'transparent',
        backgroundGradientFrom: '#7c2d12',
        backgroundGradientTo: '#f59e0b',
        backgroundGradientAngle: 145,
      })
    ).toEqual(sceneBackgroundSettings);
  });
}

function registerRejectedContractTest() {
  it('rejects malformed contracts across every parser family', () => {
    expect(parseBrushSettings({ ...brushSettings, shapeCorrection: 'bad' })).toBeNull();
    expect(parseShapeSettings({ ...shapeSettings, strokeStyle: 'double' })).toBeNull();
    expect(parseArrowSettings({ ...arrowSettings, variant: 'zigzag' })).toBeNull();
    expect(parseArrowSettings({ ...arrowSettings, startHead: 'zigzag' })).toBeNull();
    expect(parseArrowSettings({ ...arrowSettings, endHead: 'zigzag' })).toBeNull();
    expect(parseArrowSettings({ ...arrowSettings, arrowType: 'zigzag' })).toBeNull();
    expect(parseArrowSettings({ ...arrowSettings, dynamicWidth: 'yes' })).toBeNull();
    expect(parseLineSettings({ ...lineSettings, style: 'double' })).toBeNull();
    expect(parseLineSettings({ ...lineSettings, fillMode: 'image' })).toBeNull();
    expect(parseLineSettings({ ...lineSettings, roughFillStyle: 'waves' })).toBeNull();
    expect(parseLineSettings({ ...lineSettings, roughFillOpacity: 'full' })).toBeNull();
    expect(parseBlurSettings({ ...blurSettings, blurType: 'mosaic' })).toBeNull();
    expect(parseBlurSettings({ ...blurSettings, strokeStyle: 'double' })).toBeNull();
    expect(parseTextSettings({ ...textSettings, fontFamily: 'comic-sans' })).toBeNull();
    expect(parseTextSettings({ ...textSettings, textAlign: 'justify' })).toEqual({
      ...textSettings,
      textAlign: 'left',
    });
    expect(parseStepSettings({ ...stepSettings, alphabet: 'greek' })).toBeNull();
    expect(
      parseSceneBackgroundSettings({
        ...sceneBackgroundSettings,
        backgroundImageFit: 'crop',
      })
    ).toBeNull();
  });
}
