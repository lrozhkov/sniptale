import { defineMessageSource } from '../source';

export const galleryVideoReviewTargetMessages = defineMessageSource({
  targetType: { ru: 'Тип элемента', en: 'Element type' },
  targetAll: { ru: 'Все элементы', en: 'All elements' },
  'target_text-field': { ru: 'Поле ввода', en: 'Text field' },
  'target_number-field': { ru: 'Числовое поле', en: 'Number field' },
  'target_other-control': { ru: 'Другой элемент управления', en: 'Other control' },
  target_button: { ru: 'Кнопка', en: 'Button' },
  target_link: { ru: 'Ссылка', en: 'Link' },
  target_checkbox: { ru: 'Флажок', en: 'Checkbox' },
  target_radio: { ru: 'Радиокнопка', en: 'Radio button' },
  target_switch: { ru: 'Переключатель', en: 'Switch' },
  target_select: { ru: 'Список выбора', en: 'Select' },
  target_listbox: { ru: 'Список', en: 'List box' },
  target_combobox: { ru: 'Комбинированный список', en: 'Combo box' },
  target_slider: { ru: 'Ползунок', en: 'Slider' },
  target_tab: { ru: 'Вкладка', en: 'Tab' },
  target_menuitem: { ru: 'Пункт меню', en: 'Menu item' },
  target_unknown: { ru: 'Не определён', en: 'Unknown' },
  clickRecordedAt: { ru: 'Время записи', en: 'Recorded time' },
  clickTarget: { ru: 'Нажатый элемент', en: 'Clicked element' },
});
