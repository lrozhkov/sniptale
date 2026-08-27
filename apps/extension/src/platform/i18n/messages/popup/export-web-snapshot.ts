import { defineMessageSource } from '../source';
import {
  sharedWebSnapshotPluralNameMessage,
  sharedWebSnapshotSingularNameMessage,
} from '../shared/web-snapshot';

export const popupExportWebSnapshotMessages = defineMessageSource({
  saveWebSnapshotTitle: {
    ru: 'Сохранить снимок',
    en: 'Save snapshot',
  },
  webSnapshotDisclosureTitle: {
    ru: 'Сохранить веб-снимок?',
    en: 'Save this web snapshot?',
  },
  webSnapshotDisclosureBody: {
    ru: [
      'Локальная копия содержит адрес и заголовок страницы, предупреждения и безопасную',
      'техническую диагностику. Распознанные поля паролей, кодов входа и платёжных данных',
      'исключаются из документа и скрываются на скриншоте.',
    ].join(' '),
    en: [
      'The local copy includes the page address and title, warnings, and safe technical',
      'diagnostics. Recognized password, sign-in code, and payment fields are excluded',
      'from the document and hidden in the screenshot.',
    ].join(' '),
  },
  webSnapshotStaticDocumentTitle: {
    ru: 'Статический документ',
    en: 'Static document',
  },
  webSnapshotStaticDocumentDescription: {
    ru: [
      'Очищенная разметка и текущее состояние обычных полей формы, стили, шрифты и',
      'доступные изображения с сохранённой геометрией страницы.',
    ].join(' '),
    en: [
      'Sanitized markup and current ordinary form state, styles, fonts, and available',
      'images with the captured page geometry.',
    ].join(' '),
  },
  webSnapshotScreenshotTitle: {
    ru: 'Полноразмерный скриншот',
    en: 'Full-page screenshot',
  },
  webSnapshotScreenshotDescription: {
    ru: [
      'PNG исходного масштаба остаётся резервным визуальным представлением. Другая видимая',
      'приватная информация, включая текст в изображениях, canvas, video или закрытом Shadow DOM, может сохраниться.',
    ].join(' '),
    en: [
      'A native-scale PNG remains available as the visual fallback. Other visible private',
      'content, including text in images, canvas, video, or closed Shadow DOM, may still be retained.',
    ].join(' '),
  },
  webSnapshotOfflineTitle: {
    ru: 'Автономный просмотр',
    en: 'Offline viewing',
  },
  webSnapshotOfflineDescription: {
    ru: 'Скрипты отключены; Viewer не обращается к исходному сайту при открытии снимка.',
    en: 'Scripts are disabled; Viewer does not contact the source site when opening the snapshot.',
  },
  webSnapshotResourcePolicyTitle: {
    ru: 'Доступ к ресурсам при сохранении',
    en: 'Resource access while saving',
  },
  webSnapshotResourcePolicySettingsHint: {
    ru: 'Политику можно изменить в настройках Web Snapshots.',
    en: 'You can change this policy in Web Snapshot settings.',
  },
  webSnapshotDisclosureAssetsDefault: {
    ru: 'Дополнительные ресурсы страницы не загружаются без вашего разрешения.',
    en: 'Extra page resources are not loaded unless you allow them.',
  },
  webSnapshotDisclosureAssetsLoading: {
    ru: [
      'Проверяем настройки ресурсов. Если у вас включено сохранение ресурсов с этого сайта',
      'или внешних ресурсов, они могут попасть в локальную копию.',
    ].join(' '),
    en: [
      'Resource settings are still being checked. If saving resources from this site',
      'or external resources is enabled, they may be included in the local copy.',
    ].join(' '),
  },
  webSnapshotDisclosureAssetsUnavailable: {
    ru: [
      'Не удалось проверить настройки ресурсов. Продолжая, вы подтверждаете, что ресурсы',
      'с этого сайта или внешние ресурсы могут попасть в локальную копию, если они включены.',
    ].join(' '),
    en: [
      'Resource settings could not be checked. By continuing, you confirm that resources',
      'from this site or external resources may be included if those options are enabled.',
    ].join(' '),
  },
  webSnapshotDisclosureAssetsAuthenticated: {
    ru: [
      'Ресурсы текущего сайта загружаются с учётом вашего активного входа.',
      'Приватные изображения или стили могут попасть в локальную копию; не передавайте её третьим лицам.',
    ].join(' '),
    en: [
      'Current-site assets are loaded using your active signed-in session.',
      'Private images or styles may enter the local copy; do not share it with others.',
    ].join(' '),
  },
  webSnapshotDisclosureAssetsExternal: {
    ru: [
      'В настройках включены внешние ресурсы.',
      'Sniptale попробует добавить доступные публичные файлы в локальную копию.',
    ].join(' '),
    en: [
      'External resources are enabled.',
      'Sniptale will try to add available public files to the local copy.',
    ].join(' '),
  },
  webSnapshotDisclosureAssetsBoth: {
    ru: [
      'Ресурсы текущего сайта загружаются с учётом активного входа, а внешние HTTPS-ресурсы — анонимно.',
      'Приватные изображения или стили могут попасть в локальную копию; не передавайте её третьим лицам.',
    ].join(' '),
    en: [
      'Current-site assets use your active signed-in session; external HTTPS assets load anonymously.',
      'Private images or styles may enter the local copy; do not share it with others.',
    ].join(' '),
  },
  webSnapshotDisclosureCancel: {
    ru: 'Отмена',
    en: 'Cancel',
  },
  webSnapshotDisclosureConfirm: {
    ru: 'Сохранить локально',
    en: 'Save locally',
  },
  webSnapshotDisclosureSkipNextTime: {
    ru: 'Больше не спрашивать',
    en: "Don't ask again",
  },
  webSnapshotDisclosurePreferenceError: {
    ru: 'Не удалось сохранить выбор. Проверьте доступ к настройкам и попробуйте снова.',
    en: 'Could not save this choice. Check settings access and try again.',
  },
  webSnapshotSaved: {
    ru: 'Веб-снимок сохранён в Библиотеку',
    en: 'Web snapshot saved to Library',
  },
  webSnapshotSavedWithWarnings: {
    ru: 'Веб-снимок сохранён в Библиотеку с предупреждениями',
    en: 'Web snapshot saved to Library with warnings',
  },
  webSnapshotsSaved: {
    ru: `${sharedWebSnapshotPluralNameMessage.ru} сохранены в Библиотеку`,
    en: `${sharedWebSnapshotPluralNameMessage.en} saved to Library`,
  },
  webSnapshotsSavedWithWarnings: {
    ru: `${sharedWebSnapshotPluralNameMessage.ru} сохранены в Библиотеку с предупреждениями`,
    en: `${sharedWebSnapshotPluralNameMessage.en} saved to Library with warnings`,
  },
  openWebSnapshot: {
    ru: `Открыть ${sharedWebSnapshotSingularNameMessage.ru}`,
    en: `Open ${sharedWebSnapshotSingularNameMessage.en}`,
  },
  openWebSnapshotsGallery: {
    ru: `Открыть ${sharedWebSnapshotPluralNameMessage.ru} в Библиотеке`,
    en: `Open ${sharedWebSnapshotPluralNameMessage.en} in Library`,
  },
  webSnapshotSaving: {
    ru: 'Сохраняем веб-снимок...',
    en: 'Saving web snapshot...',
  },
  webSnapshotMissingAssetId: {
    ru: 'Веб-снимок сохранён без идентификатора',
    en: 'Web snapshot saved without an asset id',
  },
  webSnapshotPreviewStep: {
    ru: 'Полноразмерный скриншот',
    en: 'Full-page screenshot',
  },
  webSnapshotDomStep: {
    ru: 'Статический документ',
    en: 'Static document',
  },
  webSnapshotStylesStep: {
    ru: 'Стили и шрифты',
    en: 'Styles and fonts',
  },
  webSnapshotAssetsStep: {
    ru: 'Ассеты и сохранение',
    en: 'Assets and saving',
  },
  webSnapshotWarningsStep: {
    ru: 'Предупреждения',
    en: 'Warnings',
  },
});
