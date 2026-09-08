import { defineMessageSource } from '../source';

export const videoEditorExportDialogMessages = defineMessageSource({
  title: {
    ru: 'Экспорт видео',
    en: 'Export video',
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
  qualityLow: {
    ru: 'Низкое',
    en: 'Low',
  },
  qualityMedium: {
    ru: 'Среднее',
    en: 'Medium',
  },
  qualityHigh: {
    ru: 'Высокое',
    en: 'High',
  },
  qualityUltra: {
    ru: 'Ультра',
    en: 'Ultra',
  },
  resolutionLabel: {
    ru: 'Разрешение',
    en: 'Resolution',
  },
  resolutionSource: {
    ru: 'Исходное',
    en: 'Source',
  },
  outputSizeLabel: {
    ru: 'Итоговый размер',
    en: 'Output size',
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
    ru: 'Проверяем доступные кодеки MP4…',
    en: 'Checking available MP4 codecs…',
  },
  capabilityFallbackNote: {
    ru: 'Проверка доступных кодеков завершилась с ошибкой:',
    en: 'Codec capability probing failed:',
  },
  mp4HintSingleCodec: {
    ru: 'Для MP4 будет использован кодек, доступный на этом устройстве.',
    en: 'MP4 will use the codec available on this device.',
  },
  mp4HintSelectable: {
    ru: 'Выберите кодек для MP4. В списке — варианты, доступные на этом устройстве.',
    en: 'Choose an MP4 codec from the options available on this device.',
  },
  webmHint: {
    ru: 'Выберите разрешение, качество и частоту кадров для файла WebM.',
    en: 'Choose the resolution, quality and frame rate for your WebM file.',
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
