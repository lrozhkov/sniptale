import { defineMessageSource } from '../source';

export const viewportPresetsMessages = defineMessageSource({
  section: {
    subtitle: {
      ru: 'Размеры области страницы и окна браузера для снимков и записи',
      en: 'Page viewport and browser window sizes for captures and recordings',
    },
    nativeOption: {
      ru: 'Текущий размер',
      en: 'Current size',
    },
    savedLabel: {
      ru: 'Шаблоны размеров',
      en: 'Size presets',
    },
    emptyTitle: {
      ru: 'Нет доступных шаблонов',
      en: 'No presets available',
    },
    emptyDescription: {
      ru: 'Добавьте пользовательский размер области страницы или окна браузера',
      en: 'Add a custom page viewport or browser window size',
    },
    addButton: {
      ru: 'Добавить шаблон',
      en: 'Add preset',
    },
    deleteTitle: {
      ru: 'Удалить шаблон?',
      en: 'Delete preset?',
    },
    deleteMessagePrefix: {
      ru: 'Вы уверены, что хотите удалить шаблон',
      en: 'Are you sure you want to delete the preset',
    },
    deleteMessageSuffix: {
      ru: '?',
      en: '?',
    },
  },
  editor: {
    editTitle: {
      ru: 'Редактировать шаблон',
      en: 'Edit preset',
    },
    newTitle: {
      ru: 'Новый шаблон',
      en: 'New preset',
    },
    nameLabel: {
      ru: 'Название',
      en: 'Name',
    },
    namePlaceholder: {
      ru: 'Например: Демо на ноутбуке',
      en: 'Example: Laptop demo',
    },
    nameHint: {
      ru: 'До 80 символов.',
      en: 'Up to 80 characters.',
    },
    targetLabel: {
      ru: 'Что изменять',
      en: 'Resize',
    },
    targetViewport: {
      ru: 'Область страницы',
      en: 'Page viewport',
    },
    targetWindow: {
      ru: 'Окно браузера',
      en: 'Browser window',
    },
    targetViewportHint: {
      ru: 'Меняет размер страницы внутри вкладки. Окно и масштаб браузера не изменяются.',
      en: 'Changes the page size inside the tab. The browser window and zoom stay unchanged.',
    },
    targetWindowHint: {
      ru: 'Меняет внешний размер окна Chrome, включая рамку и панели.',
      en: 'Changes the outer Chrome window size, including its frame and toolbars.',
    },
    widthLabel: {
      ru: 'Ширина',
      en: 'Width',
    },
    heightLabel: {
      ru: 'Высота',
      en: 'Height',
    },
    saving: {
      ru: 'Сохранение...',
      en: 'Saving...',
    },
    create: {
      ru: 'Создать',
      en: 'Create',
    },
  },
  messages: {
    presetUpdated: {
      ru: 'Шаблон обновлён',
      en: 'Preset updated',
    },
    presetCreated: {
      ru: 'Шаблон создан',
      en: 'Preset created',
    },
    presetDeleted: {
      ru: 'Шаблон удалён',
      en: 'Preset deleted',
    },
    presetReset: {
      ru: 'Системный шаблон восстановлен',
      en: 'System preset reset',
    },
    presetEnabled: {
      ru: 'Шаблон включён',
      en: 'Preset enabled',
    },
    presetDisabled: {
      ru: 'Шаблон выключен',
      en: 'Preset disabled',
    },
    updateFailed: {
      ru: 'Не удалось сохранить изменения. Попробуйте ещё раз.',
      en: 'Could not save the changes. Please try again.',
    },
  },
  groups: {
    viewport: {
      ru: 'Область страницы',
      en: 'Page viewport',
    },
    window: {
      ru: 'Окно браузера',
      en: 'Browser window',
    },
  },
  hints: {
    viewport: {
      ru: 'Страница внутри вкладки; окно и масштаб не меняются.',
      en: 'Page inside the tab; window and zoom stay unchanged.',
    },
    window: {
      ru: 'Внешний размер Chrome; снимок и видео могут отличаться.',
      en: 'Outer Chrome size; capture and video dimensions may differ.',
    },
    systemPreset: {
      ru: 'Системный шаблон можно изменить, выключить или восстановить.',
      en: 'A system preset can be edited, disabled, or reset.',
    },
  },
  actions: {
    enable: {
      ru: 'Включить шаблон',
      en: 'Enable preset',
    },
    disable: {
      ru: 'Выключить шаблон',
      en: 'Disable preset',
    },
    reset: {
      ru: 'Восстановить системный шаблон',
      en: 'Reset system preset',
    },
    moveUp: {
      ru: 'Переместить выше',
      en: 'Move up',
    },
    moveDown: {
      ru: 'Переместить ниже',
      en: 'Move down',
    },
  },
  availability: {
    checking: {
      ru: 'Проверяем доступность…',
      en: 'Checking availability…',
    },
    availableSize: {
      ru: 'Доступно',
      en: 'Available',
    },
    pendingVideo: {
      ru: 'Точный размер видео проверим при запуске.',
      en: 'The exact video size is checked at start.',
    },
    screenUnsupported: {
      ru: 'Для записи экрана шаблоны недоступны: источник выбирается в системном окне.',
      en: 'Presets are unavailable for screen recording because the source is selected by the system picker.',
    },
    cropViewportUnsupported: {
      ru:
        'Размер области страницы недоступен при записи выбранной области. ' +
        'Используйте текущий размер или размер окна.',
      en:
        'Page viewport sizing is unavailable while recording a selected area. ' +
        'Use the current size or a window size.',
    },
    viewportTooLarge: {
      ru: 'Не помещается в текущей области вкладки.',
      en: 'Does not fit the current tab area.',
    },
    windowTooLarge: {
      ru: 'Не помещается в рабочей области текущего экрана.',
      en: 'Does not fit the current display work area.',
    },
    windowNotNormal: {
      ru: 'Сначала верните окно браузера в обычный режим.',
      en: 'Restore the browser window to its normal state first.',
    },
    zoomNot100: {
      ru: 'Для точной записи области страницы установите масштаб вкладки 100%.',
      en: 'Set the tab zoom to 100% for exact page-viewport recording.',
    },
    busy: {
      ru: 'Другая операция уже управляет размером этого окна.',
      en: 'Another operation is already controlling this window size.',
    },
    disabled: {
      ru: 'Шаблон выключен в настройках.',
      en: 'This preset is disabled in settings.',
    },
    missing: {
      ru: 'Шаблон больше не существует.',
      en: 'This preset no longer exists.',
    },
    unsupported: {
      ru: 'Шаблон недоступен в этом режиме.',
      en: 'This preset is unavailable in this mode.',
    },
    permissionDenied: {
      ru: 'Недостаточно разрешений для изменения размера.',
      en: 'Permission to change this size is unavailable.',
    },
    authorizationExpired: {
      ru: 'Не удалось изменить размер. Повторите выбор.',
      en: 'The size could not be changed. Select it again.',
    },
    platformRejected: {
      ru: 'Chrome не смог проверить этот размер. Попробуйте ещё раз.',
      en: 'Chrome could not verify this size. Try again.',
    },
    verificationFailed: {
      ru: 'Chrome не подтвердил точный размер.',
      en: 'Chrome could not confirm the exact size.',
    },
    sourceDimensionsMismatch: {
      ru: 'Chrome не смог подготовить видеопоток точного размера. Выберите другой размер и повторите запись.',
      en: 'Chrome could not prepare an exact-size video stream. Select another size and try recording again.',
    },
    staleRequest: {
      ru: 'Размер уже изменился. Выберите нужный вариант ещё раз.',
      en: 'The size has already changed. Select the option you want again.',
    },
    restoreConflict: {
      ru: 'Размер был изменён вручную, поэтому Sniptale не стал его перезаписывать.',
      en: 'The size was changed manually, so Sniptale did not overwrite it.',
    },
    restoreImpossible: {
      ru: 'Chrome не смог восстановить предыдущий размер.',
      en: 'Chrome could not restore the previous size.',
    },
    unavailable: {
      ru: 'Шаблон сейчас недоступен.',
      en: 'This preset is currently unavailable.',
    },
  },
  systemNames: {
    viewportMobilePortrait: { ru: 'Смартфон — портрет', en: 'Phone — portrait' },
    viewportMobileLandscape: { ru: 'Смартфон — альбом', en: 'Phone — landscape' },
    viewportTabletPortrait: { ru: 'Планшет — портрет', en: 'Tablet — portrait' },
    viewportTabletLandscape: { ru: 'Планшет — альбом', en: 'Tablet — landscape' },
    viewportHd: { ru: 'Область страницы HD', en: 'HD page viewport' },
    viewportFullHd: { ru: 'Область страницы Full HD', en: 'Full HD page viewport' },
    windowHd: { ru: 'Окно HD', en: 'HD window' },
    windowLaptop: { ru: 'Окно ноутбука', en: 'Laptop window' },
    windowDesktop: { ru: 'Окно рабочего стола', en: 'Desktop window' },
    windowFullHd: { ru: 'Окно Full HD', en: 'Full HD window' },
  },
});
