import { defineMessageSource } from '../source';
import { offscreenExportReasonMessages } from './reasons';

export const offscreenExportMessages = defineMessageSource({
  ...offscreenExportReasonMessages,
  alreadyRunning: {
    ru: 'Экспорт уже выполняется. Дождитесь завершения текущей задачи.',
    en: 'An export is already running. Wait for the current job to finish.',
  },
  interruptedByRuntimeRestart: {
    ru: 'Экспорт был прерван перезапуском runtime расширения. Запустите экспорт заново.',
    en: 'Export was interrupted by the extension runtime restarting. Start the export again.',
  },
  preparingProject: {
    ru: 'Подготовка проекта к экспорту',
    en: 'Preparing project for export',
  },
  passthroughSingleClipOnly: {
    ru: 'Быстрый экспорт поддерживается только для проекта с одним видеоклипом.',
    en: 'Fast export is only supported for a project with a single video clip.',
  },
  passthroughAssetMissing: {
    ru: 'Исходный asset для fast-path экспорта не найден.',
    en: 'Source asset for fast-path export was not found.',
  },
  savingFinishedFile: {
    ru: 'Сохранение готового файла',
    en: 'Saving finished file',
  },
  canvasContextError: {
    ru: 'Не удалось получить 2D context для export canvas.',
    en: 'Failed to get 2D context for export canvas.',
  },
  webmRecorderError: {
    ru: 'MediaRecorder export failed',
    en: 'MediaRecorder export failed',
  },
  mp4MuxerInitializingWithFallbackPrefix: {
    ru: 'Инициализация MP4 muxer (',
    en: 'Initializing MP4 muxer (',
  },
  mp4MuxerInitializingWithFallbackSuffix: {
    ru: ' fallback)',
    en: ' fallback)',
  },
  mp4MuxerInitializing: {
    ru: 'Инициализация frame-driven MP4 render',
    en: 'Initializing frame-driven MP4 render',
  },
  mp4VideoCodecRequired: {
    ru: 'Для MP4 экспорта сначала выберите доступный видеокодек.',
    en: 'Select an available video codec before starting MP4 export.',
  },
  mp4VideoChunkRejected: {
    ru: 'MP4 muxer отклонил video chunk.',
    en: 'MP4 muxer rejected video chunk.',
  },
  mp4VideoEncoderFailed: {
    ru: 'VideoEncoder завершился с ошибкой.',
    en: 'VideoEncoder failed.',
  },
  mp4AudioChunkRejected: {
    ru: 'MP4 muxer отклонил audio chunk.',
    en: 'MP4 muxer rejected audio chunk.',
  },
  mp4AudioEncoderFailed: {
    ru: 'AudioEncoder завершился с ошибкой.',
    en: 'AudioEncoder failed.',
  },
  mp4FinalizingContainer: {
    ru: 'Финализация MP4 контейнера',
    en: 'Finalizing MP4 container',
  },
  mp4PrepareFailedPrefix: {
    ru: 'Не удалось подготовить MP4 файл:',
    en: 'Failed to prepare MP4 file:',
  },
  renderEncodingAction: {
    ru: 'Рендер и кодирование',
    en: 'Rendering and encoding',
  },
  renderFrameAction: {
    ru: 'Рендер кадра',
    en: 'Rendering frame',
  },
  hybridCleanSpanRender: {
    ru: 'Hybrid MP4: обработка чистого source-сегмента',
    en: 'Hybrid MP4: processing clean source span',
  },
  hybridWebmCleanSpanRender: {
    ru: 'Hybrid MP4: sequential WebM decode',
    en: 'Hybrid MP4: sequential WebM decode',
  },
  hybridAcceleratedCompositeRender: {
    ru: 'Hybrid MP4: accelerated composite render',
    en: 'Hybrid MP4: accelerated composite render',
  },
  hybridAcceleratedCompositeFallback: {
    ru: 'Hybrid MP4: accelerated composite недоступен, fallback в frame-driven',
    en: 'Hybrid MP4: accelerated composite unavailable, falling back to frame-driven',
  },
  hybridCleanSpanFallback: {
    ru: 'Hybrid MP4: clean source недоступен, fallback в frame-driven',
    en: 'Hybrid MP4: clean source unavailable, falling back to frame-driven',
  },
  hybridCompositeSpanRender: {
    ru: 'Hybrid MP4: frame-driven fallback для composite-сегмента',
    en: 'Hybrid MP4: frame-driven fallback for composite span',
  },
  hybridPlanCleanLabel: {
    ru: 'clean-source,',
    en: 'clean-source,',
  },
  hybridPlanAcceleratedLabel: {
    ru: 'accelerated-composite,',
    en: 'accelerated-composite,',
  },
  hybridPlanCompositeLabel: {
    ru: 'frame-driven',
    en: 'frame-driven',
  },
  hybridPlanSummaryPrefix: {
    ru: 'Hybrid MP4 план:',
    en: 'Hybrid MP4 plan:',
  },
  progressFrameOf: {
    ru: 'из',
    en: 'of',
  },
  frameDrivenRenderPrefix: {
    ru: 'Frame-driven render',
    en: 'Frame-driven render',
  },
  seekMediaElementError: {
    ru: 'Не удалось позиционировать media element для frame-driven render.',
    en: 'Failed to seek media element for frame-driven render.',
  },
  loadMediaResourceError: {
    ru: 'Не удалось загрузить медиаресурс для экспорта.',
    en: 'Failed to load media resource for export.',
  },
  fastPathMp4OnlySourceAsset: {
    ru: 'Fast-path MP4 экспорт поддерживается только для исходного MP4 asset.',
    en: 'Fast-path MP4 export is only supported for source MP4 assets.',
  },
  videoEncoderUnavailable: {
    ru: 'VideoEncoder недоступен в текущем Offscreen Document.',
    en: 'VideoEncoder is unavailable in the current Offscreen Document.',
  },
  audioEncoderUnavailable: {
    ru: 'AudioEncoder недоступен в текущем Offscreen Document.',
    en: 'AudioEncoder is unavailable in the current Offscreen Document.',
  },
  supportedVideoEncoderMissingPrefix: {
    ru: 'Не найден поддерживаемый video encoder для MP4 export. Проверены:',
    en: 'No supported video encoder found for MP4 export. Checked:',
  },
  supportedVideoEncoderMissingSuffix: {
    ru: '',
    en: '',
  },
  supportedAudioEncoderMissingPrefix: {
    ru: 'Не найден поддерживаемый audio encoder для MP4 export. Проверены:',
    en: 'No supported audio encoder found for MP4 export. Checked:',
  },
  supportedAudioEncoderMissingSuffix: {
    ru: '',
    en: '',
  },
  storePreparing: {
    ru: 'Подготовка экспорта',
    en: 'Preparing export',
  },
  storeCompletedPrefix: {
    ru: 'Экспорт завершён:',
    en: 'Export completed:',
  },
  storeCancelled: {
    ru: 'Экспорт отменён',
    en: 'Export cancelled',
  },
  formatMp4Label: {
    ru: 'MP4',
    en: 'MP4',
  },
  formatWebmLabel: {
    ru: 'WebM',
    en: 'WebM',
  },
  codecH264HighAutoLabel: {
    ru: 'H.264 High (Авто)',
    en: 'H.264 High (Auto)',
  },
  codecH264MainAutoLabel: {
    ru: 'H.264 Main (Авто)',
    en: 'H.264 Main (Auto)',
  },
  codecH264ConstrainedBaselineAutoLabel: {
    ru: 'H.264 Constrained Baseline (Авто)',
    en: 'H.264 Constrained Baseline (Auto)',
  },
  codecH264HighHwLabel: {
    ru: 'H.264 High (HW)',
    en: 'H.264 High (HW)',
  },
  codecH264HighSwLabel: {
    ru: 'H.264 High (SW)',
    en: 'H.264 High (SW)',
  },
  codecH264MainHwLabel: {
    ru: 'H.264 Main (HW)',
    en: 'H.264 Main (HW)',
  },
  codecH264MainSwLabel: {
    ru: 'H.264 Main (SW)',
    en: 'H.264 Main (SW)',
  },
  codecH264ConstrainedBaselineHwLabel: {
    ru: 'H.264 Constrained Baseline (HW)',
    en: 'H.264 Constrained Baseline (HW)',
  },
  codecH264ConstrainedBaselineSwLabel: {
    ru: 'H.264 Constrained Baseline (SW)',
    en: 'H.264 Constrained Baseline (SW)',
  },
  codecH264BaselineSwLabel: {
    ru: 'H.264 Baseline (SW)',
    en: 'H.264 Baseline (SW)',
  },
  codecHevcAutoLabel: {
    ru: 'H.265 Main (Авто)',
    en: 'H.265 Main (Auto)',
  },
  codecHevcHwLabel: {
    ru: 'H.265 Main (HW)',
    en: 'H.265 Main (HW)',
  },
  codecHevcSwLabel: {
    ru: 'H.265 Main (SW)',
    en: 'H.265 Main (SW)',
  },
  codecVp9SwLabel: {
    ru: 'VP9 (SW)',
    en: 'VP9 (SW)',
  },
  codecVp9HwLabel: {
    ru: 'VP9 (HW)',
    en: 'VP9 (HW)',
  },
  codecAacLabel: {
    ru: 'AAC',
    en: 'AAC',
  },
  codecOpusLabel: {
    ru: 'Opus',
    en: 'Opus',
  },
});
