import { defineMessageSource } from '../../source';

export const videoEditorSidebarSelectionMotionPathMessages = defineMessageSource({
  motionPathSummary: {
    ru: 'Путь камеры',
    en: 'Camera path',
  },
  motionPathTimeline: {
    ru: 'Таймлайн пути',
    en: 'Path timeline',
  },
  motionPathStopLabel: {
    ru: 'Точка',
    en: 'Stop',
  },
  motionPathSegmentLabel: {
    ru: 'Переход',
    en: 'Segment',
  },
  motionPathStopCountUnit: {
    ru: 'точки',
    en: 'stops',
  },
  motionPathAddStop: {
    ru: 'Добавить точку',
    en: 'Add stop',
  },
  motionPathDuplicateStop: {
    ru: 'Дублировать',
    en: 'Duplicate',
  },
  motionPathDeleteStop: {
    ru: 'Удалить точку',
    en: 'Delete stop',
  },
  motionPathGenerateFromCursor: {
    ru: 'Сгенерировать по курсору',
    en: 'Generate from cursor',
  },
  motionPathTargetLabel: {
    ru: 'Тип цели',
    en: 'Target type',
  },
  motionPathTargetPoint: {
    ru: 'Точка',
    en: 'Point',
  },
  motionPathTargetArea: {
    ru: 'Область',
    en: 'Area',
  },
  motionPathTrajectoryLabel: {
    ru: 'Траектория',
    en: 'Trajectory',
  },
  motionPathTrajectoryLinear: {
    ru: 'Прямая',
    en: 'Linear',
  },
  motionPathTrajectorySoftArc: {
    ru: 'Мягкая дуга',
    en: 'Soft arc',
  },
  motionPathSpeedLabel: {
    ru: 'Скорость сегмента',
    en: 'Segment speed',
  },
  motionPathPickStopPoint: {
    ru: 'Указать точку на сцене',
    en: 'Pick point on stage',
  },
  motionPathPickStopArea: {
    ru: 'Указать область на сцене',
    en: 'Pick area on stage',
  },
  motionPathPointPickHint: {
    ru: 'Кликните по полотну, чтобы переставить точку пути.',
    en: 'Click on the canvas to place the path stop.',
  },
  motionPathAreaPickHint: {
    ru: 'Протяните по полотну, чтобы задать область остановки.',
    en: 'Drag on the canvas to define the stop area.',
  },
});
