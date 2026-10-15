import './input-modality.js';
import { installLocale } from './locale.js';
import { el } from './dom.js';
import { renderMarkdown } from './markdown.js';
const root = document.querySelector('#reference-root'),
  group = document.documentElement.dataset.group,
  params = new URLSearchParams(location.search);
async function load() {
  const [catalog, manifest] = await Promise.all([
    fetch('../../catalog.json').then((r) => {
      if (!r.ok) throw Error('catalog');
      return r.json();
    }),
    fetch('cases.json').then((r) => {
      if (!r.ok) throw Error('cases');
      return r.json();
    }),
  ]);
  const info = catalog.groups.find((g) => g.id === group);
  if (!info) throw Error('Unknown group');
  document.title = 'Sniptale · ' + info.title;
  const module = await import('../' + group + '/example.js');
  const ruleURL = new URL('../../../../docs/design/' + manifest.rules, location.href),
    ruleResponse = await fetch(ruleURL);
  if (!ruleResponse.ok) throw Error('rules');
  const ruleText = await ruleResponse.text();
  const header = el('header', { class: 'reference-header' }, [
    el('div', {}, [
      el('a', { class: 'reference-route', href: '../../', text: 'Главная песочницы' }),
      el('h1', { text: info.title }),
      el('p', { text: info.description }),
    ]),
    el('nav', { class: 'reference-nav', 'aria-label': 'Разделы' }, [
      el('a', { href: '../../../../docs/design/index.md', text: 'Design guide' }),
    ]),
  ]);
  const examples = el('main', {
      id: 'reference-examples',
      class: 'theme-list',
      role: 'tabpanel',
      'aria-labelledby': 'examples-tab',
    }),
    rules = el('main', {
      id: 'reference-rules',
      class: 'rules-reader',
      role: 'tabpanel',
      'aria-labelledby': 'rules-tab',
    });
  const tabExamples = el('button', {
      id: 'examples-tab',
      type: 'button',
      class: 'view-button',
      role: 'tab',
      'aria-controls': 'reference-examples',
      text: 'Примеры',
    }),
    tabRules = el('button', {
      id: 'rules-tab',
      type: 'button',
      class: 'view-button',
      role: 'tab',
      'aria-controls': 'reference-rules',
      text: 'Правила',
    });
  function mode(next) {
    const rule = next === 'rules';
    examples.hidden = rule;
    rules.hidden = !rule;
    for (const [tab, active] of [
      [tabExamples, !rule],
      [tabRules, rule],
    ]) {
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    }
    const address = new URL(location.href);
    address.searchParams.set('mode', rule ? 'rules' : 'examples');
    history.replaceState(null, '', address);
    for (const link of themeLinks.querySelectorAll('a')) {
      const target = new URL(link.href);
      target.searchParams.set('mode', rule ? 'rules' : 'examples');
      link.href = target.href;
    }
  }
  tabExamples.addEventListener('click', () => mode('examples'));
  tabRules.addEventListener('click', () => mode('rules'));
  const tabs = el(
    'div',
    { class: 'reference-nav', role: 'tablist', 'aria-label': 'Примеры и правила' },
    [tabExamples, tabRules]
  );
  tabs.addEventListener('keydown', (event) => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const target =
        event.key === 'Home'
          ? tabExamples
          : event.key === 'End'
            ? tabRules
            : document.activeElement === tabExamples
              ? tabRules
              : tabExamples;
      target.click();
      target.focus();
    }
  });
  const themeLinks = el('nav', { class: 'reference-nav', 'aria-label': 'Темы' });
  for (const [value, text] of [
    ['both', 'Обе темы'],
    ['light', 'Светлая'],
    ['dark', 'Тёмная'],
  ]) {
    const address = new URL(location.href);
    address.searchParams.set('view', value);
    themeLinks.append(
      el('a', {
        href: address.href,
        text,
        ...((params.get('view') || 'both') === value ? { 'aria-current': 'page' } : {}),
      })
    );
  }
  const languageLinks = el('nav', { class: 'reference-nav', 'aria-label': 'Язык примеров' });
  for (const [value, text] of [
    ['ru', 'Русский'],
    ['en', 'English'],
  ]) {
    const address = new URL(location.href);
    address.searchParams.set('lang', value);
    languageLinks.append(
      el('a', {
        href: address.href,
        text,
        ...((params.get('lang') || 'ru') === value ? { 'aria-current': 'page' } : {}),
      })
    );
  }
  header.querySelector('nav').append(languageLinks);
  root.replaceChildren(
    header,
    el('div', { class: 'reference-toolbar' }, [tabs, themeLinks]),
    examples,
    rules,
    el('footer', { class: 'reference-footer' }, [
      el('span', { text: 'Образец ' + manifest.version + ' · ожидает проверки пользователя' }),
      el('a', { href: ruleURL.href, text: 'Markdown правил' }),
      el('a', { href: '../../README.md', text: 'О пакете' }),
    ])
  );
  const names = ['light', 'dark'].filter(
    (name) => !['light', 'dark'].includes(params.get('view')) || params.get('view') === name
  );
  examples.classList.toggle('single', names.length === 1);
  for (const name of names) {
    const theme = el(
      'section',
      {
        class: 'theme',
        'data-theme': name,
        'aria-label': name === 'light' ? 'Светлая тема' : 'Тёмная тема',
      },
      el('h2', { text: name === 'light' ? 'Светлая тема' : 'Тёмная тема' })
    );
    examples.append(theme);
    await module.render(theme, { manifest, theme: name });
  }
  renderMarkdown(ruleText, rules, ruleURL);
  mode(params.get('mode'));
  installLocale(root);
  document.documentElement.dataset.referenceReady = 'true';
}
load().catch((error) => {
  root.replaceChildren(
    el('p', { role: 'alert', text: 'Не удалось загрузить образцы. Обновите страницу.' }),
    el('a', { href: '../../', text: 'Главная песочницы' })
  );
  console.error(error);
});
