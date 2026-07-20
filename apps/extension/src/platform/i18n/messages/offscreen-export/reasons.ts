import { defineMessageSource } from '../source';

export const offscreenExportReasonMessages = defineMessageSource({
  hybridCompositeReasonAssetMissing: { ru: 'source asset не найден', en: 'source asset missing' },
  hybridCompositeReasonCameraMotion: {
    ru: 'активна camera motion',
    en: 'camera motion is active',
  },
  hybridCompositeReasonCursorOverlay: {
    ru: 'активен cursor overlay',
    en: 'cursor overlay is active',
  },
  hybridCompositeReasonExportSize: {
    ru: 'export size отличается от project size',
    en: 'export size differs from project size',
  },
  hybridCompositeReasonMixed: {
    ru: 'несколько причин в merged span',
    en: 'multiple reasons in merged span',
  },
  hybridCompositeReasonNonMp4Asset: {
    ru: 'source asset не MP4/WebM',
    en: 'source asset is not MP4/WebM',
  },
  hybridCompositeReasonPlaybackRate: {
    ru: 'playback rate не равен 1',
    en: 'playback rate is not 1',
  },
  hybridCompositeReasonPrefix: { ru: 'причина:', en: 'reason:' },
  hybridCompositeReasonShadow: { ru: 'активна тень клипа', en: 'clip shadow is active' },
  hybridCompositeReasonSourceSize: {
    ru: 'source size отличается от export size',
    en: 'source size differs from export size',
  },
  hybridCompositeReasonSubtitles: {
    ru: 'активны burn-in subtitles',
    en: 'burn-in subtitles are active',
  },
  hybridCompositeReasonTransform: {
    ru: 'clip transform не full-canvas',
    en: 'clip transform is not full-canvas',
  },
  hybridCompositeReasonTransition: { ru: 'активен transition', en: 'transition is active' },
  hybridCompositeReasonVisualEffect: { ru: 'активен visual effect', en: 'visual effect is active' },
  hybridCompositeReasonVisualLayer: {
    ru: 'есть overlay/другой visual layer',
    en: 'overlay or another visual layer is active',
  },
  hybridCompositeReasonVisibleClips: {
    ru: 'видимых video clips не ровно один',
    en: 'visible video clip count is not exactly one',
  },
});
