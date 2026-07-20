import { filters } from 'fabric';
import type { EditorRasterEffect } from '../../../features/editor/document/effects';

const SHARPEN_MATRIX = [0, -1, 0, -1, 5, -1, 0, -1, 0];
const EMBOSS_MATRIX = [1, 1, 1, 1, 0.7, -1, -1, -1, -1];
const EDGE_DETECT_MATRIX = [-1, -1, -1, -1, 8, -1, -1, -1, -1];

function createAdjustmentFilter(effect: EditorRasterEffect) {
  switch (effect.id) {
    case 'brightness':
      return new filters.Brightness({ brightness: effect.amount });
    case 'contrast':
      return new filters.Contrast({ contrast: effect.amount });
    case 'gamma':
      return new filters.Gamma({ gamma: [effect.red, effect.green, effect.blue] });
    case 'hue':
      return new filters.HueRotation({ rotation: effect.rotation });
    case 'saturation':
      return new filters.Saturation({ saturation: effect.amount });
    case 'vibrance':
      return new filters.Vibrance({ vibrance: effect.amount });
    case 'invert':
      return new filters.Invert();
    case 'grayscale':
      return new filters.Grayscale();
    case 'sepia':
      return new filters.Sepia();
    case 'colorize':
      return new filters.BlendColor({
        alpha: effect.alpha,
        color: effect.color,
        mode: 'tint',
      });
    case 'blur':
    case 'noise':
    case 'pixelate':
    case 'sharpen':
    case 'emboss':
    case 'edge-detect':
    case 'black-white':
    case 'vintage':
    case 'brownie':
    case 'polaroid':
    case 'kodachrome':
    case 'technicolor':
      return null;
  }
}

function createEffectFilter(effect: EditorRasterEffect) {
  switch (effect.id) {
    case 'blur':
      return new filters.Blur({ blur: effect.blur });
    case 'noise':
      return new filters.Noise({ noise: effect.noise });
    case 'pixelate':
      return new filters.Pixelate({ blocksize: effect.blocksize });
    case 'sharpen':
      return new filters.Convolute({ matrix: SHARPEN_MATRIX, opaque: false });
    case 'emboss':
      return new filters.Convolute({ matrix: EMBOSS_MATRIX, opaque: false });
    case 'edge-detect':
      return new filters.Convolute({ matrix: EDGE_DETECT_MATRIX, opaque: false });
    case 'black-white':
      return new filters.BlackWhite();
    case 'vintage':
      return new filters.Vintage();
    case 'brownie':
      return new filters.Brownie();
    case 'polaroid':
      return new filters.Polaroid();
    case 'kodachrome':
      return new filters.Kodachrome();
    case 'technicolor':
      return new filters.Technicolor();
    case 'brightness':
    case 'contrast':
    case 'gamma':
    case 'hue':
    case 'saturation':
    case 'vibrance':
    case 'invert':
    case 'grayscale':
    case 'sepia':
    case 'colorize':
      return null;
  }
}

export function createEditorRasterFilter(effect: EditorRasterEffect) {
  if (!effect.enabled) {
    return null;
  }

  return createAdjustmentFilter(effect) ?? createEffectFilter(effect);
}
