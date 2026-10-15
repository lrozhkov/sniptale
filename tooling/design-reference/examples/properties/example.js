import { el, exampleCase } from '../shared/dom.js';
import { PropertyList, RelatedObjects } from '../shared/properties.js';
export function render(root, { manifest }) {
  const locale = new URLSearchParams(location.search).get('lang') === 'en' ? 'en-US' : 'ru-RU';
  const add = (id, children) =>
    root.append(
      exampleCase(
        manifest.cases.find((c) => c.id === 'properties.' + id),
        [el('div', { class: 'case-stage' }, children)]
      )
    );
  add(
    'metadata',
    PropertyList({
      items: [
        { label: 'Тип файла', value: 'MP4' },
        { label: 'Размеры', value: '1920 × 1080' },
        { label: 'Длительность', value: '02:38' },
        {
          label: 'Размер файла',
          value: new Intl.NumberFormat(locale).format(24.8) + (locale === 'ru-RU' ? ' МБ' : ' MB'),
        },
        {
          label: 'Дата создания',
          value: new Intl.DateTimeFormat(locale, {
            dateStyle: 'short',
            timeStyle: 'short',
            timeZone: 'Europe/Moscow',
          }).format(new Date('2026-10-15T11:32:00Z')),
        },
      ],
    }).element
  );
  add(
    'copy',
    PropertyList({
      items: [
        {
          label: 'Идентификатор источника',
          value: 'media-2026-10-15-e9c7f804-2450-4fc8-a610',
          copy: true,
          copyLabel: 'Копировать идентификатор источника',
        },
        {
          label: 'Исходное имя файла',
          userContent: true,
          value: 'Запись демонстрации проекта и обсуждения финального интерфейса.mp4',
        },
      ],
    }).element
  );
  const destination = el('div', {
    id: 'related-project-' + root.dataset.theme,
    tabindex: '-1',
    class: 'related-destination',
  });
  const related = RelatedObjects({
    items: [
      {
        name: 'Демонстрация продукта · финальная версия',
        href: '#related-project-' + root.dataset.theme,
      },
      { name: 'Обучающее видео для новой команды', href: '#related-project-' + root.dataset.theme },
      { name: 'Архивный проект', unavailable: true, reason: 'Проект недоступен' },
    ],
  });
  for (const link of related.querySelectorAll('a'))
    link.addEventListener('click', (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      destination.textContent = 'Демонстрационный переход: ' + link.innerText;
      destination.focus();
    });
  add('related', [related, destination]);
  add(
    'absence',
    PropertyList({
      items: [
        { label: 'Аудиодорожка', value: 'Нет' },
        { label: 'Дата исходного файла', value: 'Недоступно' },
      ],
    }).element
  );
}
