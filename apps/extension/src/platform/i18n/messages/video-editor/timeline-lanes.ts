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
  motionLane: {
    ru: 'Зум',
    en: 'Zoom',
  },
  historyClick: { ru: 'Клик', en: 'Click' },
  historyKeys: { ru: 'Клавиши', en: 'Keys' },
  historyScroll: { ru: 'Прокрутка', en: 'Scroll' },
  historyPause: { ru: 'Пауза', en: 'Pause' },
  historyCallout: { ru: 'Акцент', en: 'Accent' },
  historySelectTrack: {
    ru: 'Выберите дорожку истории действий',
    en: 'Select the action history track',
  },
  historyAddClick: { ru: 'Добавить клик', en: 'Add click' },
  historyOriginalTime: { ru: 'Исходное время', en: 'Original time' },
  historyTyping: { ru: 'Ввод текста', en: 'Typing' },
  historyStable: { ru: 'Без изменений', en: 'Stable interval' },
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
