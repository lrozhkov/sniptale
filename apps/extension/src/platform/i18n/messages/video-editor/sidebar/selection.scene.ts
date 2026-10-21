import { defineMessageSource } from '../../source';

export const videoEditorSidebarSelectionSceneMessages = defineMessageSource({
  bookendInsertIntro: { ru: 'Вставить заставку', en: 'Insert intro' },
  bookendInsertOutro: { ru: 'Вставить концовку', en: 'Insert outro' },
  bookendNoMaterials: {
    ru: 'Добавьте изображение или видео в материалы',
    en: 'Add an image or video to materials',
  },
  bookendLocked: {
    ru: 'Разблокируйте затронутые дорожки и повторите вставку.',
    en: 'Unlock the affected tracks and try again.',
  },
  bookendBusy: {
    ru: 'Завершите текущее редактирование и повторите вставку.',
    en: 'Finish the current edit and try again.',
  },
  bookendStale: {
    ru: 'Проект изменился. Выберите материал ещё раз.',
    en: 'The project changed. Choose the material again.',
  },
  sceneEdges: { ru: 'Начало и конец', en: 'Start and end' },
  comments: { ru: 'Заметки', en: 'Notes' },
  commentDeleteDocument: {
    ru: 'Удалить заметки этой привязки',
    en: 'Delete notes for this binding',
  },
  commentNote: { ru: 'Заметка', en: 'Note' },
  commentAddNote: { ru: 'Добавить заметку', en: 'Add note' },
  commentDestination: { ru: 'Привязка по времени', en: 'Time binding' },
  commentProject: { ru: 'Проект', en: 'Project' },
  commentTimeKind: { ru: 'Тип', en: 'Type' },
  commentSourceTime: { ru: 'Время исходника', en: 'Source time' },
  commentPoint: { ru: 'Момент', en: 'Point' },
  commentRange: { ru: 'Интервал', en: 'Range' },
  commentBack: { ru: 'К заметкам', en: 'Back to notes' },
  commentEmpty: { ru: 'Нет заметок', en: 'No notes' },
  commentRefused: {
    ru: 'Правка недоступна. Выберите заметку заново.',
    en: 'This edit is unavailable. Select the note again.',
  },
  originalAudioRestore: { ru: 'Восстановить оригинал', en: 'Restore original' },
  originalAudio: { ru: 'Оригинал', en: 'Original audio' },
  originalAudioKeep: { ru: 'Оставить', en: 'Keep' },
  originalAudioAttenuate: { ru: 'Приглушить', en: 'Attenuate' },
  originalAudioMute: { ru: 'Выключить', en: 'Mute' },
  originalAudioSources: { ru: 'Исходники', en: 'Sources' },
  originalAudioLevel: { ru: 'Уровень оригинала', en: 'Original level' },
  originalAudioMissingSource: { ru: 'Недоступный исходник', en: 'Unavailable source' },
  textVoicePosition: { ru: 'Позиция в проекте', en: 'Project position' },
  textVoiceTrack: { ru: 'Аудиодорожка', en: 'Audio track' },
  textVoiceNewTrack: { ru: 'Новая дорожка', en: 'New track' },
  textVoiceLane: { ru: 'Линия', en: 'Lane' },
  textVoiceStop: { ru: 'Остановить прослушивание', en: 'Stop preview' },
  textVoiceRecordingNext: { ru: 'Далее', en: 'Next' },
  textVoiceSaved: { ru: 'Озвучка сохранена', en: 'Speech saved' },
  textVoicePlacementConflict: {
    ru: 'В этом месте дорожка занята или заблокирована. Выберите другую позицию, линию или новую дорожку.',
    en: 'This track position is occupied or locked. Choose another position, lane or a new track.',
  },
  textVoiceStale: {
    ru: 'Проект или выбранная фраза изменились. Закройте результат и повторите действие для текущего проекта.',
    en: 'The project or selected phrase changed. Close this result and start again for the current project.',
  },
  textVoiceAuditionFailed: {
    ru: 'Не удалось воспроизвести дубль. Повторите прослушивание.',
    en: 'The take could not play. Try previewing it again.',
  },
  textRewriteSaveDisclosure: {
    ru: 'Текущий проект сохраняется перед запросом. Звук, видео и эффекты остаются локально.',
    en: 'The current project is saved before the request. Audio, video and effects stay local.',
  },
  textRewriteSourceScope: {
    ru: 'Правка текста действует на все размещения этого экземпляра исходника. Другие экземпляры независимы.',
    en: 'Text changes follow every placement of this source instance. Other instances are independent.',
  },
  textRewriteProjectScope: {
    ru: 'Текст размещён во времени проекта и не зависит от монтажа исходных клипов.',
    en: 'Text belongs to project time and stays independent of source clip edits.',
  },
  textRewriteProjectTiming: {
    ru: 'Изменение интервалов создаёт отдельный текстовый документ во времени проекта. Размещение и скорость исходных клипов сохраняются.',
    en: 'Changed intervals create a separate text document in project time. Source clips retain their placement and speed.',
  },
  textRewritePlacements: {
    ru: 'Запрос содержит все текущие размещения, включая разрывы и перекрытия. Начало и конец охватывают эти размещения.',
    en: 'The request lists every current placement, including gaps and overlaps. The start and end enclose these placements.',
  },
  textRewriteStale: {
    ru: 'Проект изменился или выбранный текст не полностью входит в текущий монтаж. Закройте форму и проверьте текст и его размещение.',
    en: 'The project changed, or the selection includes text outside the current montage. Close this form and check the text and its placement.',
  },
  recognitionClose: { ru: 'Закрыть результат', en: 'Close result' },
  recognitionFailed: {
    ru: 'Действие не выполнено. Повторите его. Готовый результат остаётся доступен до закрытия.',
    en: 'The action failed. Try again. A completed result remains available until you close it.',
  },
  recognitionSaveRetry: {
    ru: 'Изменения текста применены локально. Повторите применение, чтобы подтвердить сохранение. Закрытие результата не отменяет изменения. Их можно отменить через Undo.',
    en: 'Text changes are applied locally. Apply again to confirm saving. Closing this result keeps the changes. Undo can reverse these changes.',
  },
  recognitionNativeScope: {
    ru: 'Аудио выбранного клипа. Время указано в исходнике, до изменения скорости и размещения на таймлайне.',
    en: 'Audio from the selected clip. Times refer to the source, before playback speed and timeline placement.',
  },
  recognitionInvalidRange: {
    ru: 'Выберите интервал внутри сохранённого фрагмента с аудио.',
    en: 'Choose an interval within the retained clip that contains audio.',
  },
  recognitionSaved: {
    ru: 'Текст сохранён. Он доступен в разделе текста сцены.',
    en: 'Text saved. It is available in the scene text section.',
  },
  canvasFormatLabel: { ru: 'Пропорции', en: 'Aspect ratio' },
  canvasResolutionLabel: { ru: 'Разрешение', en: 'Resolution' },
  canvasFormatWide: { ru: 'Горизонтальный', en: 'Landscape' },
  canvasFormatVertical: { ru: 'Вертикальный', en: 'Vertical' },
  canvasFormatSquare: { ru: 'Квадратный', en: 'Square' },
  canvasFormatPortrait: { ru: 'Портретный', en: 'Portrait' },
  canvasFormatClassic: { ru: 'Классический', en: 'Classic' },
  canvasCustom: { ru: 'Произвольные', en: 'Custom' },
  canvasExactSize: { ru: 'Точные размеры', en: 'Custom dimensions' },
  sceneBackgroundTypeLabel: {
    ru: 'Тип фона',
    en: 'Background type',
  },
  sceneBackgroundSolid: {
    ru: 'Сплошной',
    en: 'Solid',
  },
  sceneBackgroundGradient: {
    ru: 'Градиент',
    en: 'Gradient',
  },
  sceneBackgroundImage: {
    ru: 'Изображение',
    en: 'Image',
  },
  sceneBackgroundColorLabel: {
    ru: 'Цвет фона',
    en: 'Background color',
  },
  sceneBackgroundFromLabel: {
    ru: 'Начальный цвет',
    en: 'Start color',
  },
  sceneBackgroundToLabel: {
    ru: 'Конечный цвет',
    en: 'End color',
  },
  sceneBackgroundAngleLabel: {
    ru: 'Угол, °',
    en: 'Angle, °',
  },
  sceneBackgroundPresetLabel: {
    ru: 'Варианты градиента',
    en: 'Gradient presets',
  },
  sceneBackgroundAnimationModeLabel: {
    ru: 'Анимация',
    en: 'Animation',
  },
  sceneBackgroundAnimationSpeedLabel: {
    ru: 'Скорость',
    en: 'Speed',
  },
  sceneBackgroundAnimationIntensityLabel: {
    ru: 'Интенсивность',
    en: 'Intensity',
  },
  sceneBackgroundAnimationNone: {
    ru: 'Нет',
    en: 'None',
  },
  sceneBackgroundAnimationRotate: {
    ru: 'Вращение',
    en: 'Rotation',
  },
  sceneBackgroundAnimationBreathe: {
    ru: 'Дыхание',
    en: 'Breathing',
  },
  sceneBackgroundAnimationAudioReactive: {
    ru: 'Аудио',
    en: 'Audio',
  },
  sceneBackgroundImageAssetLabel: {
    ru: 'Фоновое изображение',
    en: 'Background image',
  },
  sceneBackgroundImageUpload: { ru: 'Загрузить изображение', en: 'Upload image' },
  sceneBackgroundAnimationDrift: { ru: 'Перетекание', en: 'Flow' },
  sceneBackgroundImageEmpty: {
    ru: 'Изображение заполнит фон; оригинал останется в материалах.',
    en: 'The image fills the background and stays in materials.',
  },
  gridSettingsTitle: {
    ru: 'Сетка',
    en: 'Grid',
  },
  gridSettingsSubtitle: {
    ru: 'Привязка и шаг',
    en: 'Snap and spacing',
  },
  gridSettingsDescription: {
    ru: 'Сетка помогает выравнивать объекты в превью и не меняет экспорт.',
    en: 'The grid helps align objects in preview and does not change export output.',
  },
});
