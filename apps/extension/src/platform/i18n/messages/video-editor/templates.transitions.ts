import { defineMessageSource } from '../source';

export const videoEditorTemplateTransitionMessages = defineMessageSource({
  transitionGroupCore: {
    ru: 'Базовые переходы',
    en: 'Core transitions',
  },
  transitionGroupDirectional: {
    ru: 'Направленные переходы',
    en: 'Directional transitions',
  },
  transitionGroupReveal: {
    ru: 'Переходы с раскрытием',
    en: 'Reveal transitions',
  },
  transitionGroupShader: {
    ru: 'Шейдерные переходы',
    en: 'Shader transitions',
  },
  transitionDescriptionCrossfade: {
    ru: 'Нейтральная смена сцен без дополнительного акцента.',
    en: 'Neutral scene handoff without extra visual emphasis.',
  },
  transitionUseCaseCrossfade: {
    ru: 'Лучше всего для базовых монтажных склеек.',
    en: 'Best for neutral baseline scene handoffs.',
  },
  transitionDescriptionFadeThroughLight: {
    ru: 'Мягкое растворение через свет для более дорогой и чистой смены сцены.',
    en: 'Soft editorial fade through light for a more premium and polished scene handoff.',
  },
  transitionUseCaseFadeThroughLight: {
    ru: 'Лучше всего для глав, смысловых переходов и аккуратных product-demo склеек.',
    en: 'Best for chapters, section changes, and polished product-demo handoffs.',
  },
  transitionDescriptionDipToColor: {
    ru: 'Короткое погружение в цвет для акцентной смены блока.',
    en: 'Short dip through color for an emphasized scene handoff.',
  },
  transitionUseCaseDipToColor: {
    ru: 'Лучше всего для смены акта или главы.',
    en: 'Best for act changes or stronger section breaks.',
  },
  transitionDescriptionPush: {
    ru: 'Направленный сдвиг для ощущения движения между шагами.',
    en: 'Directional push for a sense of movement between steps.',
  },
  transitionUseCasePush: {
    ru: 'Лучше всего для пошагового интерфейса и монтажных сцен с явным потоком.',
    en: 'Best for step-by-step UI and flow-driven edits.',
  },
  transitionDescriptionSlide: {
    ru: 'Переход со скольжением для монтажных смен, завязанных на интерфейс.',
    en: 'Slide transition for UI-driven edit changes.',
  },
  transitionUseCaseSlide: {
    ru: 'Лучше всего для переходов между панелями и экранами.',
    en: 'Best for panel and screen-to-screen transitions.',
  },
  transitionDescriptionZoomDissolve: {
    ru: 'Зум-растворение для мягкого сближения между сценами.',
    en: 'Zoom dissolve for a softer move between scenes.',
  },
  transitionUseCaseZoomDissolve: {
    ru: 'Лучше всего для мягких контекстных переходов.',
    en: 'Best for softer contextual handoffs.',
  },
  transitionDescriptionBlurReveal: {
    ru: 'Размытие с раскрытием для более мягкой кинематографичной смены.',
    en: 'Blur reveal for a softer cinematic scene change.',
  },
  transitionUseCaseBlurReveal: {
    ru: 'Лучше всего для кинематографичных и аккуратных моментов раскрытия.',
    en: 'Best for cinematic or polished reveal moments.',
  },
  transitionDescriptionLightSweep: {
    ru: 'Световой проход для акцентных продуктовых или брендовых моментов.',
    en: 'Light sweep for product or brand emphasis moments.',
  },
  transitionUseCaseLightSweep: {
    ru: 'Лучше всего для брендовых и ярких акцентов раскрытия.',
    en: 'Best for branded and hero reveal emphasis.',
  },
  transitionDescriptionCardFlipReveal: {
    ru: 'Псевдо-3D переворот для карточных и панельных композиций.',
    en: 'Pseudo-3D flip for card and panel-based compositions.',
  },
  transitionUseCaseCardFlipReveal: {
    ru: 'Лучше всего для карточных компоновок и UI-панелей.',
    en: 'Best for card layouts and UI panel swaps.',
  },
  transitionDescriptionLinearWipe: {
    ru: 'Линейное шейдерное вытеснение с управлением направлением и акцентом.',
    en: 'Linear shader wipe with direction and accent control.',
  },
  transitionUseCaseLinearWipe: {
    ru: 'Лучше всего для чистых направленных шейдерных переходов.',
    en: 'Best for clean directional shader handoffs.',
  },
  transitionDescriptionRadialReveal: {
    ru: 'Радиальное раскрытие для переходов с эффектом фокуса.',
    en: 'Radial reveal for spotlight-style transitions.',
  },
  transitionUseCaseRadialReveal: {
    ru: 'Лучше всего для акцентов с фокусом и направленным раскрытием.',
    en: 'Best for spotlight and focus-driven reveals.',
  },
  transitionDescriptionDisplacementWarp: {
    ru: 'Деформирующий переход с более выразительным смещением.',
    en: 'Warp transition with a stronger displacement feel.',
  },
  transitionUseCaseDisplacementWarp: {
    ru: 'Лучше всего для более динамичных продуктовых акцентов.',
    en: 'Best for more dynamic product beats.',
  },
  transitionDescriptionGlareSweep: {
    ru: 'Бликовый проход для ярких моментов раскрытия.',
    en: 'Glare sweep for brighter reveal moments.',
  },
  transitionUseCaseGlareSweep: {
    ru: 'Лучше всего для ярких раскрытий и глянцевых акцентов.',
    en: 'Best for bright reveal and glossy emphasis.',
  },
});
