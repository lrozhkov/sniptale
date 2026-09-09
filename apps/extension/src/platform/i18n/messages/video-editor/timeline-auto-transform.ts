import { defineMessageSource } from '../source';

export const videoEditorTimelineAutoTransformMessages = defineMessageSource({
  autoTyping: { ru: 'Ввод текста', en: 'Typing' },
  autoDetectionHelp: {
    ru: 'Пауза — мышь неподвижна и нет действий. Если в записи есть звук, сокращаем только тишину, в том числе при вводе текста.',
    en: 'Pauses have a stationary mouse and no actions. When the recording has audio, only silent time is shortened, including typing.',
  },
  autoFramingStrength: { ru: 'Приближение', en: 'Zoom strength' },
  autoFramingSubtle: { ru: 'Мягкое · 1,25×', en: 'Subtle · 1.25×' },
  autoFramingBalanced: { ru: 'Обычное · 1,4×', en: 'Balanced · 1.4×' },
  autoFramingClose: { ru: 'Крупно · 1,7×', en: 'Close · 1.7×' },
  autoFramingHelp: {
    ru: 'Плавно приближает к кликам и возвращает общий план. Существующие области масштабирования сохраняются.',
    en: 'Smoothly zooms to clicks, then returns to the full frame. Existing zoom regions are preserved.',
  },
  autoAudioUnavailable: {
    ru: 'Не удалось проверить звук. Сокращение ввода и пауз для этих записей пропущено; попробуйте повторить анализ.',
    en: 'Audio could not be analyzed. Typing and pause edits for these recordings were skipped; try analyzing again.',
  },
  autoIdleDetected: { ru: 'Пауза без действий', en: 'Idle pause' },

  autoTransform: {
    ru: 'Автообработка',
    en: 'Auto edit',
  },
  autoTransformWizardTitle: {
    ru: 'Автообработка фрагментов',
    en: 'Process selected clips',
  },
  autoTransformSignalStep: {
    ru: '1. Что искать',
    en: '1. What to detect',
  },
  autoTransformStableDescription: {
    ru: 'Сократите ввод и паузы, добавьте приближение к действиям. Сначала проверьте предлагаемые изменения.',
    en: 'Shorten typing and pauses, and zoom in on actions. Review the proposed changes before applying.',
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
    ru: 'Оставить',
    en: 'Keep',
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
    en: 'Recording action history is unavailable for auto transform',
  },
  autoSettings: { ru: 'Обработка', en: 'Processing' },
  autoSetupStep: { ru: 'Фрагменты и настройки', en: 'Clips and settings' },
  autoReviewStep: { ru: 'Проверка изменений', en: 'Review changes' },
  autoSteps: { ru: 'Этапы автообработки', en: 'Processing steps' },
  autoBack: { ru: 'Назад', en: 'Back' },
  autoShorterBy: { ru: 'Проект короче на', en: 'Project shorter by' },
  autoSelectionChanged: {
    ru: 'Пересчитайте результат для выбранных изменений.',
    en: 'Recalculate the result for your selection.',
  },
  autoApplying: { ru: 'Применение…', en: 'Applying…' },
  autoFraming: { ru: 'Кадрирование', en: 'Framing' },
  autoScope: { ru: 'Фрагменты', en: 'Clips' },
  autoSeconds: { ru: 'с', en: 's' },
  autoChooseClips: {
    ru: 'Выберите фрагменты. Повторные вставки выбираются отдельно.',
    en: 'Choose clips. Repeated placements are selected separately.',
  },
  autoLinked: { ru: 'Связанных дорожек:', en: 'Linked tracks:' },
  autoIdle: { ru: 'Паузы', en: 'Idle intervals' },
  autoCamera: { ru: 'Приближать к кликам', en: 'Zoom in on clicks' },
  autoMore: { ru: 'Настройки поиска пауз', en: 'Idle detection settings' },
  autoShoulder: { ru: 'Отступ, с', en: 'Shoulder, s' },
  autoMergeGap: { ru: 'Объединять, с', en: 'Merge gap, s' },
  autoReview: { ru: 'Рассчитать изменения', en: 'Review changes' },
  autoWorking: { ru: 'Расчёт…', en: 'Calculating\u2026' },
  autoSuggestions: { ru: '2. Предложения', en: '2. Suggestions' },
  autoViewOriginal: { ru: 'Показать исходный интервал', en: 'View original interval' },
  autoProjectDuration: { ru: 'Длительность проекта', en: 'Project duration' },
  autoTail: { ru: 'Изменение длительности', en: 'Duration change' },
  autoAffected: { ru: 'Изменённых фрагментов', en: 'Changed clips' },
  autoShifted: { ru: 'Сдвинутых фрагментов', en: 'Shifted clips' },
  autoOneUndo: { ru: 'Можно отменить одним действием', en: 'Undo in one step' },
  autoStale: {
    ru: 'Проект или данные записи изменились. Рассчитайте изменения заново.',
    en: 'The project or recording data changed. Review changes again.',
  },
  autoNoChanges: {
    ru: 'Нет изменений для выбранных настроек.',
    en: 'No changes for these settings.',
  },
  autoBatchBlocked: {
    ru: 'Выбранные изменения нельзя применить вместе. Снимите конфликтующее предложение и пересчитайте.',
    en: 'These changes cannot be applied together. Deselect the conflicting suggestion and review again.',
  },
  autoBlockedLocked: { ru: 'Дорожка заблокирована', en: 'Track locked' },
  autoBlockedLinked: {
    ru: 'Связанные фрагменты имеют несовместимое время',
    en: 'Linked clips have incompatible timing',
  },
  autoBlockedOverlap: {
    ru: 'Сдвиг создаёт пересечение фрагментов',
    en: 'The shift would overlap clips',
  },
  autoBlockedRange: {
    ru: 'Интервал недоступен для этого изменения',
    en: 'This interval cannot accept the change',
  },
  autoOriginal: { ru: 'Исходный интервал', en: 'Original interval' },
  autoOriginalPlayback: {
    ru: 'Для просмотра используйте воспроизведение на таймлайне.',
    en: 'Use the timeline playback controls to view the original.',
  },
  autoReturn: { ru: 'Вернуться к изменениям', en: 'Return to review' },
  autoSelected: { ru: 'Выбрано', en: 'Selected' },
  autoUnavailableCount: { ru: 'Недоступно', en: 'Unavailable' },
  autoChanges: { ru: 'изменений', en: 'changes' },
  autoGeometryUnavailable: {
    ru: 'Нет координат клика для кадрирования',
    en: 'Click coordinates are unavailable for framing',
  },
});
