function appendElement<T extends keyof HTMLElementTagNameMap>(
  parent: HTMLElement,
  tagName: T,
  props?: Partial<HTMLElementTagNameMap[T]>
): HTMLElementTagNameMap[T] {
  const element = document.createElement(tagName);
  if (props) {
    Object.assign(element, props);
  }
  parent.append(element);
  return element;
}

export function buildGenericArticleFixture() {
  document.title = 'Типовые схемы развертывания';

  const main = appendElement(document.body, 'div');
  main.setAttribute('role', 'main');
  appendElement(main, 'nav', {
    className: 'MCBreadcrumbsBox',
    textContent: 'Техническое администрирование > Типовые схемы развертывания',
  });
  const article = appendElement(main, 'article');

  appendElement(article, 'h1', {
    textContent: 'Типовые схемы развертывания',
  });
  appendElement(article, 'p', {
    textContent:
      'Системы, построенные на основе SD Pro, могут быть развернуты в различных конфигурациях.',
  });
  appendElement(article, 'h2', {
    textContent: 'Типовые наборы компонентов систем на базе SD Pro',
  });
  appendElement(article, 'p', {
    textContent:
      'Продуктивный стенд в инфраструктуре клиента определяется предполагаемым количеством ' +
      'одновременно работающих пользователей.',
  });

  return main;
}

export function buildGenericDocsFixture() {
  document.title = 'Типовые схемы развертывания';

  const main = appendElement(document.body, 'main');
  const article = appendElement(main, 'article');
  appendElement(article, 'h1', {
    textContent: 'Типовые схемы развертывания',
  });
  appendElement(article, 'p', {
    textContent:
      'Системы, построенные на основе SD Pro, могут быть развернуты в различных конфигурациях.',
  });
  appendElement(article, 'h2', {
    textContent: 'Типы компонентов систем SD Pro',
  });
  appendElement(article, 'p', {
    textContent:
      'При более значительных планируемых нагрузках предлагается использование кластерных конфигураций системы.',
  });
  const table = appendElement(article, 'table') as HTMLTableElement;
  const head = appendElement(table, 'thead');
  const headerRow = appendElement(head, 'tr');
  appendElement(headerRow, 'th', { textContent: 'Тип компонента' });
  appendElement(headerRow, 'th', { textContent: 'Наличие' });
  const body = appendElement(table, 'tbody');
  const row = appendElement(body, 'tr');
  appendElement(row, 'td', { textContent: 'SD Pro Singleton' });
  appendElement(row, 'td', { textContent: 'да' });
  const code = appendElement(article, 'pre');
  code.textContent = 'sd_pro_small';

  return main;
}

export function buildGenericSearchFixture() {
  document.title = 'яндекс ключ для windows — результаты поиска';
  window.history.replaceState({}, '', '/search?q=yandex+windows+key');

  const main = appendElement(document.body, 'main');
  for (let index = 1; index <= 5; index += 1) {
    const result = appendElement(main, 'article');
    const heading = appendElement(result, 'h2');
    appendElement(heading, 'a', {
      href: `https://example.com/result-${index}`,
      textContent: `Результат ${index}: инструкция по ключам Windows`,
    });
    appendElement(result, 'p', {
      textContent:
        'Подробное описание результата поиска с пояснением, дополнительным контекстом и полезными ссылками.',
    });
  }

  return main;
}
