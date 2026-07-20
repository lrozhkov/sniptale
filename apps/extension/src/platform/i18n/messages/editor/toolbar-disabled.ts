import { defineMessageSource } from '../source';

export const editorToolbarDisabledMessages = defineMessageSource({
  undoUnavailableReason: {
    ru: 'Нет изменений для отмены',
    en: 'No changes to undo',
  },
  redoUnavailableReason: {
    ru: 'Нечего повторять',
    en: 'Nothing to redo',
  },
  historyUnavailableTitle: {
    ru: 'История пока пуста',
    en: 'History is empty for now',
  },
  historyUnavailableDescription: {
    ru: 'Измените изображение, и здесь появятся действия для отмены и повтора.',
    en: 'Make an edit and undo or redo actions will appear here.',
  },
  documentRequiredReason: {
    ru: 'Сначала откройте изображение',
    en: 'Open an image first',
  },
  selectionRequiredReason: {
    ru: 'Сначала выберите объект',
    en: 'Select an object first',
  },
  layerSelectionRequiredReason: {
    ru: 'Сначала выберите слой',
    en: 'Select a layer first',
  },
  layerSelectionRequiredTitle: {
    ru: 'Перестановка слоёв недоступна',
    en: 'Layer reordering is unavailable',
  },
  layerSelectionRequiredDescription: {
    ru: 'Выберите слой на холсте или в списке, чтобы менять его порядок.',
    en: 'Select a layer on the canvas or in the list to change its order.',
  },
});
