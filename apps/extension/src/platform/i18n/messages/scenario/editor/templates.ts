import { defineMessageSource } from '../../source';
export const scenarioStepTemplateMessages = defineMessageSource({
  stepTemplates: { ru: 'Мои макеты', en: 'My layouts' },
  templateChoose: { ru: 'Выбрать макет', en: 'Choose a layout' },
  templateLoading: { ru: 'Загрузка макетов…', en: 'Loading layouts…' },
  templateLoadFailed: {
    ru: 'Не удалось загрузить макеты. Повторите попытку.',
    en: 'Could not load layouts. Try again.',
  },
  templateAppearanceOnly: { ru: 'Применить оформление', en: 'Apply appearance' },
  templateKeepImage: { ru: 'Применить, сохранив изображение', en: 'Apply and keep image' },
  templateReplaceContent: { ru: 'Заменить содержимое шага', en: 'Replace step content' },
  templateApplyHelp: {
    ru: 'Оформление сохраняет ваш текст и изображения. Замена использует содержимое макета. Оба действия можно отменить.',
    en: 'Appearance keeps your text and images. Replacement uses the layout content. Both actions can be undone.',
  },
  templateEmpty: {
    ru: 'Сохраните шаг как макет, чтобы использовать его снова.',
    en: 'Save a step as a layout to reuse it.',
  },
  templateSave: { ru: 'Сохранить как макет', en: 'Save as layout' },
  templateName: { ru: 'Название макета', en: 'Layout name' },
  templateSaved: {
    ru: 'Макет сохранён в настройках → Стили и шаблоны.',
    en: 'Layout saved in Settings → Styles and templates.',
  },
  templateFailed: {
    ru: 'Не удалось сохранить или применить макет. Текущее содержимое шага не изменено. Повторите попытку.',
    en: 'Could not save or apply the layout. Your step is preserved; try again.',
  },
  templateCatalogFailed: {
    ru: 'Не удалось выполнить действие с макетом. Повторите попытку.',
    en: 'Could not complete the layout action. Try again.',
  },
  templateCatalogHelp: {
    ru: 'Макеты содержат оформление, текст и собственные копии изображений. Откройте макет, чтобы изменить его название, блоки и настройки.',
    en: 'Layouts include appearance, text and independent image copies. Open a layout to edit its name, blocks and settings.',
  },
  templateCreate: { ru: 'Создать макет', en: 'Create layout' },
  templateDefaultName: { ru: 'Новый макет', en: 'New layout' },
  templateDeleteTitle: { ru: 'Удалить макет?', en: 'Delete layout?' },
  templateDeleteHelp: {
    ru: 'Макет и его ресурсы будут удалены. Шаги, в которых он уже применён, сохранятся.',
    en: 'The layout and its resources will be deleted. Steps that already use it will be kept.',
  },
  templateUnavailable: { ru: 'Макет недоступен', en: 'Layout unavailable' },
  templateEditing: { ru: 'Редактирование макета', en: 'Editing layout' },
});
