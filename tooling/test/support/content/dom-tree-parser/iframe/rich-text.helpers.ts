import { appendElement, appendIframeElement, ensureIframeDocument } from './dom.helpers';

export function buildRichTextEditorIframe() {
  const wrapper = appendElement(document.body, 'div', { className: 'richTextWideView' });
  const iframe = appendElement(wrapper, 'iframe', {
    id: 'rtf-editor-27827',
    className: 'SummerNote__iframe',
  }) as HTMLIFrameElement;
  iframe.src = `${window.location.origin}/summerNote.html?cacheUuid=1771320584354`;
  const iframeDoc = ensureIframeDocument(iframe);

  const dialog = appendIframeElement(iframeDoc, iframeDoc.body, 'div', {
    className: 'note-link-dialog',
  });
  appendIframeElement(iframeDoc, dialog, 'label', { textContent: 'URL для перехода' });
  appendIframeElement(iframeDoc, dialog, 'input', { value: 'http://' });

  const help = appendIframeElement(iframeDoc, iframeDoc.body, 'div', {
    className: 'note-help-dialog',
  });
  appendIframeElement(iframeDoc, help, 'label', { textContent: 'CTRL+Z' });
  appendIframeElement(iframeDoc, help, 'span', { textContent: 'Отменить последнюю команду' });

  appendIframeElement(iframeDoc, iframeDoc.body, 'p', {
    textContent: 'Требуется подбор кандидата на позицию разработчика программного обеспечения.',
  });

  return iframe;
}

export function buildRichTextChromeContainer(parent: HTMLElement) {
  const editorRoot = appendElement(parent, 'div', { id: 'summernote' });
  appendElement(editorRoot, 'p', {
    textContent: 'Требуется подбор кандидата на позицию разработчика программного обеспечения.',
  });

  const editor = appendElement(parent, 'div', { className: 'note-editor note-frame panel' });
  const modal = appendElement(editor, 'div', {
    className: 'modal link-dialog',
  });
  const modalBody = appendElement(modal, 'div', { className: 'modal-body' });
  appendElement(modalBody, 'label', { textContent: 'URL для перехода' });
  appendElement(modalBody, 'input', { value: 'http://' });

  const help = appendElement(editor, 'div', { className: 'modal note-help-dialog' });
  const helpBody = appendElement(help, 'div', { className: 'modal-body' });
  appendElement(helpBody, 'label', { textContent: 'CTRL+Z' });
  appendElement(helpBody, 'span', { textContent: 'Отменить последнюю команду' });
}
