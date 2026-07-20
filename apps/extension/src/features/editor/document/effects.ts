export type EditorLayerEffectCategory = 'adjustments' | 'transformations' | 'filters';

export type EditorRasterEffectId =
  | 'brightness'
  | 'contrast'
  | 'gamma'
  | 'hue'
  | 'saturation'
  | 'vibrance'
  | 'invert'
  | 'grayscale'
  | 'sepia'
  | 'colorize'
  | 'blur'
  | 'noise'
  | 'pixelate'
  | 'sharpen'
  | 'emboss'
  | 'edge-detect'
  | 'black-white'
  | 'vintage'
  | 'brownie'
  | 'polaroid'
  | 'kodachrome'
  | 'technicolor';

interface EditorRasterEffectBase {
  enabled: boolean;
  id: EditorRasterEffectId;
}

interface EditorBrightnessEffect extends EditorRasterEffectBase {
  id: 'brightness';
  amount: number;
}

interface EditorContrastEffect extends EditorRasterEffectBase {
  id: 'contrast';
  amount: number;
}

interface EditorGammaEffect extends EditorRasterEffectBase {
  id: 'gamma';
  blue: number;
  green: number;
  red: number;
}

interface EditorHueEffect extends EditorRasterEffectBase {
  id: 'hue';
  rotation: number;
}

interface EditorSaturationEffect extends EditorRasterEffectBase {
  id: 'saturation';
  amount: number;
}

interface EditorVibranceEffect extends EditorRasterEffectBase {
  id: 'vibrance';
  amount: number;
}

interface EditorInvertEffect extends EditorRasterEffectBase {
  id: 'invert';
}

interface EditorGrayscaleEffect extends EditorRasterEffectBase {
  id: 'grayscale';
}

interface EditorSepiaEffect extends EditorRasterEffectBase {
  id: 'sepia';
}

interface EditorColorizeEffect extends EditorRasterEffectBase {
  alpha: number;
  color: string;
  id: 'colorize';
}

interface EditorBlurEffect extends EditorRasterEffectBase {
  blur: number;
  id: 'blur';
}

interface EditorNoiseEffect extends EditorRasterEffectBase {
  id: 'noise';
  noise: number;
}

interface EditorPixelateEffect extends EditorRasterEffectBase {
  blocksize: number;
  id: 'pixelate';
}

interface EditorSharpenEffect extends EditorRasterEffectBase {
  id: 'sharpen';
}

interface EditorEmbossEffect extends EditorRasterEffectBase {
  id: 'emboss';
}

interface EditorEdgeDetectEffect extends EditorRasterEffectBase {
  id: 'edge-detect';
}

interface EditorBlackWhiteEffect extends EditorRasterEffectBase {
  id: 'black-white';
}

interface EditorVintageEffect extends EditorRasterEffectBase {
  id: 'vintage';
}

interface EditorBrownieEffect extends EditorRasterEffectBase {
  id: 'brownie';
}

interface EditorPolaroidEffect extends EditorRasterEffectBase {
  id: 'polaroid';
}

interface EditorKodachromeEffect extends EditorRasterEffectBase {
  id: 'kodachrome';
}

interface EditorTechnicolorEffect extends EditorRasterEffectBase {
  id: 'technicolor';
}

export type EditorRasterEffect =
  | EditorBlackWhiteEffect
  | EditorBlurEffect
  | EditorBrightnessEffect
  | EditorBrownieEffect
  | EditorColorizeEffect
  | EditorContrastEffect
  | EditorEdgeDetectEffect
  | EditorEmbossEffect
  | EditorGammaEffect
  | EditorGrayscaleEffect
  | EditorHueEffect
  | EditorInvertEffect
  | EditorKodachromeEffect
  | EditorNoiseEffect
  | EditorPixelateEffect
  | EditorPolaroidEffect
  | EditorSaturationEffect
  | EditorSepiaEffect
  | EditorSharpenEffect
  | EditorTechnicolorEffect
  | EditorVibranceEffect
  | EditorVintageEffect;
