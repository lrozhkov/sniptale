import { videoEditorSidebarSelectionAnnotationActionMessages } from './selection.annotation.actions.ts';
import { videoEditorSidebarSelectionAnnotationInspectorMessages } from './selection.annotation.inspector.ts';
import { videoEditorSidebarSelectionAnnotationTargetMessages } from './selection.annotation-target.ts';
import { videoEditorSidebarSelectionAnnotationTemplateMessages } from './selection.annotation-templates.ts';

export const videoEditorSidebarSelectionAnnotationMessages = {
  clipTypeAnnotation: {
    ru: 'Шаблон',
    en: 'Template',
  },
  annotationTemplateLabel: {
    ru: 'Шаблон',
    en: 'Template',
  },
  templateFamilyLabel: {
    ru: 'Семейство',
    en: 'Family',
  },
  annotationHeadlineLabel: {
    ru: 'Заголовок',
    en: 'Headline',
  },
  annotationSublineLabel: {
    ru: 'Подзаголовок',
    en: 'Subline',
  },
  annotationBadgeLabel: {
    ru: 'Бейдж',
    en: 'Badge',
  },
  annotationIntroLabel: {
    ru: 'Появление',
    en: 'Intro',
  },
  annotationOutroLabel: {
    ru: 'Исчезание',
    en: 'Outro',
  },
  annotationDirectionLabel: {
    ru: 'Направление',
    en: 'Direction',
  },
  annotationDirectionLeft: {
    ru: 'Влево',
    en: 'Left',
  },
  annotationDirectionRight: {
    ru: 'Вправо',
    en: 'Right',
  },
  annotationDirectionUp: {
    ru: 'Вверх',
    en: 'Up',
  },
  annotationDirectionDown: {
    ru: 'Вниз',
    en: 'Down',
  },
  annotationIntensityLabel: {
    ru: 'Интенсивность',
    en: 'Intensity',
  },
  annotationIntroDurationLabel: {
    ru: 'Длительность появления',
    en: 'Intro duration',
  },
  annotationOutroDurationLabel: {
    ru: 'Длительность исчезания',
    en: 'Outro duration',
  },
  annotationAccentColorLabel: {
    ru: 'Акцент',
    en: 'Accent',
  },
  annotationBackgroundColorLabel: {
    ru: 'Фон',
    en: 'Background',
  },
  annotationHeadlineColorLabel: {
    ru: 'Цвет заголовка',
    en: 'Headline color',
  },
  annotationSublineColorLabel: {
    ru: 'Цвет подзаголовка',
    en: 'Subline color',
  },
  annotationBadgeTextColorLabel: {
    ru: 'Цвет бейджа',
    en: 'Badge text color',
  },
  annotationPaddingLabel: {
    ru: 'Внутренний отступ',
    en: 'Padding',
  },
  annotationBorderRadiusLabel: {
    ru: 'Скругление',
    en: 'Corner radius',
  },
  annotationDepthAmountLabel: {
    ru: 'Глубина',
    en: 'Depth',
  },
  annotationShimmerAmountLabel: {
    ru: 'Мерцание',
    en: 'Shimmer',
  },
  textTemplateUpgradeLabel: {
    ru: 'Преобразовать в шаблон',
    en: 'Convert to template',
  },
  textTemplateUpgradeDescription: {
    ru: 'Заменяет ручной текстовый слой шаблоном аннотации и сохраняет тайминг и положение.',
    en: 'Replaces the manual text overlay with an annotation template while keeping timing and placement.',
  },
  textTemplateUpgradeAction: {
    ru: 'Преобразовать',
    en: 'Convert',
  },
  annotationTemplateLowerThirdBasic: {
    ru: 'Нижняя подпись · базовая',
    en: 'Lower third basic',
  },
  annotationTemplateLowerThirdAccent: {
    ru: 'Нижняя подпись · акцент',
    en: 'Lower third accent',
  },
  annotationTemplateLowerThirdEditorial: {
    ru: 'Нижняя подпись · редакционная',
    en: 'Lower third editorial',
  },
  annotationTemplateLowerThirdStacked: {
    ru: 'Нижняя подпись · двухуровневая',
    en: 'Lower third stacked',
  },
  annotationTemplateLowerThirdBadge: {
    ru: 'Нижняя подпись · с бейджем',
    en: 'Lower third badge',
  },
  annotationTemplateLowerThirdStatusTicker: {
    ru: 'Нижняя подпись · статус',
    en: 'Lower third status',
  },
  annotationTemplateCalloutCard: {
    ru: 'Карточка-выноска',
    en: 'Callout card',
  },
  annotationTemplateCalloutNotificationBanner: {
    ru: 'Уведомление-выноска',
    en: 'Notification callout',
  },
  annotationTemplateCalloutConnector: {
    ru: 'Выноска с линией',
    en: 'Callout connector',
  },
  annotationTemplatePointerLabel: {
    ru: 'Подпись-указатель',
    en: 'Pointer label',
  },
  annotationTemplateFeatureSpotlightCard: {
    ru: 'Карточка с фокусом',
    en: 'Feature spotlight card',
  },
  annotationTemplateFocusScanFrame: {
    ru: 'Сканирующая рамка',
    en: 'Scan focus frame',
  },
  annotationTemplateSideNote: {
    ru: 'Боковая заметка',
    en: 'Side note',
  },
  annotationTemplateTitleReveal: {
    ru: 'Заголовок с раскрытием',
    en: 'Title reveal',
  },
  annotationTemplateSectionDivider: {
    ru: 'Разделитель секций',
    en: 'Section divider',
  },
  annotationTemplateTitleCursorReveal: {
    ru: 'Заголовок с курсором',
    en: 'Cursor title reveal',
  },
  annotationTemplateShimmerLabel: {
    ru: 'Мерцающая метка',
    en: 'Shimmer label',
  },
  annotationTemplateSideRevealPanel: {
    ru: 'Боковая плашка сцены',
    en: 'Side reveal panel',
  },
  annotationTemplateSceneProgressCard: {
    ru: 'Карточка прогресса',
    en: 'Scene progress card',
  },
  annotationTemplateThreeDRevealCard: {
    ru: '3D-карточка с раскрытием',
    en: '3D reveal card',
  },
  annotationAnimationNone: {
    ru: 'Без анимации',
    en: 'None',
  },
  annotationAnimationSlideUpFade: {
    ru: 'Сдвиг вверх и проявление',
    en: 'Slide up + fade',
  },
  annotationAnimationSlideLeftFade: {
    ru: 'Сдвиг влево и проявление',
    en: 'Slide left + fade',
  },
  annotationAnimationConnectorDraw: {
    ru: 'Прорисовка линии',
    en: 'Connector draw',
  },
  annotationAnimationAnchorPop: {
    ru: 'Появление якоря',
    en: 'Anchor pop',
  },
  annotationAnimationRevealMask: {
    ru: 'Маска раскрытия',
    en: 'Reveal mask',
  },
  annotationAnimationShimmerEntry: {
    ru: 'Мерцающее появление',
    en: 'Shimmer entry',
  },
  annotationAnimationShimmerSweep: {
    ru: 'Мерцающий проход',
    en: 'Shimmer sweep',
  },
  annotationAnimationSoftBlurReveal: {
    ru: 'Мягкое раскрытие из размытия',
    en: 'Soft blur reveal',
  },
  annotationAnimationScaleFade: {
    ru: 'Масштаб и проявление',
    en: 'Scale + fade',
  },
  annotationAnimationThreeDReveal: {
    ru: '3D-раскрытие',
    en: '3D reveal',
  },
  annotationIntensitySoft: {
    ru: 'Мягкая',
    en: 'Soft',
  },
  annotationIntensityBalanced: {
    ru: 'Сбалансированная',
    en: 'Balanced',
  },
  annotationIntensityBold: {
    ru: 'Сильная',
    en: 'Bold',
  },
  ...videoEditorSidebarSelectionAnnotationTargetMessages,
  ...videoEditorSidebarSelectionAnnotationInspectorMessages,
  ...videoEditorSidebarSelectionAnnotationActionMessages,
  ...videoEditorSidebarSelectionAnnotationTemplateMessages,
} as const;
