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

export function buildServiceCallSummaryFixture() {
  document.title = 'Карточка запроса';
  const container = appendElement(document.body, 'div', { id: 'serviceCall' });
  const title = appendElement(container, 'div', { id: 'ServiceCall__title' });
  appendElement(title, 'span', { textContent: 'RP49784' });
  appendElement(container, 'div', {
    className: 'StatusTag__tag ServiceCallStatus__status',
    textContent: 'В работе',
  });
  const serviceTitle = appendElement(container, 'div', {
    className: 'DetailsHead__serviceTitle',
  });
  serviceTitle.append(
    'Услуга: ',
    appendElement(serviceTitle, 'span', { textContent: 'Услуга LR' })
  );
  return container;
}

function buildGwtPropertyListRoot() {
  const propertyList = appendElement(document.body, 'div', {
    id: 'gwt-debug-PropertyList$main',
  });
  appendElement(propertyList, 'div', {
    id: 'gwt-debug-PropertyList$main-title',
    textContent: 'Основная информация',
  });
  return propertyList;
}

function appendGwtAttrList(propertyList: HTMLElement) {
  const attrList = appendElement(propertyList, 'table', {
    className: 'attrList',
  }) as HTMLTableElement;
  const attrListBody = appendElement(attrList, 'tbody');

  const descriptionRow = appendElement(attrListBody, 'tr');
  appendElement(descriptionRow, 'td', {
    className: 'attrTitle',
    textContent: 'Описание:',
  });
  appendElement(descriptionRow, 'td', {
    className: 'attrValue',
    textContent: 'Тест списков стоимости',
  });

  const serviceRow = appendElement(attrListBody, 'tr');
  appendElement(serviceRow, 'td', {
    className: 'attrTitle',
    textContent: 'Головная услуга:',
  });
  const serviceValue = appendElement(serviceRow, 'td', {
    className: 'attrValue',
  });
  appendElement(serviceValue, 'a', {
    href: '/operator/#uuid:serviceCall$123',
    textContent: 'Серверное оборудование MAP',
  });
}

function appendGwtTable(propertyList: HTMLElement) {
  const table = appendElement(propertyList, 'table', {
    className: 'cellTableWidget',
  }) as HTMLTableElement;
  const tableHead = appendElement(table, 'thead');
  const headerRow = appendElement(tableHead, 'tr');
  appendElement(headerRow, 'th', { textContent: 'Название' });
  appendElement(headerRow, 'th', { textContent: 'Системный статус' });
  const tableBody = appendElement(table, 'tbody');
  const dataRow = appendElement(tableBody, 'tr', {
    className: 'tableRow',
  });
  appendElement(dataRow, 'td', { textContent: 'Антивирусное ПО (6912)' });
  appendElement(dataRow, 'td', { textContent: 'Активно' });
}

function appendGwtComments() {
  const comments = appendElement(document.body, 'div', {
    id: 'comments',
  });
  appendElement(comments, 'div', {
    className: 'Title__title',
    textContent: 'Комментарии',
  });
  const comment = appendElement(comments, 'div', {
    id: 'comment$104306031',
    className: 'Comment__comment',
  });
  appendElement(comment, 'div', {
    className: 'Comment__author',
    textContent: 'Тестов Тест Тестович',
  });
  appendElement(comment, 'div', {
    className: 'Comment__date',
    textContent: '01.01.2000 10:00',
  });
  appendElement(comment, 'div', {
    className: 'Comment__text',
    textContent: 'Тест',
  });
}

export function buildGwtSectionFixture() {
  document.title = 'Карточка КЕ';

  const propertyList = buildGwtPropertyListRoot();
  appendGwtAttrList(propertyList);
  appendGwtTable(propertyList);
  appendGwtComments();
  return propertyList;
}
