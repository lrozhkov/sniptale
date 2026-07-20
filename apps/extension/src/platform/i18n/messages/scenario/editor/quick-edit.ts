import {
  blurStrengthMessage,
  blurTypeDistortionMessage,
  blurTypeGaussianMessage,
  blurTypeLabelMessage,
  blurTypePixelateMessage,
  blurTypeSolidMessage,
} from '../../shared/blur-controls';

export const scenarioEditorQuickEditMessages = {
  missingAsset: {
    ru: 'Файл шага не найден',
    en: 'Step asset is missing',
  },
  width: {
    ru: 'Ширина',
    en: 'Width',
  },
  height: {
    ru: 'Высота',
    en: 'Height',
  },
  color: {
    ru: 'Цвет',
    en: 'Color',
  },
  strokeColor: {
    ru: 'Цвет обводки',
    en: 'Stroke color',
  },
  fillColor: {
    ru: 'Цвет заливки',
    en: 'Fill color',
  },
  strokeWidth: {
    ru: 'Толщина',
    en: 'Stroke width',
  },
  blurAmount: blurStrengthMessage,
  blurType: blurTypeLabelMessage,
  blurTypeGaussian: blurTypeGaussianMessage,
  blurTypeDistortion: blurTypeDistortionMessage,
  blurTypePixelate: blurTypePixelateMessage,
  blurTypeSolid: blurTypeSolidMessage,
  blurShowBorder: {
    ru: 'Показывать границу',
    en: 'Show border',
  },
  textLabel: {
    ru: 'Текст',
    en: 'Text',
  },
  fontSize: {
    ru: 'Размер шрифта',
    en: 'Font size',
  },
  fontWeight: {
    ru: 'Насыщенность',
    en: 'Font weight',
  },
  fontFamily: {
    ru: 'Семейство шрифта',
    en: 'Font family',
  },
  removeOverlay: {
    ru: 'Удалить слой',
    en: 'Remove overlay',
  },
  overlayKinds: {
    'focus-rect': {
      ru: 'Фокус',
      en: 'Focus',
    },
    'click-ring': {
      ru: 'Клик',
      en: 'Click',
    },
    cursor: {
      ru: 'Курсор',
      en: 'Cursor',
    },
    arrow: {
      ru: 'Стрелка',
      en: 'Arrow',
    },
    rectangle: {
      ru: 'Рамка',
      en: 'Rectangle',
    },
    ellipse: {
      ru: 'Эллипс',
      en: 'Ellipse',
    },
    text: {
      ru: 'Текст',
      en: 'Text',
    },
    'blur-rect': {
      ru: 'Размытие',
      en: 'Blur',
    },
  },
  selectTool: {
    ru: 'Выбор',
    en: 'Select',
  },
  panTool: {
    ru: 'Панорама',
    en: 'Pan',
  },
  noProjects: {
    ru: 'Нет сценариев',
    en: 'No scenarios',
  },
  projectActions: {
    ru: 'Управление сценариями',
    en: 'Scenario actions',
  },
  renameProject: {
    ru: 'Переименовать сценарий',
    en: 'Rename scenario',
  },
  deleteProject: {
    ru: 'Удалить сценарий',
    en: 'Delete scenario',
  },
  deleteProjectConfirm: {
    ru: 'Удалить сценарий? Это действие необратимо.',
    en: 'Delete this scenario? This action cannot be undone.',
  },
  selectedStep: {
    ru: 'Выбранный шаг',
    en: 'Selected step',
  },
  projectContext: {
    ru: 'Контекст сценария',
    en: 'Scenario context',
  },
  inspectorAdvanced: {
    ru: 'Точные параметры',
    en: 'Precise controls',
  },
} as const;
