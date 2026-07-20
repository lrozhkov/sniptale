import { defineMessageSource } from '../source';

export const popupVideoMediaMessages = defineMessageSource({
  microphoneToggleLabel: {
    ru: 'Микрофон',
    en: 'Microphone',
  },
  microphoneToggleDescription: {
    ru: 'Внешний микрофон',
    en: 'External microphone',
  },
  webcamToggleLabel: {
    ru: 'Камера',
    en: 'Camera',
  },
  webcamToggleDescription: {
    ru: 'Отдельная видеодорожка',
    en: 'Separate video track',
  },
  microphoneRowLabel: {
    ru: 'Микрофон',
    en: 'Microphone',
  },
  microphoneRowAria: {
    ru: 'Строка выбора микрофона',
    en: 'Microphone device row',
  },
  microphoneLoading: {
    ru: 'Читаю список микрофонов...',
    en: 'Loading microphones...',
  },
  microphonePlaceholder: {
    ru: 'Выберите микрофон',
    en: 'Select a microphone',
  },
  microphoneEmpty: {
    ru: 'После выдачи доступа список микрофонов появится здесь.',
    en: 'The microphone list will appear here after permission is granted.',
  },
  microphoneAria: {
    ru: 'Устройство микрофона',
    en: 'Microphone device',
  },
  microphoneSettingsAction: {
    ru: 'Настройка',
    en: 'Settings',
  },
  microphoneSettingsActionAria: {
    ru: 'Настроить микрофон',
    en: 'Configure microphone',
  },
  microphoneSettingsTitle: {
    ru: 'Настройка микрофона',
    en: 'Microphone settings',
  },
  microphoneSettingsNoDevice: {
    ru: 'Выберите микрофон, чтобы проверить звук и применить настройки.',
    en: 'Select a microphone to test audio and apply settings.',
  },
  microphoneSettingsLoading: {
    ru: 'Проверяю микрофон...',
    en: 'Checking microphone...',
  },
  microphoneSettingsError: {
    ru: 'Не удалось включить проверку микрофона.',
    en: 'Could not start microphone check.',
  },
  microphoneSettingsActualUnknown: {
    ru: 'Микрофон ещё не подтвердил параметры',
    en: 'The microphone has not confirmed settings yet',
  },
  microphoneSettingsActual: {
    ru: 'Сейчас: {settings}',
    en: 'Now using: {settings}',
  },
  microphoneActualSampleRate: {
    ru: '{value} кГц',
    en: '{value} kHz',
  },
  microphoneActualChannelOne: {
    ru: '1 канал',
    en: '1 channel',
  },
  microphoneActualChannels: {
    ru: '{value} каналов',
    en: '{value} channels',
  },
  microphoneActualEnabled: {
    ru: '{label}: включено',
    en: '{label}: on',
  },
  microphoneActualDisabled: {
    ru: '{label}: выключено',
    en: '{label}: off',
  },
  microphoneLevelLabel: {
    ru: 'Уровень входящего звука',
    en: 'Input level',
  },
  microphoneEchoCancellation: {
    ru: 'Подавление эха',
    en: 'Echo cancellation',
  },
  microphoneNoiseSuppression: {
    ru: 'Шумоподавление',
    en: 'Noise suppression',
  },
  microphoneAutoGainControl: {
    ru: 'Автоусиление',
    en: 'Auto gain',
  },
  microphoneGainLabel: {
    ru: 'Громкость микрофона для записи',
    en: 'Microphone volume for recording',
  },
  microphoneStatusApplied: {
    ru: 'Применено',
    en: 'Applied',
  },
  microphoneStatusUnsupported: {
    ru: 'Не поддерживается',
    en: 'Unsupported',
  },
  microphoneStatusUnknown: {
    ru: 'По возможности',
    en: 'When available',
  },
  microphoneStatusNotConfirmed: {
    ru: 'Браузер не подтвердил',
    en: 'Not confirmed by browser',
  },
  microphoneStatusError: {
    ru: 'Ошибка применения',
    en: 'Apply error',
  },
  microphoneTestTitle: {
    ru: 'Проверка звука',
    en: 'Sound check',
  },
  microphoneTestRecord: {
    ru: 'Записать тест',
    en: 'Record test',
  },
  microphoneTestStop: {
    ru: 'Остановить',
    en: 'Stop',
  },
  microphoneTestPlay: {
    ru: 'Воспроизвести',
    en: 'Play',
  },
  microphoneTestDelete: {
    ru: 'Удалить тест',
    en: 'Delete test',
  },
  microphoneTestRecording: {
    ru: 'Идёт тестовая запись',
    en: 'Recording test',
  },
  microphoneTestReady: {
    ru: 'Тест готов',
    en: 'Test ready',
  },
  webcamRowLabel: {
    ru: 'Камера',
    en: 'Camera',
  },
  webcamRowAria: {
    ru: 'Строка выбора камеры',
    en: 'Camera device row',
  },
  webcamLoading: {
    ru: 'Читаю список камер...',
    en: 'Loading cameras...',
  },
  webcamPlaceholder: {
    ru: 'Выберите камеру',
    en: 'Select a camera',
  },
  webcamEmpty: {
    ru: 'После выдачи доступа список камер появится здесь.',
    en: 'The camera list will appear here after permission is granted.',
  },
  webcamAria: {
    ru: 'Устройство камеры',
    en: 'Camera device',
  },
  webcamSettingsAction: {
    ru: 'Настройка',
    en: 'Settings',
  },
  webcamSettingsActionAria: {
    ru: 'Настроить качество камеры',
    en: 'Configure camera quality',
  },
  webcamQualityTitle: {
    ru: 'Настройка камеры',
    en: 'Camera settings',
  },
  webcamQualityBrowserNotice: {
    ru: 'Браузер отдаёт диапазоны возможностей камеры, поэтому пресеты применяются как предпочтительные значения.',
    en: 'The browser exposes camera capability ranges, so presets are applied as preferred values.',
  },
  webcamQualityPreviewLoading: {
    ru: 'Включаю превью камеры...',
    en: 'Starting camera preview...',
  },
  webcamQualityPreviewEmpty: {
    ru: 'Выберите камеру, чтобы увидеть превью.',
    en: 'Select a camera to see the preview.',
  },
  webcamQualityPreviewError: {
    ru: 'Не удалось включить превью камеры.',
    en: 'Could not start the camera preview.',
  },
  webcamQualityResolutionLabel: {
    ru: 'Разрешение',
    en: 'Resolution',
  },
  webcamQualityFrameRateLabel: {
    ru: 'Частота кадров',
    en: 'Frame rate',
  },
  webcamQualityAuto: {
    ru: 'Авто',
    en: 'Auto',
  },
  webcamQualityResolution720p: {
    ru: '720p',
    en: '720p',
  },
  webcamQualityResolution1080p: {
    ru: '1080p',
    en: '1080p',
  },
  webcamQualityResolution1440p: {
    ru: '1440p',
    en: '1440p',
  },
  webcamQualityResolution4k: {
    ru: '4K',
    en: '4K',
  },
  webcamQualityFrameRate30: {
    ru: '30 fps',
    en: '30 fps',
  },
  webcamQualityFrameRate60: {
    ru: '60 fps',
    en: '60 fps',
  },
  webcamQualityActual: {
    ru: 'Получено: {resolution}, {frameRate}',
    en: 'Received: {resolution}, {frameRate}',
  },
  webcamQualityActualFps: {
    ru: '{fps} fps',
    en: '{fps} fps',
  },
  webcamQualityActualFpsUnknown: {
    ru: 'fps не определён',
    en: 'fps unknown',
  },
  webcamQualityActualUnknown: {
    ru: 'Фактическое качество пока не определено',
    en: 'Actual quality is not available yet',
  },
  noMicrophonesError: {
    ru: 'Не найдено доступных микрофонов',
    en: 'No available microphones found',
  },
  microphoneAccessError: {
    ru: 'Не удалось получить доступ к микрофону',
    en: 'Failed to access the microphone',
  },
  noWebcamsError: {
    ru: 'Не найдено доступных камер',
    en: 'No available cameras found',
  },
  webcamAccessError: {
    ru: 'Не удалось получить доступ к камере',
    en: 'Failed to access the camera',
  },
});
