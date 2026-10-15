import { defineMessageSource } from '../source';

export const galleryVideoReviewPreviewMessages = defineMessageSource({
  previewUpdating: { ru: 'Обновление превью', en: 'Updating preview' },
  previewLoading: { ru: 'Подготовка превью', en: 'Preparing preview' },
  previewFailed: { ru: 'Не удалось отобразить превью', en: 'Could not render preview' },
  previewNativeFrameRate: { ru: 'Частота кадров видео', en: 'Video frame rate' },
  previewPresentedFrameRate: { ru: 'Частота отрисовки превью', en: 'Preview presentation rate' },
  previewSettings: { ru: 'Настройки превью', en: 'Preview settings' },
  previewSection: { ru: 'Превью', en: 'Preview' },
  previewResolution: { ru: 'Разрешение', en: 'Resolution' },
  previewCurrent: { ru: 'Текущее', en: 'Current' },
  previewFrameRate: { ru: 'Частота кадров', en: 'Frame rate' },
  previewPaused: { ru: 'На паузе', en: 'When paused' },
  previewPausedSame: { ru: 'То же качество', en: 'Same quality' },
  previewPausedDetailed: { ru: 'Детально', en: 'Detailed' },
  previewShowFrameRate: { ru: 'Показывать FPS', en: 'Show FPS' },
  previewOff: { ru: 'Выкл.', en: 'Off' },
  previewOn: { ru: 'Вкл.', en: 'On' },
  workspaceColor: { ru: 'Цвет рабочей зоны', en: 'Workspace color' },
  workspaceColorAutomatic: { ru: 'Цвет по теме', en: 'Use theme color' },
  previewReset: { ru: 'Сбросить', en: 'Reset' },
  previewActualRaster: { ru: 'Фактическое разрешение превью', en: 'Actual preview resolution' },
  previewOnly: {
    ru: 'Настройки превью не меняют экспортное видео',
    en: 'Preview settings do not change exported video',
  },
  previewFrameRateLimit: {
    ru: 'Верхний предел частоты отрисовки',
    en: 'Maximum presentation frame rate',
  },
  previewSessionOnly: {
    ru: 'Настройки действуют только в этой сессии: сохранить не удалось.',
    en: 'Settings apply to this session only: could not save.',
  },
});
