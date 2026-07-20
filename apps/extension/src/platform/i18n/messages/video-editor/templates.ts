import { defineMessageSource } from '../source';
import { videoEditorTemplateCatalogMessages } from './templates.catalog.ts';
import { videoEditorTemplateBlockMessages } from './templates.blocks.ts';
import { videoEditorTemplateTransitionMessages } from './templates.transitions.ts';

export const videoEditorTemplateMessages = defineMessageSource({
  overlayGroupLowerThirds: {
    ru: 'Нижние подписи',
    en: 'Lower thirds',
  },
  overlayGroupTitles: {
    ru: 'Заголовки',
    en: 'Titles',
  },
  overlayGroupAnnotations: {
    ru: 'Аннотации',
    en: 'Annotations',
  },
  overlayGroupCallouts: {
    ru: 'Выноски',
    en: 'Callouts',
  },
  overlayGroupFocusSpotlight: {
    ru: 'Фокус и подсветка',
    en: 'Focus & spotlight',
  },
  overlayGroupSceneReveals: {
    ru: 'Раскрытие сцен',
    en: 'Scene reveals',
  },
  previewToneCalm: { ru: 'Спокойный', en: 'Calm' },
  previewToneEditorial: {
    ru: 'Редакционный',
    en: 'Editorial',
  },
  previewToneGuided: {
    ru: 'Направляющий',
    en: 'Guided',
  },
  previewToneHero: { ru: 'Выразительный', en: 'Hero' },
  previewToneTechnical: {
    ru: 'Технический',
    en: 'Technical',
  },
  previewMotionDepth: {
    ru: 'Глубина',
    en: 'Depth',
  },
  previewMotionDip: { ru: 'Погружение', en: 'Dip' },
  previewMotionFade: {
    ru: 'Проявление',
    en: 'Fade',
  },
  previewMotionFlip: { ru: 'Переворот', en: 'Flip' },
  previewMotionFocus: {
    ru: 'Фокус',
    en: 'Focus',
  },
  previewMotionPush: {
    ru: 'Сдвиг',
    en: 'Push',
  },
  previewMotionReveal: {
    ru: 'Раскрытие',
    en: 'Reveal',
  },
  previewMotionSlide: {
    ru: 'Скольжение',
    en: 'Slide',
  },
  previewMotionSweep: {
    ru: 'Проход',
    en: 'Sweep',
  },
  previewMotionWipe: {
    ru: 'Вытеснение',
    en: 'Wipe',
  },
  overlayDescriptionLowerThirdBasic: {
    ru: 'Базовая нижняя подпись для имени, роли или короткого пояснения.',
    en: 'Baseline lower third for a name, role, or short context.',
  },
  overlayUseCaseLowerThirdBasic: {
    ru: 'Лучше всего для имён, ролей и коротких подписей.',
    en: 'Best for names, roles, and short labels.',
  },
  overlayDescriptionLowerThirdAccent: {
    ru: 'Нижняя подпись с акцентной плашкой для более выразительного вступления.',
    en: 'Lower third with an accent rail for stronger openings.',
  },
  overlayUseCaseLowerThirdAccent: {
    ru: 'Лучше всего для вступлений с брендовым акцентом.',
    en: 'Best for branded or higher-energy openings.',
  },
  overlayDescriptionLowerThirdEditorial: {
    ru: 'Мягкая редакционная подпись с чистой стеклянной плашкой и спокойным появлением.',
    en: 'Soft editorial lower third with a clean glass plate and restrained motion.',
  },
  overlayUseCaseLowerThirdEditorial: {
    ru: 'Лучше всего для имён, ролей и premium product-demo без лишнего акцента.',
    en: 'Best for names, roles, and premium product demos without extra emphasis.',
  },
  overlayDescriptionLowerThirdStacked: {
    ru: 'Двухуровневая нижняя подпись для плотных подпунктов и контекста.',
    en: 'Stacked lower third for denser labels and extra context.',
  },
  overlayUseCaseLowerThirdStacked: {
    ru: 'Лучше всего для длинных ролей и двухстрочного контекста.',
    en: 'Best for longer roles and two-line context.',
  },
  overlayDescriptionLowerThirdBadge: {
    ru: 'Нижняя подпись с бейджем и более выразительным появлением.',
    en: 'Lower third with a badge and a stronger animated entry.',
  },
  overlayUseCaseLowerThirdBadge: {
    ru: 'Лучше всего для серий, рубрик и помеченных сегментов.',
    en: 'Best for series tags, segments, and labeled beats.',
  },
  overlayDescriptionLowerThirdStatusTicker: {
    ru: 'Компактная статусная подпись с живым проходом и короткой меткой события.',
    en: 'Compact status lower third with a live sweep and short event marker.',
  },
  overlayUseCaseLowerThirdStatusTicker: {
    ru: 'Лучше всего для прогресса, статусов и системных событий в product-demo.',
    en: 'Best for progress, statuses, and system events inside product demos.',
  },
  overlayDescriptionCalloutCard: {
    ru: 'Карточка-аннотация для выделения важного участка сцены.',
    en: 'Annotation card for highlighting a key area of the scene.',
  },
  overlayUseCaseCalloutCard: {
    ru: 'Лучше всего для объяснения ключевой зоны кадра.',
    en: 'Best for explaining a key area in the frame.',
  },
  overlayDescriptionPointerLabel: {
    ru: 'Компактная подпись с якорной точкой и указателем к объекту.',
    en: 'Compact anchored label with a pointer toward a target point.',
  },
  overlayUseCasePointerLabel: {
    ru: 'Лучше всего для точечных меток интерфейса, курсоров и коротких указателей.',
    en: 'Best for pinpoint UI labels, cursors, and short anchor markers.',
  },
  overlayDescriptionCalloutConnector: {
    ru: 'Текстовая выноска с линией-указателем и привязкой к выделенной зоне интерфейса.',
    en: 'Text callout with a leader line and a linked UI target area.',
  },
  overlayUseCaseCalloutConnector: {
    ru: 'Лучше всего для объяснения зоны интерфейса, поля или шага в интерфейсе.',
    en: 'Best for explaining a UI region, field, or interaction step.',
  },
  overlayDescriptionCalloutNotificationBanner: {
    ru: 'Уведомление-баннер с мягким стеклянным фоном и привязкой к зоне интерфейса.',
    en: 'Notification banner with a soft glass surface and a linked UI area.',
  },
  overlayUseCaseCalloutNotificationBanner: {
    ru: 'Лучше всего для системных сообщений, подтверждений и коротких подсказок в углу кадра.',
    en: 'Best for system messages, confirmations, and concise corner hints.',
  },
  overlayDescriptionFeatureSpotlightCard: {
    ru: 'Карточка с фокусом для акцента на функции или шаге интерфейса.',
    en: 'Spotlight card for emphasizing a feature or UI step.',
  },
  overlayUseCaseFeatureSpotlightCard: {
    ru: 'Лучше всего для выносок по функциям и пошаговых объяснений.',
    en: 'Best for feature callouts and walkthrough steps.',
  },
  overlayDescriptionFocusScanFrame: {
    ru: 'Сканирующая фокусная рамка с тонким проходом для проверки выбранной области.',
    en: 'Scanning focus frame with a fine sweep for reviewing a selected area.',
  },
  overlayUseCaseFocusScanFrame: {
    ru: 'Лучше всего для QA-моментов, проверок состояния и аккуратного выделения панели.',
    en: 'Best for QA beats, status checks, and precise panel emphasis.',
  },
  overlayDescriptionSideNote: {
    ru: 'Боковая заметка для короткого совета или пояснения.',
    en: 'Side note for a short tip or supporting explanation.',
  },
  overlayUseCaseSideNote: {
    ru: 'Лучше всего для советов, сносок и вспомогательных замечаний.',
    en: 'Best for tips, footnotes, and supporting notes.',
  },
  overlayDescriptionTitleReveal: {
    ru: 'Интро-заголовок для начала сцены или смыслового блока.',
    en: 'Intro title for the start of a scene or section.',
  },
  overlayUseCaseTitleReveal: {
    ru: 'Лучше всего для начала новой сцены или главы.',
    en: 'Best for opening a new scene or chapter.',
  },
  overlayDescriptionSectionDivider: {
    ru: 'Спокойный разделитель для отделения блоков внутри ролика.',
    en: 'Calm divider for separating sections inside a video.',
  },
  overlayUseCaseSectionDivider: {
    ru: 'Лучше всего для мягкого разделения смысловых блоков.',
    en: 'Best for softly separating content sections.',
  },
  overlayDescriptionTitleCursorReveal: {
    ru: 'Заголовок с курсорным проходом и хроматическим акцентом для быстрого открытия.',
    en: 'Cursor-led title with a chromatic sweep for a fast opener.',
  },
  overlayUseCaseTitleCursorReveal: {
    ru: 'Лучше всего для энергичных вступлений, hook-кадров и коротких тезисов.',
    en: 'Best for energetic openers, hook frames, and short statements.',
  },
  overlayDescriptionShimmerLabel: {
    ru: 'Компактная метка с мерцающим проходом для краткого акцента.',
    en: 'Compact label with a shimmer sweep for short emphasis.',
  },
  overlayUseCaseShimmerLabel: {
    ru: 'Лучше всего для коротких акцентов и микрораскрытий.',
    en: 'Best for short emphasis moments and micro-reveals.',
  },
  overlayDescriptionSideRevealPanel: {
    ru: 'Высокая боковая плашка для заголовка сцены или раскрытия нового блока.',
    en: 'Full-height side plate for scene titles or new-section reveals.',
  },
  overlayUseCaseSideRevealPanel: {
    ru: 'Лучше всего для открывающих заголовков, глав и смены контекста с края кадра.',
    en: 'Best for openers, chapters, and edge-led context shifts.',
  },
  overlayDescriptionSceneProgressCard: {
    ru: 'Карточка прогресса с номером кадра и короткой линией движения для смены сцены.',
    en: 'Progress card with a frame marker and short motion line for scene changes.',
  },
  overlayUseCaseSceneProgressCard: {
    ru: 'Лучше всего для коротких глав, шагов процесса и Hyperframes-подобных переходов.',
    en: 'Best for short chapters, process steps, and Hyperframes-style transitions.',
  },
  overlayDescriptionThreeDRevealCard: {
    ru: 'Карточка с глубиной для раскрытия функций и акцентных моментов продукта.',
    en: 'Depth-driven reveal card for feature reveals and product beats.',
  },
  overlayUseCaseThreeDRevealCard: {
    ru: 'Лучше всего для раскрытия продукта и ярких акцентов на функциях.',
    en: 'Best for product reveals and hero feature moments.',
  },
  ...videoEditorTemplateCatalogMessages,
  ...videoEditorTemplateBlockMessages,
  ...videoEditorTemplateTransitionMessages,
});
