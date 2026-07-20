/* eslint-disable max-lines-per-function -- registry coverage keeps exhaustive default cases together */
import { describe, expect, it } from 'vitest';
import {
  createDefaultEditorRasterEffect,
  getEditorLayerEffectDefinitionsByCategory,
  isEditorLayerTransformationId,
  isEditorRasterEffectId,
} from './registry';

describe('editor-controller layer-effects registry', () => {
  it('groups effect definitions by category and classifies command ids', () => {
    expect(getEditorLayerEffectDefinitionsByCategory('adjustments')).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'brightness' })])
    );
    expect(getEditorLayerEffectDefinitionsByCategory('transformations')).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'resize-layer' })])
    );
    expect(getEditorLayerEffectDefinitionsByCategory('filters')).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'blur' })])
    );
    expect(isEditorRasterEffectId('brightness')).toBe(true);
    expect(isEditorRasterEffectId('resize-layer')).toBe(false);
    expect(isEditorLayerTransformationId('rotate-left')).toBe(true);
    expect(isEditorLayerTransformationId('sepia')).toBe(false);
  });

  it('creates defaults for every supported raster effect id', () => {
    expect(createDefaultEditorRasterEffect('brightness')).toEqual({
      amount: 0.18,
      enabled: true,
      id: 'brightness',
    });
    expect(createDefaultEditorRasterEffect('contrast')).toEqual({
      amount: 0.18,
      enabled: true,
      id: 'contrast',
    });
    expect(createDefaultEditorRasterEffect('gamma')).toEqual({
      blue: 1.15,
      enabled: true,
      green: 1.15,
      id: 'gamma',
      red: 1.15,
    });
    expect(createDefaultEditorRasterEffect('hue')).toEqual({
      enabled: true,
      id: 'hue',
      rotation: 0.15,
    });
    expect(createDefaultEditorRasterEffect('saturation')).toEqual({
      amount: 0.2,
      enabled: true,
      id: 'saturation',
    });
    expect(createDefaultEditorRasterEffect('vibrance')).toEqual({
      amount: 0.24,
      enabled: true,
      id: 'vibrance',
    });
    expect(createDefaultEditorRasterEffect('invert')).toEqual({ enabled: true, id: 'invert' });
    expect(createDefaultEditorRasterEffect('grayscale')).toEqual({
      enabled: true,
      id: 'grayscale',
    });
    expect(createDefaultEditorRasterEffect('sepia')).toEqual({ enabled: true, id: 'sepia' });
    expect(createDefaultEditorRasterEffect('colorize')).toEqual({
      alpha: 0.26,
      color: '#ff7a1a',
      enabled: true,
      id: 'colorize',
    });
    expect(createDefaultEditorRasterEffect('blur')).toEqual({
      blur: 0.18,
      enabled: true,
      id: 'blur',
    });
    expect(createDefaultEditorRasterEffect('noise')).toEqual({
      enabled: true,
      id: 'noise',
      noise: 120,
    });
    expect(createDefaultEditorRasterEffect('pixelate')).toEqual({
      blocksize: 6,
      enabled: true,
      id: 'pixelate',
    });
    expect(createDefaultEditorRasterEffect('sharpen')).toEqual({ enabled: true, id: 'sharpen' });
    expect(createDefaultEditorRasterEffect('emboss')).toEqual({ enabled: true, id: 'emboss' });
    expect(createDefaultEditorRasterEffect('edge-detect')).toEqual({
      enabled: true,
      id: 'edge-detect',
    });
    expect(createDefaultEditorRasterEffect('black-white')).toEqual({
      enabled: true,
      id: 'black-white',
    });
    expect(createDefaultEditorRasterEffect('vintage')).toEqual({ enabled: true, id: 'vintage' });
    expect(createDefaultEditorRasterEffect('brownie')).toEqual({ enabled: true, id: 'brownie' });
    expect(createDefaultEditorRasterEffect('polaroid')).toEqual({ enabled: true, id: 'polaroid' });
    expect(createDefaultEditorRasterEffect('kodachrome')).toEqual({
      enabled: true,
      id: 'kodachrome',
    });
    expect(createDefaultEditorRasterEffect('technicolor')).toEqual({
      enabled: true,
      id: 'technicolor',
    });
  });
});
