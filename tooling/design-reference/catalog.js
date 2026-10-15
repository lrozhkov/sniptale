import { installLocale } from './examples/shared/locale.js';
const element = (tag, text) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
};
const theme = document.querySelector('#theme'),
  params = new URLSearchParams(location.search);
let current = params.get('theme') === 'dark' ? 'dark' : 'light';
function paint() {
  document.documentElement.dataset.theme = current;
  theme.textContent = current === 'light' ? 'Тёмная тема' : 'Светлая тема';
}
paint();
theme.addEventListener('click', () => {
  current = current === 'light' ? 'dark' : 'light';
  paint();
  const url = new URL(location.href);
  url.searchParams.set('theme', current);
  history.replaceState(null, '', url);
});
async function loadCatalog() {
  try {
    const response = await fetch('catalog.json');
    if (!response.ok) throw Error('catalog');
    const catalog = await response.json();
    for (const group of catalog.groups) {
      const row = element('tr'),
        name = element('td');
      name.append(element('strong', group.title), element('p', group.description));
      const examples = element('td'),
        rules = element('td'),
        sample = element('a', 'Открыть'),
        rule = element('a', 'Правила');
      sample.href = group.examples[0].url + '&mode=examples';
      rule.href = group.examples[0].url + '&mode=rules';
      examples.append(sample);
      rules.append(rule);
      row.append(name, examples, rules);
      document.querySelector('#groups').append(row);
    }
    installLocale(document.body);
    document.documentElement.dataset.catalogReady = 'true';
  } catch {
    document.querySelector('#status').textContent =
      'Не удалось загрузить каталог. Обновите страницу.';
  }
}
loadCatalog();
