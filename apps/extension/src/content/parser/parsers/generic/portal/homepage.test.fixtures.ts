function appendElement<T extends keyof HTMLElementTagNameMap>(
  parent: HTMLElement,
  tagName: T,
  props?: Partial<HTMLElementTagNameMap[T]>
): HTMLElementTagNameMap[T] {
  const element = document.createElement(tagName);
  Object.assign(element, props ?? {});
  parent.append(element);
  return element;
}

function appendServiceCallCard(
  parent: HTMLElement,
  props: {
    description: string;
    requestNumber: string;
    service: string;
    specificDate: string;
    status: string;
    type: string;
  }
) {
  const card = appendElement(parent, 'div', { className: 'ServiceCall__serviceCall' });
  const header = appendElement(card, 'div', {
    className: 'ServiceCall__header ServiceCall__container',
  });
  appendElement(header, 'div', {
    className: 'ServiceCall__serviceAndComponent',
    textContent: props.service,
  });
  const title = appendElement(header, 'div', { className: 'ServiceCall__serviceCallTitle' });
  appendElement(title, 'span', { textContent: props.requestNumber });
  appendElement(header, 'div', {
    className: 'ServiceCall__specificDate',
    textContent: props.specificDate,
  });
  appendElement(header, 'div', {
    className: 'ServiceCall__serviceCallType',
    textContent: props.type,
  });
  const statusContainer = appendElement(header, 'div', {
    className: 'ServiceCall__statusContainer',
  });
  appendElement(statusContainer, 'div', {
    className: 'StatusTag__tag',
    textContent: props.status,
  });

  const content = appendElement(card, 'div', { className: 'ServiceCall__container' });
  const property = appendElement(content, 'div', { className: 'ServiceCall__propertyContainer' });
  appendElement(property, 'span', {
    className: 'ServiceCall__propertyTitle',
    textContent: 'Описание:',
  });
  appendElement(property, 'div', {
    className: 'ServiceCall__propertyValueMultiline',
    textContent: props.description,
  });
}

function appendSearchBlock(parent: HTMLElement) {
  const search = appendElement(parent, 'div', {
    className: 'Block__block SearchBlock__root Main__searchBlock',
  });
  appendElement(search, 'div', {
    className: 'SearchBlock__headerTitle',
    textContent: 'Мы здесь, чтобы помочь вам',
  });
  appendElement(search, 'div', {
    className: 'SearchBlock__headerComment',
    textContent: 'Поиск по порталу самообслуживания',
  });
  appendElement(search, 'a', {
    className: 'CreateServiceCall__block',
    textContent: 'Создать запрос',
  });
}

function appendRequestsSection(parent: HTMLElement) {
  const requestsSection = appendElement(parent, 'div', {
    className: 'Block__block Section__root',
    id: 'pendingServiceCalls',
  });
  const requestsTitle = appendElement(requestsSection, 'div', { className: 'Title__titleLabel' });
  appendElement(requestsTitle, 'a', {
    className: 'Title__title__href',
    textContent: 'Ожидают согласования',
  });
  const requestsItems = appendElement(requestsSection, 'div', { className: 'Section__items' });
  const requestItem = appendElement(requestsItems, 'div', { className: 'Section__item' });
  appendServiceCallCard(requestItem, {
    description: 'Плановые работы по очистке парка компьютеров от пыли',
    requestNumber: 'RP9244',
    service: 'Интернет и Wi-Fi',
    specificDate: '02.07.2026 15:14',
    status: 'Просрочено 15.06.2023 12:55',
    type: 'Подключение',
  });
}

function appendCategoriesSection(parent: HTMLElement) {
  const categoriesSection = appendElement(parent, 'div', {
    className: 'Block__block Section__root',
    id: 'Categories__categories',
  });
  const categoriesTitle = appendElement(categoriesSection, 'div', {
    className: 'Title__titleLabel',
  });
  appendElement(categoriesTitle, 'a', {
    className: 'Title__title__href',
    textContent: 'Популярные услуги',
  });
  const category = appendElement(categoriesSection, 'div', { className: 'Category__category' });
  appendElement(category, 'a', {
    className: 'Category__titleText',
    textContent: 'Категория услуг [Мелихов]',
  });
  appendElement(category, 'a', {
    className: 'Category__serviceLink',
    textContent: 'Техническая сервисная поддержка',
  });
  appendElement(category, 'a', {
    className: 'Category__more',
    textContent: 'Еще >',
  });
}

function appendFooterBlock(parent: HTMLElement) {
  const footer = appendElement(parent, 'footer', { className: 'Footer__footer' });
  const footerBlock = appendElement(footer, 'div', { className: 'Footer__footerBlock' });
  appendElement(footerBlock, 'div', {
    className: 'Footer__footerBlockCaption',
    textContent: 'Статьи базы знаний',
  });
  appendElement(footerBlock, 'a', { textContent: '111222333' });
  appendElement(footerBlock, 'a', { textContent: '123тест' });
}

export function buildPortalHomepageFixture() {
  window.history.replaceState({}, '', '/portal/');
  document.title = 'Эталонный стенд для воспроизведения кейсов';

  const mainRoot = appendElement(document.body, 'div', { className: 'Main__root' });
  const wrapper = appendElement(mainRoot, 'div', { className: 'wrapper' });

  appendSearchBlock(wrapper);
  appendRequestsSection(wrapper);
  appendCategoriesSection(wrapper);
  appendFooterBlock(document.body);
}
