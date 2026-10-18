import { el, addCaseStage, paramRow } from '../shared/dom.js';
import { Tabs, Disclosure, CategoryNavigation } from '../shared/navigation.js';
import { TextField } from '../shared/fields.js';
import { ActionButton } from '../shared/buttons.js';
export function render(root, { manifest, theme }) {
  const name = TextField({ label: 'Черновик названия', value: 'Вступление' });
  addCaseStage(root, manifest, 'navigation.automatic').append(
    Tabs({
      label: 'Разделы инспектора',
      items: [
        { id: 'scene', label: 'Сцена', content: name.element },
        { id: 'selection', label: 'Выделение', content: paramRow('Объект', 'Подпись') },
        {
          id: 'history',
          label: 'История',
          content: el('p', { text: 'Последняя операция: изменение названия' }),
        },
      ],
    }).element
  );
  addCaseStage(root, manifest, 'navigation.manual').append(
    Tabs({
      label: 'Предпросмотр материала',
      activation: 'manual',
      orientation: 'vertical',
      items: [
        {
          id: 'image',
          label: 'Изображение',
          content: el('p', { text: 'Предпросмотр изображения' }),
        },
        { id: 'video', label: 'Видео', content: el('p', { text: 'Предпросмотр видео' }) },
        {
          id: 'unavailable',
          label: 'Аудио',
          disabled: true,
          content: el('p', { text: 'Недоступно' }),
        },
      ],
    }).element,
    el('p', { text: 'Стрелки перемещают фокус. Enter или Space активирует раздел.' })
  );
  addCaseStage(root, manifest, 'navigation.categories').append(
    CategoryNavigation({
      label: 'Категории параметров',
      items: [
        { label: 'Все', content: paramRow('Параметры', 'Все категории') },
        { label: 'Холст', content: paramRow('Пропорции', '16:9') },
        { label: 'Шапка', content: paramRow('Тип', 'Браузер') },
      ],
    }).element
  );
  const disclosureStage = addCaseStage(root, manifest, 'navigation.disclosure'),
    mount = el('div');
  let section;
  function build() {
    section?.destroy();
    const nested = Disclosure({
      label: 'Тень',
      namespace: 'reference-' + theme,
      preferenceKey: ['gallery', 'scene', 'shadow'],
      initiallyOpen: false,
      content: paramRow('Смещение', '12 px'),
    });
    section = Disclosure({
      label: 'Оформление сцены',
      namespace: 'reference-' + theme,
      preferenceKey: ['gallery', 'scene', 'appearance'],
      level: 'section',
      content: [paramRow('Поверхность', 'Бумага'), nested.element],
    });
    mount.replaceChildren(section.element);
  }
  build();
  disclosureStage.append(
    mount,
    ActionButton({ label: 'Пересоздать пример', onClick: build }),
    el('p', {
      text: 'Раскрытие хранится для стабильной группы. Значение параметра от раскрытия не меняется.',
    })
  );
  const destinations = addCaseStage(root, manifest, 'navigation.destinations'),
    nav = el('nav', { class: 'destination-nav', 'aria-label': 'Разделы справки' });
  for (const [id, label] of [
    ['general', 'Общие'],
    ['shortcuts', 'Горячие клавиши'],
  ]) {
    const key = 'destination-' + theme + '-' + id;
    nav.append(el('a', { href: '#' + key, text: label }));
    destinations.append(
      el(
        'section',
        { id: key, class: 'destination-section', tabindex: '-1' },
        el('h4', { text: label })
      )
    );
  }
  destinations.prepend(nav);
  const scroll = el('div', {
    class: 'nav-scroll-owner',
    tabindex: '0',
    'aria-label': 'Прокручиваемые группы',
  });
  for (let i = 0; i < 8; i++)
    scroll.append(
      Disclosure({
        label: 'Группа ' + (i + 1),
        namespace: 'reference-' + theme,
        preferenceKey: ['scroll', 'group-' + i],
        content: paramRow('Значение', 'Сохранено'),
      }).element
    );
  addCaseStage(root, manifest, 'navigation.scroll').append(scroll);
}
