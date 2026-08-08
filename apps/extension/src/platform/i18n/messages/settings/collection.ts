import { defineMessageSource } from '../source';

export const settingsCollectionMessages = defineMessageSource({
  actions: {
    edit: { en: 'Edit', ru: 'Редактировать' },
    enable: { en: 'Enable', ru: 'Включить' },
    disable: { en: 'Disable', ru: 'Выключить' },
    setDefault: { en: 'Make default', ru: 'Сделать по умолчанию' },
    reset: { en: 'Reset', ru: 'Сбросить' },
    delete: { en: 'Delete', ru: 'Удалить' },
    menu: { en: 'Actions', ru: 'Действия' },
    moveUp: { en: 'Move up', ru: 'Переместить вверх' },
    moveDown: { en: 'Move down', ru: 'Переместить вниз' },
  },
  defaultBadge: { en: 'Default', ru: 'По умолчанию' },
  dragHandle: { en: 'Change position', ru: 'Изменить позицию' },
  dragInstructions: {
    en: 'Press Space to pick up an item, use Arrow Up or Arrow Down to move it, and press Space again to drop it.',
    ru: 'Нажмите Пробел, чтобы взять элемент, перемещайте его стрелками вверх и вниз и снова нажмите Пробел, чтобы отпустить.',
  },
  announcements: {
    pickedUp: { en: 'Item picked up', ru: 'Элемент взят' },
    moved: { en: 'Item moved', ru: 'Элемент перемещён' },
    cancelled: { en: 'Move cancelled', ru: 'Перемещение отменено' },
  },
});
