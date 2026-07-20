import { defineMessageSource } from '../source';

export const videoEditorTimelineAutoTransformMessages = defineMessageSource({
  autoTransform: {
    ru: 'Автообработка',
    en: 'Auto transform',
  },
  autoTransformWizardTitle: {
    ru: 'Автообработка записи',
    en: 'Recording auto transform',
  },
  autoTransformSignalStep: {
    ru: '1. Что искать',
    en: '1. What to detect',
  },
  autoTransformStableDescription: {
    ru: 'Используем пересечение пауз курсора и статичных кадров. Аудио-тишина в этой версии не меняет монтаж.',
    en: 'Use the overlap of cursor pauses and static frames. Audio silence does not change edits in this version.',
  },
  autoTransformDecisionStep: {
    ru: '2. Что сделать',
    en: '2. What to apply',
  },
  autoTransformPreviewStep: {
    ru: '3. Перед применением',
    en: '3. Before applying',
  },
  autoTransformActionSpeedUp: {
    ru: 'Ускорить',
    en: 'Speed up',
  },
  autoTransformActionSpeedUpDescription: {
    ru: 'Сохранить фрагмент, но сжать его по времени.',
    en: 'Keep the segment, but compress it in time.',
  },
  autoTransformActionRemove: {
    ru: 'Удалить',
    en: 'Remove',
  },
  autoTransformActionRemoveDescription: {
    ru: 'Вырезать найденный участок из таймлайна.',
    en: 'Cut the detected segment from the timeline.',
  },
  autoTransformActionSkip: {
    ru: 'Пропустить',
    en: 'Skip',
  },
  autoTransformActionSkipDescription: {
    ru: 'Оставить запись без автоматических правок.',
    en: 'Leave the recording without automatic edits.',
  },
  autoTransformMinDurationLabel: {
    ru: 'Минимум, с',
    en: 'Minimum, s',
  },
  autoTransformSpeedLabel: {
    ru: 'Скорость',
    en: 'Speed',
  },
  autoTransformApply: {
    ru: 'Применить',
    en: 'Apply',
  },
  autoTransformUnavailable: {
    ru: 'Телеметрия записи недоступна для автообработки',
    en: 'Recording telemetry is unavailable for auto transform',
  },
});
