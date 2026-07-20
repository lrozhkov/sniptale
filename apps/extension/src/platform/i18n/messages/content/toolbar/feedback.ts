import { defineMessageSource } from '../../source';

export const contentToolbarFeedbackMessages = defineMessageSource({
  screenshotModeEnabled: {
    ru: 'Режим скриншота включён',
    en: 'Screenshot mode enabled',
  },
  screenshotModeDisabled: {
    ru: 'Режим скриншота отключён',
    en: 'Screenshot mode disabled',
  },
  highlighterModeEnabled: {
    ru: 'Режим выделения включён.',
    en: 'Highlight mode enabled.',
  },
  highlighterModeEnabledHint: {
    ru: 'Кликните на элементы для создания рамок.',
    en: 'Click elements to create frames.',
  },
  highlighterModeDisabled: {
    ru: 'Режим выделения отключён',
    en: 'Highlight mode disabled',
  },
  allFramesCleared: {
    ru: 'Все рамки очищены',
    en: 'All frames cleared',
  },
  quickEditModeEnabled: {
    ru: 'Режим редактирования включён.',
    en: 'Edit mode enabled.',
  },
  quickEditModeEnabledHint: {
    ru: 'Кликните на текст для редактирования.',
    en: 'Click text to edit it.',
  },
  quickEditModeDisabled: {
    ru: 'Режим редактирования отключён',
    en: 'Edit mode disabled',
  },
  navigationDisabled: {
    ru: 'Интерактивные элементы заблокированы',
    en: 'Interactive elements are blocked',
  },
  navigationEnabled: {
    ru: 'Интерактивные элементы разблокированы',
    en: 'Interactive elements are unblocked',
  },
  selectionCancelled: {
    ru: 'Выделение отменено',
    en: 'Selection cancelled',
  },
  selectionErrorPrefix: {
    ru: 'Ошибка скриншота:',
    en: 'Screenshot error:',
  },
  unknownErrorWithArticle: {
    ru: 'Неизвестная ошибка',
    en: 'Unknown error',
  },
  countdownCancelled: {
    ru: 'Таймер скриншота отменён',
    en: 'Screenshot timer cancelled',
  },
  aiPickModeDisabled: {
    ru: 'Режим выбора контента отключён',
    en: 'Content selection mode disabled',
  },
  aiPickStart: {
    ru: 'Кликните на элемент для AI обработки',
    en: 'Click an element for AI processing',
  },
  aiPromptRequired: {
    ru: 'Введите запрос для AI',
    en: 'Enter a prompt for AI',
  },
  aiNoData: {
    ru: 'Нет данных для обработки',
    en: 'No data to process',
  },
  aiNoBackgroundResponse: {
    ru: 'Нет ответа от background script. Попробуйте перезагрузить расширение.',
    en: 'No response from the background script. Try reloading the extension.',
  },
  aiEmptyResponse: {
    ru: 'Пустой ответ от AI',
    en: 'Empty response from AI',
  },
  aiParseErrorsPrefix: {
    ru: 'Ошибки парсинга:',
    en: 'Parsing errors:',
  },
  aiNoChanges: {
    ru: 'AI не внёс изменений',
    en: 'AI made no changes',
  },
  aiAppliedWithMissingPrefix: {
    ru: 'Применено ',
    en: 'Applied ',
  },
  aiAppliedWithMissingMiddle: {
    ru: ', не найдено: ',
    en: ', not found: ',
  },
  aiAppliedSuccessPrefix: {
    ru: 'Успешно применено ',
    en: 'Successfully applied ',
  },
  aiAppliedSuccessSuffix: {
    ru: ' изменений',
    en: ' changes',
  },
  aiErrorPrefix: {
    ru: 'Ошибка AI:',
    en: 'AI error:',
  },
});
