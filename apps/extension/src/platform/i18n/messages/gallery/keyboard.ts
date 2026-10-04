import { defineMessageSource } from '../source';

export const galleryKeyboardMessages = defineMessageSource({
  title: { ru: 'Клавиатурные команды', en: 'Keyboard commands' },
  list: { ru: 'Список библиотеки', en: 'Library list' },
  navigate: { ru: 'Перейти между материалами', en: 'Move between materials' },
  edges: { ru: 'Первый / последний материал', en: 'First / last material' },
  range: { ru: 'Расширить или сократить выделение', en: 'Extend or shrink selection' },
  toggle: { ru: 'Выбрать / снять выбор материала', en: 'Select / deselect material' },
  open: { ru: 'Открыть просмотр', en: 'Open preview' },
  preview: { ru: 'Просмотр', en: 'Preview' },
  previewNavigate: { ru: 'Предыдущий / следующий материал', en: 'Previous / next material' },
  videoToggle: {
    ru: 'Видео: воспроизведение / пауза при любом фокусе',
    en: 'Video: play / pause from any focused control',
  },
  previewClose: {
    ru: 'Закрыть просмотр и вернуться к материалу',
    en: 'Close preview and return to the material',
  },
  text: { ru: 'Текстовый ввод и другие контролы', en: 'Text inputs and other controls' },
  textBody: {
    ru: 'В текстовых полях списка сочетания сохраняют обычное поведение. Escape в поиске возвращает к списку, сохраняя запрос. Для команд списка меню и диалоги имеют приоритет. Стрелки и Space выбирают материалы только когда фокус на карточке или строке; кнопки внутри сохраняют своё поведение.',
    en: 'List text inputs keep their usual shortcuts. Escape in search returns to the list and preserves the query. Menus and dialogs take priority over list commands. Arrows and Space control materials only when a card or row is focused; buttons inside keep their own behavior.',
  },
});
