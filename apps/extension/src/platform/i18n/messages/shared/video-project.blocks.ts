import { defineMessageSource } from '../source';

export const sharedVideoProjectBlockMessages = defineMessageSource({
  defaultBlockKineticCaptionsText: {
    ru: 'Вот здесь можно коротко проговорить главное сообщение сцены',
    en: 'Use this line to land the main message of the scene',
  },
  defaultBlockStepExplainerBadge: {
    ru: 'ШАГ 1',
    en: 'STEP 1',
  },
  defaultBlockStepExplainerHeadline: {
    ru: 'Покажите следующий шаг',
    en: 'Show the next step',
  },
  defaultBlockStepExplainerSubline: {
    ru: 'Привяжите выноску к зоне интерфейса и объясните действие',
    en: 'Anchor the callout to a UI area and explain the action',
  },
  defaultBlockChapterOpenerHeadline: {
    ru: 'Новый раздел',
    en: 'New section',
  },
  defaultBlockChapterOpenerSubline: {
    ru: 'Короткое интро перед следующим смысловым блоком',
    en: 'A short opener before the next section',
  },
  defaultBlockChapterDividerHeadline: {
    ru: 'Что будет дальше',
    en: 'What comes next',
  },
  defaultBlockChapterDividerSubline: {
    ru: 'Соберите ожидание перед следующей сценой',
    en: 'Build expectation for the next scene',
  },
  defaultBlockFeatureSpotlightBadge: {
    ru: 'FEATURE',
    en: 'FEATURE',
  },
  defaultBlockFeatureSpotlightHeadline: {
    ru: 'Подсветите ключевую функцию',
    en: 'Spotlight the key feature',
  },
  defaultBlockFeatureSpotlightSubline: {
    ru: 'Оставьте краткое пояснение прямо рядом с фокусом',
    en: 'Keep a short explanation next to the spotlight',
  },
  defaultBlockSpeakerIntroBadge: {
    ru: 'HOST',
    en: 'HOST',
  },
  defaultBlockSpeakerIntroHeadline: {
    ru: 'Имя и роль',
    en: 'Name and role',
  },
  defaultBlockSpeakerIntroSubline: {
    ru: 'Хороший старт для intro, рубрики или сегмента',
    en: 'A strong start for an intro, segment, or series beat',
  },
  defaultBlockCtaWrapUpBadge: {
    ru: 'NEXT',
    en: 'NEXT',
  },
  defaultBlockCtaWrapUpHeadline: {
    ru: 'Продолжить дальше',
    en: 'Continue next',
  },
  defaultBlockCtaWrapUpSubline: {
    ru: 'Призыв к следующему действию, ролику или шагу',
    en: 'Prompt the next action, video, or step',
  },
});
