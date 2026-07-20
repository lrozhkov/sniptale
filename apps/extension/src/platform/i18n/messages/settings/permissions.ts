import { defineMessageSource } from '../source';

function sentence(...parts: string[]) {
  return parts.join(' ');
}

export const settingsPermissionsMessages = defineMessageSource({
  title: {
    ru: 'Разрешения',
    en: 'Permissions',
  },
  subtitle: {
    ru: 'Проверьте, к чему Sniptale получает доступ и зачем это нужно',
    en: 'Review what Sniptale can access and why it needs that access',
  },
  sitesName: {
    ru: 'Доступ к сайтам',
    en: 'Site access',
  },
  sitesDescription: {
    ru: 'Включает инструменты Sniptale на сайтах, которым вы разрешили доступ.',
    en: 'Enables Sniptale tools on websites you allow.',
  },
  microphoneName: {
    ru: 'Микрофон',
    en: 'Microphone',
  },
  microphoneDescription: {
    ru: 'Записывает звук с микрофона, если вы включаете его перед записью видео.',
    en: 'Records microphone audio when you turn it on before recording a video.',
  },
  cameraName: {
    ru: 'Камера',
    en: 'Camera',
  },
  cameraDescription: {
    ru: 'Добавляет видео с камеры, если вы включаете веб-камеру перед записью.',
    en: 'Adds camera video when you turn on the webcam before recording.',
  },
  downloadsName: {
    ru: 'Загрузки',
    en: 'Downloads',
  },
  downloadsDescription: {
    ru: 'Сохраняет скриншоты, записи и экспортированные файлы на компьютер.',
    en: 'Saves screenshots, recordings, and exported files to your computer.',
  },
  clipboardName: {
    ru: 'Буфер обмена',
    en: 'Clipboard',
  },
  clipboardDescription: {
    ru: 'Копирует скриншоты и экспортированные материалы в буфер обмена по вашему действию.',
    en: 'Copies screenshots and exported content to the clipboard after your action.',
  },
  requiredGrantsTitle: {
    ru: 'Обязательные разрешения',
    en: 'Required permissions',
  },
  requiredGrantsDescription: {
    ru: sentence(
      'Эти разрешения включены при установке, потому что без них основные функции Sniptale не смогут работать.',
      'Доступ к сайтам остается отдельным опциональным разрешением.'
    ),
    en: sentence(
      'These permissions are enabled at install time because core Sniptale features need them to work.',
      'Site access remains a separate optional permission.'
    ),
  },
  requiredGrantPermission: {
    ru: 'Manifest permission',
    en: 'Manifest permission',
  },
  requiredGrantHost: {
    ru: 'Host permission',
    en: 'Host permission',
  },
  requiredGrantContentScript: {
    ru: 'Content script',
    en: 'Content script',
  },
  statusChecksTitle: {
    ru: 'Опциональные разрешения',
    en: 'Optional permissions',
  },
  statusChecksDescription: {
    ru: 'Эти разрешения можно включать только тогда, когда вам нужны соответствующие функции.',
    en: 'You can turn these permissions on only when you need the related features.',
  },
  requiredStorageName: {
    ru: 'Локальное хранение данных',
    en: 'Local data storage',
  },
  requiredStorageDescription: {
    ru: 'Сохраняет настройки, проекты, записи и служебные данные Sniptale в вашем браузере.',
    en: 'Stores settings, projects, recordings, and Sniptale app data in your browser.',
  },
  requiredContextMenusName: {
    ru: 'Действия в контекстном меню',
    en: 'Right-click actions',
  },
  requiredContextMenusDescription: {
    ru: 'Добавляет команды Sniptale в меню правой кнопки мыши, чтобы быстро запускать захват и экспорт.',
    en: 'Adds Sniptale commands to the right-click menu for quick capture and export actions.',
  },
  requiredUnlimitedStorageName: {
    ru: 'Большие локальные файлы',
    en: 'Large local files',
  },
  requiredUnlimitedStorageDescription: {
    ru: 'Позволяет хранить крупные скриншоты, видео, веб-снимки и проекты без стандартного малого лимита.',
    en: 'Allows large screenshots, videos, web snapshots, and projects without the small default limit.',
  },
  requiredTabsName: {
    ru: 'Вкладки браузера',
    en: 'Browser tabs',
  },
  requiredTabsDescription: {
    ru: 'Определяет текущую вкладку, открывает страницы Sniptale и связывает захват с нужной страницей.',
    en: 'Finds the current tab, opens Sniptale pages, and connects captures to the right page.',
  },
  requiredWebNavigationName: {
    ru: 'Переходы между страницами',
    en: 'Page navigation',
  },
  requiredWebNavigationDescription: {
    ru: 'Понимает, что страница изменилась, и очищает старые состояния захвата.',
    en: 'Detects when a page changes and clears old capture state.',
  },
  requiredDebuggerName: {
    ru: 'Расширенный захват',
    en: 'Advanced capture',
  },
  requiredDebuggerDescription: {
    ru: 'Нужен для длинных скриншотов, точного захвата окна просмотра и диагностики, которую запускаете вы.',
    en: 'Powers full-page screenshots, precise viewport capture, and diagnostics you start.',
  },
  requiredActiveTabName: {
    ru: 'Текущая вкладка',
    en: 'Current tab',
  },
  requiredActiveTabDescription: {
    ru: 'Позволяет работать только с вкладкой, где вы явно запустили действие Sniptale.',
    en: 'Lets Sniptale work with only the tab where you started an action.',
  },
  requiredScriptingName: {
    ru: 'Инструменты на странице',
    en: 'Page tools',
  },
  requiredScriptingDescription: {
    ru: 'Показывает панель Sniptale и инструменты выбора на странице после вашего разрешения.',
    en: 'Shows the Sniptale toolbar and selection tools on a page after you allow it.',
  },
  requiredDownloadsName: {
    ru: 'Скачивание файлов',
    en: 'File downloads',
  },
  requiredDownloadsDescription: {
    ru: 'Сохраняет готовые скриншоты, видео, проекты и резервные копии как файлы.',
    en: 'Saves finished screenshots, videos, projects, and backups as files.',
  },
  requiredOffscreenName: {
    ru: 'Фоновая обработка медиа',
    en: 'Background media processing',
  },
  requiredOffscreenDescription: {
    ru: 'Обрабатывает запись и экспорт в скрытой странице Sniptale, пока вы продолжаете работать.',
    en: 'Processes recording and export work in a hidden Sniptale page while you continue working.',
  },
  requiredTabCaptureName: {
    ru: 'Запись вкладки',
    en: 'Tab recording',
  },
  requiredTabCaptureDescription: {
    ru: 'Записывает видео и звук выбранной вкладки, когда вы выбираете режим записи вкладки.',
    en: 'Records video and audio from the selected tab when you choose tab recording.',
  },
  requiredDesktopCaptureName: {
    ru: 'Запись экрана или окна',
    en: 'Screen or window recording',
  },
  requiredDesktopCaptureDescription: {
    ru: 'Открывает системный выбор экрана или окна, если вы записываете не только вкладку.',
    en: 'Opens the system picker when you record a screen or window instead of a tab.',
  },
  requiredNativeMessagingName: {
    ru: 'Приложение Sniptale',
    en: 'Sniptale app',
  },
  requiredNativeMessagingDescription: {
    ru: 'Подключается к установленному приложению Sniptale для снимков, записи и синхронизации настроек.',
    en: 'Connects to the installed Sniptale app for screenshots, recording, and settings sync.',
  },
  requiredClipboardWriteName: {
    ru: 'Буфер обмена',
    en: 'Clipboard',
  },
  requiredClipboardWriteDescription: {
    ru: 'Копирует скриншоты и экспортированные материалы в буфер обмена, когда вы нажимаете «копировать».',
    en: 'Copies screenshots and exported content to the clipboard when you choose copy.',
  },
  statusGranted: {
    ru: 'Разрешено',
    en: 'Granted',
  },
  statusDenied: {
    ru: 'Запрещено',
    en: 'Denied',
  },
  statusUnknown: {
    ru: 'Неизвестно',
    en: 'Unknown',
  },
  statusError: {
    ru: 'Ошибка проверки',
    en: 'Check failed',
  },
  allowButton: {
    ru: 'Разрешить',
    en: 'Allow',
  },
  siteAccessAskMode: {
    ru: 'Спрашивать',
    en: 'Ask per site',
  },
  siteAccessAllSitesMode: {
    ru: 'Все сайты',
    en: 'All sites',
  },
  helpTitle: {
    ru: 'Как восстановить доступ',
    en: 'How to restore access',
  },
  helpDescription: {
    ru: 'Что делать, если разрешения были отклонены или отозваны',
    en: 'What to do when permissions were denied or revoked',
  },
  showHelp: {
    ru: 'Показать инструкцию',
    en: 'Show guidance',
  },
  hideHelp: {
    ru: 'Скрыть инструкцию',
    en: 'Hide guidance',
  },
  noteLabel: {
    ru: 'Примечание:',
    en: 'Note:',
  },
  noteBodyPrefix: {
    ru: sentence(
      'Если разрешение было запрещено, вы можете изменить его в настройках сайта',
      '(нажмите на значок замка в адресной строке) или сбросить разрешения расширения на странице'
    ),
    en: sentence(
      'If a permission was denied, you can change it in site settings',
      '(click the lock icon in the address bar) or reset the extension permissions on'
    ),
  },
  noteBodyMiddle: {
    ru: '.',
    en: '.',
  },
  importantLabel: {
    ru: 'Важно:',
    en: 'Important:',
  },
  importantBodyPrefix: {
    ru: sentence(
      'Обязательные разрешения перечислены в разделе ниже.',
      'Если они были отозваны через'
    ),
    en: sentence(
      'Required extension permissions are listed in the section below.',
      'If they were revoked through'
    ),
  },
  importantBodySuffix: {
    ru: ', расширение может работать некорректно. Нажмите «Обновить статусы» после изменения разрешений.',
    en: ', the extension may behave incorrectly. Click “Refresh statuses” after changing permissions.',
  },
  refreshButton: {
    ru: 'Обновить статусы',
    en: 'Refresh statuses',
  },
});
