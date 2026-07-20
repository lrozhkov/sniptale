import { ensureIframeDocument } from '../mvs/fixture-dom';

function ensureFixtureIframeBody(iframeDoc: Document) {
  if (!iframeDoc.documentElement) {
    iframeDoc.append(iframeDoc.createElement('html'));
  }

  if (!iframeDoc.body) {
    iframeDoc.documentElement.append(iframeDoc.createElement('body'));
  }

  return iframeDoc.body;
}

function createCommentsContainerShell() {
  const container = document.createElement('div');
  container.className = 'Block__block';
  container.id = 'comments';
  const title = document.createElement('div');
  title.className = 'Title__title Title__normal';
  title.textContent = 'Комментарии';
  container.append(title);
  document.body.append(container);
  return container;
}

function createDraftCommentComposer() {
  const currentUserComment = document.createElement('div');
  currentUserComment.className = 'Comment__comment';
  currentUserComment.id = 'comment$currentUser';
  const currentUserContent = document.createElement('div');
  currentUserContent.className = 'Comment__content';
  const currentUserForm = document.createElement('div');
  currentUserForm.className = 'Comment__form';
  currentUserContent.append(currentUserForm);
  currentUserComment.append(currentUserContent);
  return currentUserComment;
}

function createRenderedComment() {
  const comment = document.createElement('div');
  comment.className = 'Comment__comment';
  comment.id = 'comment$104306031';
  const commentGroup = document.createElement('div');
  commentGroup.className = 'Comment__group';
  const commentContent = document.createElement('div');
  commentContent.className = 'Comment__content';
  const metaWrap = document.createElement('div');
  const authorAndDate = document.createElement('div');
  authorAndDate.className = 'Comment__authorAndDate';
  const author = document.createElement('div');
  author.className = 'Comment__author';
  author.textContent = 'Тестов Тест Тестович';
  const date = document.createElement('div');
  date.className = 'Comment__date';
  date.textContent = '01.01.2000 10:00';
  const text = document.createElement('div');
  text.className = 'Comment__text';
  const iframe = document.createElement('iframe');
  iframe.id = 'rtf-editor-64015';
  iframe.className = 'SummerNote__iframe';
  iframe.src = `${window.location.origin}/portal/summerNote.html?cacheUuid=1771320584354`;

  authorAndDate.append(author, date);
  metaWrap.append(authorAndDate, text);
  text.append(iframe);
  commentContent.append(metaWrap);
  commentGroup.append(commentContent);
  comment.append(commentGroup);
  return { comment, iframe };
}

export function createNaumenCommentsContainer(): Document {
  const container = createCommentsContainerShell();
  const draftComment = createDraftCommentComposer();
  const { comment, iframe } = createRenderedComment();

  container.append(draftComment, comment);

  const iframeDoc = ensureIframeDocument(iframe);
  const body = ensureFixtureIframeBody(iframeDoc);
  const root = iframeDoc.createElement('div');
  root.id = 'root';
  body.append(root);
  return iframeDoc;
}

export function populateNaumenCommentIframe(iframeDoc: Document): void {
  const body = ensureFixtureIframeBody(iframeDoc);
  const root = iframeDoc.getElementById('root') ?? iframeDoc.createElement('div');
  if (!root.parentElement) {
    root.id = 'root';
    body.append(root);
  }

  root.replaceChildren();

  const hiddenSource = iframeDoc.createElement('div');
  hiddenSource.id = 'summernote';
  hiddenSource.style.display = 'none';
  const hiddenParagraph = iframeDoc.createElement('p');
  hiddenParagraph.textContent = 'Тест';

  const editable = iframeDoc.createElement('div');
  editable.className = 'note-editable';
  const visibleParagraph = iframeDoc.createElement('p');
  visibleParagraph.textContent = 'Тест';

  hiddenSource.append(hiddenParagraph);
  editable.append(visibleParagraph);
  root.append(hiddenSource, editable);
}
