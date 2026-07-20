import { appendElement, appendIframeElement, ensureIframeDocument } from './dom.helpers';

function createDynamicFieldsIframe(parent: HTMLElement = document.body) {
  const iframe = document.createElement('iframe');
  iframe.id = 'iframe$10462c5b-4aef-2a3f-dd14-11bb0b5a3af1';
  iframe.setAttribute('data-application-code', 'dynamicFields');
  iframe.setAttribute('data-origin', 'readForm');
  iframe.src = `${window.location.origin}/sd/application-dynamicFields/index.html?cacheUuid=103009110`;
  parent.append(iframe);
  return iframe;
}

function populateDynamicFieldsIframe(iframeDoc: Document) {
  const root = appendIframeElement(iframeDoc, iframeDoc.body, 'div', { id: 'root' });
  const wrapper = appendIframeElement(iframeDoc, root, 'div');
  const group = appendIframeElement(iframeDoc, wrapper, 'div', {
    className: 'AppFieldsGroup__group',
  });
  const field = appendIframeElement(iframeDoc, group, 'div', {
    className: 'FormField-EA__field FormField-EA__fieldRead',
  });
  const fieldInfo = appendIframeElement(iframeDoc, field, 'div', {
    className: 'FormField-EA__fieldInfo',
  });
  appendIframeElement(iframeDoc, fieldInfo, 'span', { textContent: 'VIP статус' });
  const fieldBody = appendIframeElement(iframeDoc, field, 'div', {
    className: 'FormField-EA__fieldBody',
  });
  const controlBox = appendIframeElement(iframeDoc, fieldBody, 'div', {
    className: 'FormField-EA__controlBox',
  });
  const control = appendIframeElement(iframeDoc, controlBox, 'div', {
    className: 'FormField-EA__control',
  });
  const value = appendIframeElement(iframeDoc, control, 'div', {
    className: 'TreeSearchSelectField-EA__value',
  });
  const valueRow = appendIframeElement(iframeDoc, value, 'div');
  appendIframeElement(iframeDoc, valueRow, 'a', {
    href: '../operator/#uuid:analyticalCat$52209726',
    textContent: 'Нет',
  });
}

export function buildDynamicFieldsIframe() {
  const iframe = createDynamicFieldsIframe();
  const iframeDoc = ensureIframeDocument(iframe);
  populateDynamicFieldsIframe(iframeDoc);
  return iframe;
}

export function buildEmbeddedDynamicFieldsSection() {
  const section = appendElement(document.body, 'div', {
    id: 'gwt-debug-EmbeddedApplicationContent.dynamicFields',
    className: 'GAQEVERFM',
  });
  appendElement(section, 'span', {
    id: 'gwt-debug-title',
    textContent: 'Дополнительные параметры',
  });
  const iframe = createDynamicFieldsIframe(section);
  const iframeDoc = ensureIframeDocument(iframe);
  populateDynamicFieldsIframe(iframeDoc);
  return section;
}
