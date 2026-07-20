import { defineMessageSource } from '../source';

export const popupVideoRecordingControlMessages = defineMessageSource({
  diagnosticsDescription: {
    ru: [
      'Включает расширенную диагностику для этой вкладки: адрес страницы, очищенные ошибки',
      'консоли, сетевые запросы и сбои, а также служебные сообщения сохраняются локально',
      'в IndexedDB и могут попасть в экспорт отчёта JSON/ZIP.',
    ].join(' '),
    en: [
      'Turns on extended diagnostics for this tab: page address, sanitized console errors,',
      'network requests and failures, and service messages are saved locally in IndexedDB',
      'and may be included in JSON/ZIP report exports.',
    ].join(' '),
  },
  diagnosticsEnableAction: {
    ru: 'Включить',
    en: 'Enable',
  },
  countdownZeroOption: {
    ru: '0 секунд',
    en: '0 seconds',
  },
  countdownOneOption: {
    ru: '1 секунда',
    en: '1 second',
  },
  countdownFewOption: {
    ru: '{count} секунды',
    en: '{count} seconds',
  },
  countdownManyOption: {
    ru: '{count} секунд',
    en: '{count} seconds',
  },
  countdownImmediateValue: {
    ru: 'Запись начнется сразу',
    en: 'Recording starts immediately',
  },
  countdownDelayedValue: {
    ru: 'Пауза перед началом записи {duration}',
    en: 'Pause before recording starts: {duration}',
  },
  sourceCountOne: {
    ru: '1 окно',
    en: '1 window',
  },
  sourceCountMany: {
    ru: '{count} окна',
    en: '{count} windows',
  },
  sourceCountNotice: {
    ru: 'Несколько источников выбираются в системном диалоге перед записью.',
    en: 'Multiple sources are selected in the system picker before recording.',
  },
  activeMicrophoneLabel: {
    ru: 'Микрофон',
    en: 'Microphone',
  },
  activeMicrophoneNotSelected: {
    ru: 'Микрофон не выбран',
    en: 'No microphone selected',
  },
  activeMicrophoneNotRecorded: {
    ru: 'Микрофон не был выбран перед записью',
    en: 'Microphone was not selected before recording',
  },
  activeMicrophoneMute: {
    ru: 'Отключить микрофон',
    en: 'Mute microphone',
  },
  activeMicrophoneUnmute: {
    ru: 'Включить микрофон',
    en: 'Unmute microphone',
  },
  activeWebcamLabel: {
    ru: 'Камера',
    en: 'Camera',
  },
  activeWebcamNotSelected: {
    ru: 'Камера не выбрана',
    en: 'No camera selected',
  },
  activeWebcamNotRecorded: {
    ru: 'Камера не была выбрана перед записью',
    en: 'Camera was not selected before recording',
  },
  activeWebcamMute: {
    ru: 'Отключить камеру',
    en: 'Turn camera off',
  },
  activeWebcamUnmute: {
    ru: 'Включить камеру',
    en: 'Turn camera on',
  },
  activeWebcamPreview: {
    ru: 'Превью камеры',
    en: 'Camera preview',
  },
  activeWebcamPreviewUnavailable: {
    ru: 'Нет превью',
    en: 'No preview',
  },
  cameraWindowTitle: {
    ru: 'Запись с камеры',
    en: 'Camera recording',
  },
  cameraWindowPreparing: {
    ru: 'Подготовка камеры',
    en: 'Preparing camera',
  },
  cameraWindowNoMicrophone: {
    ru: 'Микрофон выключен',
    en: 'Microphone is off',
  },
  postRecordTitle: {
    ru: 'Запись сохранена',
    en: 'Recording saved',
  },
  postRecordDescription: {
    ru: 'Запись доступна в галерее. Можно открыть её в видеоредакторе, скачать или удалить.',
    en: 'The recording is available in the gallery. You can open it in the video editor, download, or delete it.',
  },
  postRecordOpenGallery: {
    ru: 'Открыть в галерее',
    en: 'Open in gallery',
  },
  postRecordOpenEditor: {
    ru: 'Открыть в видеоредакторе',
    en: 'Open in video editor',
  },
  postRecordDownload: {
    ru: 'Скачать',
    en: 'Download',
  },
  postRecordClose: {
    ru: 'Закрыть',
    en: 'Close',
  },
  postRecordDelete: {
    ru: 'Удалить',
    en: 'Delete',
  },
  postRecordDeleteConfirm: {
    ru: 'Удалить эту запись? Это действие нельзя отменить.',
    en: 'Delete this recording? This cannot be undone.',
  },
  postRecordActionError: {
    ru: 'Не удалось выполнить действие. Попробуйте ещё раз.',
    en: 'The action failed. Try again.',
  },
  cancelContinueRecording: {
    ru: 'Продолжить запись',
    en: 'Continue recording',
  },
  cancelDeleteRecording: {
    ru: 'Удалить',
    en: 'Delete',
  },
  savingTitle: {
    ru: 'Пожалуйста, подождите',
    en: 'Please wait',
  },
  savingDescription: {
    ru: 'Запись сохраняется. Это может занять несколько секунд.',
    en: 'The recording is being saved. This may take a few seconds.',
  },
});
