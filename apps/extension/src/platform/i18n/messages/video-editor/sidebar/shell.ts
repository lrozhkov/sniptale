import { defineMessageSource } from '../../source';

export const videoEditorSidebarShellMessages = defineMessageSource({
  projectInspector: {
    ru: 'Инспектор проекта',
    en: 'Project inspector',
  },
  collapseInspector: {
    ru: 'Сжать инспектор',
    en: 'Collapse inspector',
  },
  projectTitle: {
    ru: 'Проект',
    en: 'Project',
  },
  projectClipCountSuffix: {
    ru: 'клипов',
    en: 'clips',
  },
  canvasWidthLabel: {
    ru: 'Ширина полотна',
    en: 'Canvas width',
  },
  canvasHeightLabel: {
    ru: 'Высота полотна',
    en: 'Canvas height',
  },
  selectInputLabel: {
    ru: 'Выбор значения',
    en: 'Value selector',
  },
  timelinePlacementLabel: {
    ru: 'Режим монтажа',
    en: 'Editing mode',
  },
  timelinePlacementRipple: {
    ru: 'Рипл-сдвиг',
    en: 'Ripple push',
  },
  timelinePlacementOverwrite: {
    ru: 'Перезапись',
    en: 'Overwrite',
  },
  timelinePlacementOverlap: {
    ru: 'Перекрытие',
    en: 'Overlap',
  },
  timelinePlacementHint: {
    ru: [
      'Рипл-сдвиг сдвигает последующие клипы, перезапись вырезает пересечения,',
      'а перекрытие оставляет overlap для crossfade.',
    ].join(' '),
    en: [
      'Ripple push moves following clips, overwrite cuts intersections,',
      'and overlap preserves overlap for crossfades.',
    ].join(' '),
  },
  projectBackgroundLabel: {
    ru: 'Фон проекта',
    en: 'Project background',
  },
  expandInspector: {
    ru: 'Развернуть инспектор',
    en: 'Expand inspector',
  },
  collapsedSelectionTitle: {
    ru: 'Выбор',
    en: 'Selection',
  },
  diagnosticsTitle: {
    ru: 'Диагностика',
    en: 'Diagnostics',
  },
  diagnosticsNoRecording: {
    ru: 'Для этого проекта исходная запись не указана.',
    en: 'No source recording is linked to this project.',
  },
});
