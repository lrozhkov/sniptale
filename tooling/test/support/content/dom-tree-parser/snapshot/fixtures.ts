import { ensureIframeDocument } from '../mvs/fixture-dom';

export function createDynamicFieldsIframe(): Document {
  const iframe = document.createElement('iframe');
  iframe.id = 'iframe$dynamic-fields';
  iframe.setAttribute('data-application-code', 'dynamicFields');
  iframe.setAttribute('data-origin', 'readForm');
  document.body.append(iframe);
  const iframeDoc = ensureIframeDocument(iframe);
  const mountRoot = iframeDoc.createElement('div');
  mountRoot.id = 'root';
  iframeDoc.body.append(mountRoot);
  return iframeDoc;
}

export function populateDynamicFieldsIframe(iframeDoc: Document): void {
  const root = iframeDoc.getElementById('root') ?? iframeDoc.createElement('div');
  root.replaceChildren();
  const group = iframeDoc.createElement('div');
  group.className = 'AppFieldsGroup__group';
  const field = iframeDoc.createElement('div');
  field.className = 'FormField-EA__field FormField-EA__fieldRead';
  const fieldInfo = iframeDoc.createElement('div');
  fieldInfo.className = 'FormField-EA__fieldInfo';
  const label = iframeDoc.createElement('span');
  label.textContent = 'Принадлежность к ДИТиЦР/ДИБ';
  const fieldBody = iframeDoc.createElement('div');
  fieldBody.className = 'FormField-EA__fieldBody';
  const link = iframeDoc.createElement('a');
  link.href = '#dit';
  link.textContent = 'ДИБ';

  fieldInfo.append(label);
  fieldBody.append(link);
  field.append(fieldInfo, fieldBody);
  group.append(field);
  root.append(group);
}

export function createNaumenDynamicFieldsContainer(): Document {
  const container = document.createElement('div');
  container.className = 'GAQEVERFM GAQEVERCOC GAQEVERGOC GAQEVERPOC GAQEVERBOC GAQEVERJOC';
  container.id = 'gwt-debug-EmbeddedApplicationContent.dynamicFields';

  const actions = document.createElement('div');
  actions.className = 'GAQEVERBM actionsForceEnabled';
  const title = document.createElement('span');
  title.className = 'gwt-InlineHTML GAQEVERAM fontIcon up';
  title.id = 'gwt-debug-title';
  title.textContent = 'Дополнительные параметры';

  const outer = document.createElement('div');
  outer.className = 'GAQEVERCM';
  outer.id = 'gwt-debug-outer';
  const scrollable = document.createElement('div');
  scrollable.id = 'gwt-debug-scrollableArea';
  scrollable.className = 'wide-content';
  const iframe = document.createElement('iframe');
  iframe.id = 'iframe$846185a6-b474-0cc2-bd66-0125b3ab0fb5';
  iframe.setAttribute('data-application-code', 'dynamicFields');
  iframe.setAttribute('data-origin', 'readForm');

  actions.append(title);
  scrollable.append(iframe);
  outer.append(scrollable);
  container.append(actions, outer);
  document.body.append(container);

  const iframeDoc = ensureIframeDocument(iframe);
  const mountRoot = iframeDoc.createElement('div');
  mountRoot.id = 'root';
  iframeDoc.body.append(mountRoot);
  return iframeDoc;
}

export function populateNaumenDynamicFieldsIframe(iframeDoc: Document): void {
  const root = iframeDoc.getElementById('root') ?? iframeDoc.createElement('div');
  root.replaceChildren();

  const wrapper = iframeDoc.createElement('div');
  const editLinkTop = iframeDoc.createElement('a');
  editLinkTop.className = 'AppFields__editSaveLink';
  editLinkTop.href = 'javascript:';
  editLinkTop.textContent = 'Редактировать';

  const bodyWrapper = iframeDoc.createElement('div');
  const group = iframeDoc.createElement('div');
  group.className = 'AppFieldsGroup__group';
  const field = iframeDoc.createElement('div');
  field.className = 'FormField-EA__field FormField-EA__fieldRead';
  field.id = 'row-attrGroups$43044203-service$42839306-supService-attrs$43044405';
  const fieldInfo = iframeDoc.createElement('div');
  fieldInfo.className = 'FormField-EA__fieldInfo';
  const label = iframeDoc.createElement('span');
  label.textContent = 'Принадлежность к ДИТиЦР/ДИБ';
  const fieldBody = iframeDoc.createElement('div');
  fieldBody.className = 'FormField-EA__fieldBody';
  const controlBox = iframeDoc.createElement('div');
  controlBox.className = 'FormField-EA__controlBox';
  const control = iframeDoc.createElement('div');
  control.className = 'FormField-EA__control';
  const value = iframeDoc.createElement('div');
  value.className = 'TreeSearchSelectField-EA__value';
  const valueRow = iframeDoc.createElement('div');
  const link = iframeDoc.createElement('a');
  link.href = '../operator/#uuid:analyticalCat$38554202';
  link.textContent = 'ДИБ';
  const editLinkBottom = iframeDoc.createElement('a');
  editLinkBottom.className = 'AppFields__editSaveLink';
  editLinkBottom.href = 'javascript:';
  editLinkBottom.textContent = 'Редактировать';

  valueRow.append(link);
  value.append(valueRow);
  control.append(value);
  controlBox.append(control);
  fieldBody.append(controlBox);
  fieldInfo.append(label);
  field.append(fieldInfo, fieldBody);
  group.append(field);
  bodyWrapper.append(group);
  wrapper.append(editLinkTop, bodyWrapper, editLinkBottom);
  root.append(wrapper);
}
