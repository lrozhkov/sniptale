import { defineMessageSource } from '../source';

export const galleryVideoReviewMusicMessages = defineMessageSource({
  audioMusic: { ru: 'Музыка', en: 'Music' },
  audioImport: { ru: 'Добавить аудиофайл', en: 'Add audio file' },
  musicNoSpace: {
    ru: 'Здесь нет свободного места для музыки. Выберите другую позицию.',
    en: 'No room for music here. Choose another position.',
  },
  musicChanged: {
    ru: 'Проект изменился. Откройте библиотеку снова.',
    en: 'The project changed. Open the library again.',
  },
  musicRetryPrevious: {
    ru: 'Повторите предыдущее добавление или закройте библиотеку.',
    en: 'Retry the previous addition or close the library.',
  },
  musicUnsupported: {
    ru: 'Этот аудиоформат не поддерживается.',
    en: 'This audio format is not supported.',
  },
  musicTooLarge: { ru: 'Аудиофайл больше 64 МиБ.', en: 'Audio exceeds 64 MiB.' },
  musicTooLong: {
    ru: 'Допустимая длительность: от 0,05 до 3600 секунд.',
    en: 'Audio must be between 0.05 and 3600 seconds.',
  },
  musicLibrary: { ru: 'Музыка из библиотеки', en: 'Music from Library' },
  musicAll: { ru: 'Все аудиозаписи', en: 'All audio' },
  musicFilter: { ru: 'Фильтр аудиозаписей', en: 'Audio filter' },
  musicSearch: { ru: 'Найти аудио', en: 'Find audio' },
  musicUpload: { ru: 'Загрузить с компьютера', en: 'Upload from computer' },
  musicAdd: { ru: 'Добавить', en: 'Add' },
  musicPlay: { ru: 'Прослушать', en: 'Listen' },
  musicStop: { ru: 'Остановить', en: 'Stop' },
  musicLoading: { ru: 'Загрузка…', en: 'Loading…' },
  musicAdding: { ru: 'Добавление…', en: 'Adding…' },
  musicEmpty: {
    ru: 'Аудиозаписи не найдены. Загрузите файл или измените поиск и фильтр.',
    en: 'No audio found. Upload a file or change the search and filter.',
  },
  musicListFailed: { ru: 'Не удалось загрузить аудиозаписи.', en: 'Could not load audio.' },
  musicRetry: { ru: 'Повторить', en: 'Retry' },
  musicFailed: {
    ru: 'Не удалось выполнить действие. Повторите попытку.',
    en: 'Could not complete the action. Try again.',
  },
  musicDurationUnknown: { ru: 'Длительность неизвестна', en: 'Unknown duration' },
});
