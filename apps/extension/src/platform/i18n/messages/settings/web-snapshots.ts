import { defineMessageSource } from '../source';

export const settingsWebSnapshotMessages = defineMessageSource({
  enableLabel: {
    ru: 'Включить веб-снимки',
    en: 'Enable Web Snapshots',
  },
  enableDescription: {
    ru: 'Разрешить сохранять автономные копии веб-страниц в Библиотеку.',
    en: 'Allow self-contained copies of web pages to be saved to your Library.',
  },
  aboutTitle: {
    ru: 'Что сохраняется',
    en: 'What gets saved',
  },
  aboutDescription: {
    ru: [
      'Sniptale сохраняет текст, структуру, стили, изображения и полноразмерный скриншот страницы.',
      'Снимок открывается локально без запуска скриптов исходного сайта.',
    ].join(' '),
    en: [
      'Sniptale saves the page text, layout, styles, images, and a full-page screenshot.',
      'The snapshot opens locally without running scripts from the original site.',
    ].join(' '),
  },
  privacyTitle: {
    ru: 'Проверьте перед отправкой',
    en: 'Review before sharing',
  },
  privacyDescription: {
    ru: [
      'Снимок может содержать видимые личные данные и материалы из вашей текущей сессии.',
      'Проверьте его перед тем, как делиться файлом.',
    ].join(' '),
    en: [
      'A snapshot may contain visible personal information and content from your current session.',
      'Review it before sharing the file.',
    ].join(' '),
  },
  resourcesTitle: {
    ru: 'Качество и ресурсы',
    en: 'Quality and resources',
  },
  resourcesDescription: {
    ru: 'Эти параметры помогают сохранить страницу ближе к оригиналу.',
    en: 'These options help preserve the page closer to the original.',
  },
  currentSiteLabel: {
    ru: 'Сохранять ресурсы открытого сайта',
    en: 'Save resources from the current site',
  },
  currentSiteDescription: {
    ru: [
      'Загружать изображения и стили с использованием текущего входа на сайт.',
      'В снимок могут попасть приватные материалы.',
    ].join(' '),
    en: [
      'Load images and styles using your current signed-in session.',
      'Private content may be included in the snapshot.',
    ].join(' '),
  },
  externalLabel: {
    ru: 'Сохранять ресурсы с других сайтов',
    en: 'Save resources from other sites',
  },
  externalDescription: {
    ru: [
      'Анонимно загружать доступные HTTPS-изображения, шрифты и стили со сторонних серверов.',
      'Это улучшает точность снимка, но создаёт сетевые запросы к этим серверам.',
    ].join(' '),
    en: [
      'Anonymously load available HTTPS images, fonts, and styles from third-party servers.',
      'This improves fidelity but sends network requests to those servers.',
    ].join(' '),
  },
  disabledHint: {
    ru: 'Сначала включите веб-снимки, чтобы изменить параметры ресурсов.',
    en: 'Enable Web Snapshots before changing resource options.',
  },
  saveError: {
    ru: 'Не удалось сохранить настройку. Попробуйте ещё раз.',
    en: 'Could not save this setting. Try again.',
  },
});
