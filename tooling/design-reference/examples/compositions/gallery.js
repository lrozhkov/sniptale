import { ObjectCollection } from '../shared/collections.js';
import { status, note } from '../shared/composition-layout.js';

export function GalleryComposition(parent) {
  const opened = status('Откройте объект или выберите несколько для операции.');
  const collection = ObjectCollection({
    items: [
      { id: 'intro', title: 'Вступление', meta: 'Видео · 00:12' },
      {
        id: 'scene',
        title: 'Демонстрация длинного названия сцены и выбранного фрагмента',
        meta: 'Видео · 00:28',
      },
      { id: 'cover', title: 'Обложка', meta: 'Изображение' },
    ],
    onOpen: (id) =>
      (opened.textContent =
        'Открыт объект: ' +
        {
          intro: 'Вступление',
          scene: 'Демонстрация длинного названия сцены и выбранного фрагмента',
          cover: 'Обложка',
        }[id]),
  });
  parent.append(collection.element, opened);
  note(
    parent,
    'Открытие и массовый выбор остаются разными действиями. Фильтр не отменяет скрытый выбор.'
  );
}
