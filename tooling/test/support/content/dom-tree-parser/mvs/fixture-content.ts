import { appendIframeElement } from './fixture-dom';

function buildMvsSummaryBlock(doc: Document, parent: HTMLElement): void {
  const block = appendIframeElement(doc, parent, 'div', {
    id: 'h_mx_group-service$42839306',
  });
  appendIframeElement(doc, block, 'div', {
    textContent: 'Лицензии',
    title: 'Лицензии',
  }).setAttribute('data-uuid', 'service$42839306');

  const row = appendIframeElement(doc, appendIframeElement(doc, block, 'div'), 'div');
  appendIframeElement(doc, row, 'span', { textContent: 'Менеджеры услуги : ' });
  appendIframeElement(doc, appendIframeElement(doc, row, 'span'), 'span', {
    textContent: 'Мелихов Игорь Андреевич',
  });
}

function buildMvsCardBlock(doc: Document, parent: HTMLElement): void {
  const block = appendIframeElement(doc, parent, 'div', {
    id: 'dom_card-objectBase$47277013',
  });
  const titleData = appendIframeElement(doc, block, 'div');
  titleData.setAttribute('data-uuid', 'objectBase$47277013');
  titleData.setAttribute('data-title', 'Антивирусное ПО (6912)');

  const content = appendIframeElement(doc, block, 'div');
  const titleRow = appendIframeElement(doc, content, 'div');
  appendIframeElement(doc, titleRow, 'a', {
    className: '_1tNYBANxOj8kXqlvWhpU5f',
    href: '../operator/#uuid:objectBase$47277013',
    textContent: 'Антивирусное ПО (6912)',
    target: '_top',
  });

  const details = appendIframeElement(doc, content, 'div');
  const statusRow = appendIframeElement(doc, details, 'div', { className: 'mvs-row' });
  appendIframeElement(doc, statusRow, 'span', { textContent: 'Системный статус: ' });
  const statusValue = appendIframeElement(doc, statusRow, 'span');
  appendIframeElement(doc, statusValue, 'span');
  appendIframeElement(doc, statusValue, 'span', {
    id: 'mvs-status-value',
    textContent: 'Активно',
  });

  const typeRow = appendIframeElement(doc, details, 'div', { className: 'mvs-row' });
  appendIframeElement(doc, typeRow, 'span', { textContent: 'Тип Актива / КЕ: ' });
  appendIframeElement(doc, appendIframeElement(doc, typeRow, 'span'), 'span', {
    textContent: 'Программное обеспечение',
  });
}

function buildMvsChrome(doc: Document): void {
  const stickyBlock = appendIframeElement(doc, doc.body, 'div', { id: 'ui-stickyBlock' });
  const autoRefresh = appendIframeElement(doc, stickyBlock, 'div', { id: 'ui-auto-refresh' });
  const form = appendIframeElement(doc, autoRefresh, 'form');
  const checkboxRow = appendIframeElement(doc, form, 'p');
  appendIframeElement(doc, checkboxRow, 'input', {
    id: 'auto-refresh-checkbox',
    type: 'checkbox',
  });
  appendIframeElement(doc, checkboxRow, 'label', {
    htmlFor: 'auto-refresh-checkbox',
    textContent: 'Автообновление схемы',
  });
  const inputRow = appendIframeElement(doc, form, 'p');
  appendIframeElement(doc, inputRow, 'input', {
    id: 'auto-refresh-input',
    type: 'text',
    value: '3',
  });
  appendIframeElement(doc, inputRow, 'label', {
    htmlFor: 'auto-refresh-input',
    textContent: 'минут',
  });
}

export function populateNaumenMvsIframe(iframeDoc: Document): void {
  const graph = appendIframeElement(iframeDoc, iframeDoc.body, 'div', { id: 'graph' });
  const svg = appendIframeElement(iframeDoc, graph, 'svg');
  const group = appendIframeElement(iframeDoc, svg, 'g');
  const foreignObject = appendIframeElement(iframeDoc, group, 'foreignObject');
  foreignObject.setAttribute('width', '612');
  foreignObject.setAttribute('height', '320');

  const foreignRoot = appendIframeElement(iframeDoc, foreignObject, 'div');
  foreignRoot.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  buildMvsSummaryBlock(iframeDoc, foreignRoot);
  buildMvsCardBlock(iframeDoc, foreignRoot);

  appendIframeElement(iframeDoc, group, 'path').setAttribute('d', 'M 1 1 L 2 2');
  buildMvsChrome(iframeDoc);
}
