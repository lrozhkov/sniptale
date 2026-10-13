import { defineMessageSource } from '../source';

export const videoEditorTimelineLaneMessages = defineMessageSource({
  hideTrackNames: {
    ru: 'Скрыть названия дорожек',
    en: 'Hide track names',
  },
  transitionLane: {
    ru: 'Переходы',
    en: 'Transitions',
  },
  cursorLane: {
    ru: 'Курсор',
    en: 'Cursor',
  },
  followLane: {
    ru: 'Follow',
    en: 'Follow',
  },
  sceneEffectsLane: {
    ru: 'Эффекты сцены',
    en: 'Scene effects',
  },
  sceneEffectsTarget: {
    ru: 'Сцена',
    en: 'Scene',
  },
  templateStateDisabled: {
    ru: 'Выключено',
    en: 'Disabled',
  },
  templateStateWarning: {
    ru: 'Проблема с target',
    en: 'Target warning',
  },
  actionsLane: {
    ru: 'Действия',
    en: 'Actions',
  },
  motionSegment: { ru: 'Масштабирование', en: 'Zoom' },
  motionLane: {
    ru: 'Масштаб',
    en: 'Zoom',
  },
  historyKeyboardCoverage: {
    ru: 'В браузерной записи сохраняются только клавиши, переданные записываемой странице. Системные и браузерные сочетания могут отсутствовать.',
    en: 'Browser recordings capture only keys delivered to the recorded page. System and browser shortcuts may be absent.',
  },
  historyKeyboard: { ru: 'Клавиатура', en: 'Keyboard' },
  historyMouse: { ru: 'Мышь', en: 'Mouse' },
  historyClick: { ru: 'Клик', en: 'Click' },
  historyKeys: { ru: 'Клавиши', en: 'Keys' },
  historyScroll: { ru: 'Прокрутка', en: 'Scroll' },
  historyWheel: { ru: 'Колесо мыши', en: 'Mouse wheel' },
  historyHold: { ru: 'Удержание кнопки мыши', en: 'Mouse hold' },
  historyIncompletePress: { ru: 'Незавершённое нажатие', en: 'Incomplete press' },
  historyDrag: { ru: 'Перетаскивание', en: 'Drag' },
  historySelection: { ru: 'Выделение', en: 'Selection' },
  historyNativeDrag: { ru: 'Перетаскивание объекта', en: 'Native drag' },
  historyKeyHold: { ru: 'Удержание клавиши', en: 'Held key' },
  historyKeyModifiers: { ru: 'Сочетание модификаторов', en: 'Modifier combination' },
  historyButtonLeft: { ru: 'Левая кнопка мыши', en: 'Left button' },
  historyButtonMiddle: { ru: 'Средняя кнопка мыши', en: 'Middle button' },
  historyButtonRight: { ru: 'Правая кнопка мыши', en: 'Right button' },
  historyButtonBack: { ru: 'Кнопка мыши «Назад»', en: 'Back button' },
  historyButtonForward: { ru: 'Кнопка мыши «Вперёд»', en: 'Forward button' },
  historyButtonOther: { ru: 'Кнопка мыши {number}', en: 'Mouse button {number}' },
  historyPause: { ru: 'Пауза', en: 'Pause' },
  historyCallout: { ru: 'Акцент', en: 'Accent' },
  historySelectTrack: {
    ru: 'Выберите дорожку истории действий',
    en: 'Select the action history track',
  },
  historyAddClick: { ru: 'Добавить клик', en: 'Add click' },
  historyOriginalTime: { ru: 'Исходное время', en: 'Original time' },
  historyCursorUnavailable: {
    ru: 'Наблюдение за курсором недоступно',
    en: 'Cursor observation unavailable',
  },
  historyCursorUnknown: { ru: 'Покрытие курсора неизвестно', en: 'Cursor coverage unknown' },
  historyCursorEmpty: { ru: 'Нет записанных движений курсора', en: 'No cursor activity recorded' },
  historyCursorGap: { ru: 'Нет наблюдений курсора', en: 'Cursor observation gap' },
  historyCursorDwell: { ru: 'Остановка курсора', en: 'Cursor dwell' },
  historyCursorMove: { ru: 'Движение курсора', en: 'Cursor movement' },
  historyTyping: { ru: 'Ввод текста', en: 'Typing' },
  historyEnabled: { ru: 'Визуализация включена', en: 'Visualization enabled' },
  historyDisabled: { ru: 'Визуализация выключена', en: 'Visualization disabled' },
  historySuppressed: { ru: 'Повтор подавлен', en: 'Repeated event suppressed' },
  historyOverride: { ru: 'Индивидуальные настройки', en: 'Custom settings' },
  telemetryLane: {
    ru: 'История действий',
    en: 'Action history',
  },
  telemetryLaneMeta: {
    ru: 'Снятые события',
    en: 'Captured events',
  },
  telemetryLaneEmpty: {
    ru: 'События и интервалы записи появятся здесь.',
    en: 'Recording events and intervals appear here.',
  },
  telemetryToggle: {
    ru: 'История действий',
    en: 'Action history',
  },
  trackPanelCompactToggle: {
    ru: 'Компактный режим дорожек',
    en: 'Compact track rows',
  },
  laneVisible: {
    ru: 'Видна',
    en: 'Visible',
  },
  laneHidden: {
    ru: 'Скрыта',
    en: 'Hidden',
  },
  laneLocked: {
    ru: 'Заблокирована',
    en: 'Locked',
  },
  laneEditable: {
    ru: 'Редактируется',
    en: 'Editable',
  },
  clearLane: {
    ru: 'Очистить',
    en: 'Clear',
  },
  addLogicalLane: {
    ru: 'Добавить линию клипов',
    en: 'Add clip line',
  },
  logicalLaneLabel: {
    ru: 'Линия {index}',
    en: 'Line {index}',
  },
});
