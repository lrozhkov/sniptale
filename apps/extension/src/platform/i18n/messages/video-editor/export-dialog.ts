import { defineMessageSource } from '../source';

export const videoEditorExportDialogMessages = defineMessageSource({
  eyebrow: {
    ru: 'Экспорт проекта',
    en: 'Project export',
  },
  titlePrefix: {
    ru: 'Финальный рендер в',
    en: 'Final render to',
  },
  description: {
    ru: 'Файл будет собран из всех видимых дорожек и активных наложений текущего проекта.',
    en: 'The file will be assembled from all visible tracks and active overlays in the current project.',
  },
  scopeLabel: {
    ru: 'Область экспорта',
    en: 'Export scope',
  },
  scopeProjectLabel: {
    ru: 'Весь проект',
    en: 'Whole project',
  },
  scopeSelectedClipLabel: {
    ru: 'Только выделенный фрагмент',
    en: 'Selected clip only',
  },
  formatLabel: {
    ru: 'Формат',
    en: 'Format',
  },
  formatMp4Label: {
    ru: 'MP4',
    en: 'MP4',
  },
  formatWebmLabel: {
    ru: 'WebM',
    en: 'WebM',
  },
  codecLabel: {
    ru: 'Видеокодек',
    en: 'Video codec',
  },
  codecAvcLabel: {
    ru: 'H.264 (AVC)',
    en: 'H.264 (AVC)',
  },
  codecHevcLabel: {
    ru: 'H.265 (HEVC)',
    en: 'H.265 (HEVC)',
  },
  codecVp9Label: {
    ru: 'VP9',
    en: 'VP9',
  },
  qualityLabel: {
    ru: 'Качество',
    en: 'Quality',
  },
  qualityDraft: {
    ru: 'Черновик',
    en: 'Draft',
  },
  qualityBalanced: {
    ru: 'Баланс',
    en: 'Balanced',
  },
  qualityHigh: {
    ru: 'Высокое',
    en: 'High',
  },
  widthLabel: {
    ru: 'Ширина',
    en: 'Width',
  },
  heightLabel: {
    ru: 'Высота',
    en: 'Height',
  },
  fpsLabel: {
    ru: 'FPS',
    en: 'FPS',
  },
  capabilityLoading: {
    ru: 'Проверяем, какие MP4-кодеки реально доступны в текущем браузере и системе.',
    en: 'Checking which MP4 codecs are actually available in the current browser and system.',
  },
  capabilityFallbackNote: {
    ru: 'Проверка доступных кодеков завершилась с ошибкой:',
    en: 'Codec capability probing failed:',
  },
  mp4HintSingleCodec: {
    ru:
      'MP4 использует frame-driven render через WebCodecs и offline audio mix. ' +
      'Доступный кодек определяется системой.',
    en:
      'MP4 uses frame-driven rendering via WebCodecs and offline audio mixing. ' +
      'The available codec is determined by the system.',
  },
  mp4HintSelectable: {
    ru:
      'MP4 использует frame-driven render через WebCodecs и offline audio mix. ' +
      'Если система поддерживает несколько кодеков, здесь можно выбрать нужный.',
    en:
      'MP4 uses frame-driven rendering via WebCodecs and offline audio mixing. ' +
      'If the system supports multiple codecs, you can choose one here.',
  },
  webmHint: {
    ru: 'WebM остаётся резервным браузерным путём и сильнее зависит от поведения браузера в реальном времени.',
    en: 'WebM remains a browser-native fallback path and depends more on the browser’s realtime behavior.',
  },
  burnInSubtitles: {
    ru: 'Вшить субтитры в экспортируемое видео',
    en: 'Burn subtitles into the exported video',
  },
  exportSubtitleFiles: {
    ru: 'Экспортировать субтитры отдельными файлами в форматах SRT и VTT',
    en: 'Export subtitles as separate SRT and VTT files',
  },
  downloadAfterExport: {
    ru: 'Скачивать итоговый файл после успешного рендера',
    en: 'Download the final file after a successful render',
  },
  selectedClipMissing: {
    ru: 'Для экспорта выделенного фрагмента сначала выберите клип на таймлайне.',
    en: 'Select a timeline clip before exporting only the selected clip.',
  },
  cancel: {
    ru: 'Отмена',
    en: 'Cancel',
  },
  submit: {
    ru: 'Запустить экспорт',
    en: 'Start export',
  },
  failureTitle: {
    ru: 'Не удалось экспортировать видео',
    en: 'Video export failed',
  },
  failureDescription: {
    ru: 'Файл не был создан. Настройки экспорта сохранены — можно повторить попытку или закрыть это сообщение.',
    en: 'No file was created. Your export settings are preserved, so you can retry or close this message.',
  },
  failureClose: {
    ru: 'Закрыть',
    en: 'Close',
  },
  failureRetry: {
    ru: 'Повторить экспорт',
    en: 'Retry export',
  },
});
