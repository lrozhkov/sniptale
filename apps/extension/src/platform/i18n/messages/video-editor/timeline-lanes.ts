import { defineMessageSource } from '../source';

export const videoEditorTimelineLaneMessages = defineMessageSource({
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
    ru: 'Камера',
    en: 'Camera',
  },
  telemetryLane: {
    ru: 'История действий',
    en: 'Action history',
  },
  telemetryLaneMeta: {
    ru: 'Снятые события',
    en: 'Captured events',
  },
  telemetryLaneEmpty: {
    ru: 'Полезные сигналы записи появятся здесь, когда для проекта доступна телеметрия.',
    en: 'Useful recording signals will appear here when telemetry is available for the project.',
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
