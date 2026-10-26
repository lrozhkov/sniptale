import type { BrowserAnnotationSessionSnapshot } from '../types';
import { browserAnnotationSession } from '../session';
import { appendToContentOverlayRoot } from '../../../../platform/dom-host';
import {
  translate,
  formatDateTime,
  getCurrentLocale,
  type TranslationKey,
} from '../../../../../platform/i18n';

export interface ReviewReportPreview {
  dataUrl: string;
  width: number;
  height: number;
}
interface ReviewReportOptions {
  previews?: ReadonlyMap<number, ReviewReportPreview>;
  pageTitle?: string;
  pageUrl?: string;
}

const REPORT_STYLES = [
  '@page{size:A4;margin:17mm 16mm 18mm}',
  '*{box-sizing:border-box}body{margin:0;background:#fff;color:#20272e;font:10pt/1.5 system-ui,sans-serif}',
  '.cover{padding:0 0 7mm;border-bottom:2px solid #ed7b22;margin-bottom:7mm}',
  'h1{font-size:27pt;line-height:1.1;letter-spacing:-.025em;margin:0 0 5mm;font-weight:700}',
  'h2{font-size:15pt;line-height:1.3;margin:0 0 3mm}h3{font-size:10pt;margin:4mm 0 1.5mm}',
  'p{margin:0 0 3mm;white-space:pre-wrap;overflow-wrap:anywhere}',
  '.source{font-size:13pt;font-weight:600}.metadata{font-size:8pt;color:#59636e;overflow-wrap:anywhere}',
  '.summary{margin-top:5mm;font-size:10pt;font-weight:600}.item{padding:0 0 7mm;margin:0 0 7mm;',
  'border-bottom:1px solid #dce1e5;break-inside:avoid}',
  '.item-number{display:inline-block;color:#a34808;margin-right:2mm;font-variant-numeric:tabular-nums}',
  'figure{margin:4mm 0}img{display:block;max-width:100%;max-height:65mm;object-fit:contain;',
  'object-position:left;border:1px solid #e1e5e9}',
  'figcaption{margin-top:1.5mm;font-size:8pt;color:#59636e}.note{font-size:11pt;line-height:1.6}',
  '.unavailable{padding:4mm;background:#f4f5f6;color:#59636e;font-size:9pt}',
  'table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8pt;margin:3mm 0}',
  'th,td{text-align:left;vertical-align:top;padding:2mm;border-bottom:1px solid #e1e5e9;',
  'overflow-wrap:anywhere;white-space:pre-wrap}',
  'th{font-weight:600;color:#59636e}thead{display:table-header-group}tr{break-inside:avoid}',
  'code{font:8pt/1.5 ui-monospace,monospace;overflow-wrap:anywhere}.text-change{display:grid;',
  'grid-template-columns:1fr 1fr;gap:5mm}',
  'footer{font-size:8pt;color:#59636e;margin-top:6mm}@media screen{body{max-width:210mm;margin:0 auto;',
  'padding:17mm 16mm}}',
].join('\n');

type ReportRecord = BrowserAnnotationSessionSnapshot['domRecords'][number];
type ReportFrame = BrowserAnnotationSessionSnapshot['frameOrders'][number];

function createReportNodes(doc: Document) {
  return <Tag extends keyof HTMLElementTagNameMap>(tag: Tag, text = '', className = '') => {
    const result = doc.createElement(tag);
    result.textContent = text;
    result.className = className;
    return result;
  };
}
type ReportNodes = ReturnType<typeof createReportNodes>;

function renderReportCover(
  node: ReportNodes,
  snapshot: BrowserAnnotationSessionSnapshot,
  title: string,
  options: ReviewReportOptions
) {
  const cover = node('header', '', 'cover');
  cover.append(
    node('h1', title),
    node('p', options.pageTitle || snapshot.domRecords[0]?.evidence.fileLabel || title, 'source')
  );
  cover.append(
    node('p', options.pageUrl || snapshot.domRecords[0]?.evidence.pageUrl || '', 'metadata')
  );
  cover.append(
    node(
      'p',
      formatDateTime(new Date(), { dateStyle: 'long', timeStyle: 'short' }, getCurrentLocale()),
      'metadata'
    )
  );
  cover.append(
    node(
      'p',
      `${translate('content.designReview.reportItems')}: ${snapshot.domRecords.length + snapshot.frameOrders.length}`,
      'summary'
    )
  );
  return cover;
}

function renderReportImage(node: ReportNodes, record: ReportRecord, preview?: ReviewReportPreview) {
  if (
    !preview ||
    !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(preview.dataUrl) ||
    preview.dataUrl.length > 16 * 1024 * 1024
  )
    return node('p', translate('content.designReview.reportImageUnavailable'), 'unavailable');
  const figure = node('figure');
  const image = node('img');
  image.src = preview.dataUrl;
  image.alt = record.evidence.targetText || record.evidence.targetSelector;
  image.width = Math.round(preview.width);
  image.height = Math.round(preview.height);
  figure.append(image, node('figcaption', translate('content.designReview.reportImageCaption')));
  return figure;
}

function renderReportProperties(node: ReportNodes, changes: ReportRecord['propertyChanges']) {
  const table = node('table');
  const head = node('thead');
  const row = node('tr');
  for (const key of [
    'content.designReview.reportProperty',
    'content.designReview.reportBefore',
    'content.designReview.reportAfter',
  ] as const)
    row.append(node('th', translate(key)));
  head.append(row);
  const body = node('tbody');
  for (const change of changes) {
    const row = node('tr');
    const value = (item: typeof change.before) =>
      `${item.value || '—'}${item.priority ? ' !' + item.priority : ''}`;
    row.append(
      node('td', change.property),
      node('td', value(change.before)),
      node('td', value(change.after))
    );
    body.append(row);
  }
  table.append(head, body);
  return table;
}

function renderReportTextChange(
  node: ReportNodes,
  change: NonNullable<ReportRecord['textChange']>
) {
  const columns = node('div', '', 'text-change');
  for (const [label, value] of [
    [translate('content.designReview.reportBefore'), change.before],
    [translate('content.designReview.reportAfter'), change.after],
  ]) {
    const column = node('div');
    column.append(node('h3', label), node('p', value));
    columns.append(column);
  }
  return columns;
}

function renderReportRecord(
  node: ReportNodes,
  record: ReportRecord,
  index: number,
  options: ReviewReportOptions
) {
  const section = node('article', '', 'item');
  section.dataset['annotationId'] = String(record.annotationId);
  const heading = node('h2');
  heading.append(
    node('span', `${index + 1}.`, 'item-number'),
    node('span', record.evidence.targetText.slice(0, 100) || record.evidence.targetSelector)
  );
  section.append(heading);
  if (record.designReview?.action) {
    const actions: Record<NonNullable<typeof record.designReview.action>, TranslationKey> = {
      refine: 'content.designReview.actionRefine',
      fix: 'content.designReview.actionFix',
      simplify: 'content.designReview.actionSimplify',
      verify: 'content.designReview.actionVerify',
      explain: 'content.designReview.actionExplain',
    };
    section.append(node('p', translate(actions[record.designReview.action]), 'metadata'));
  }
  section.append(renderReportImage(node, record, options.previews?.get(record.annotationId)));
  if (record.comment) section.append(node('p', record.comment, 'note'));
  if (record.propertyChanges.length)
    section.append(
      node('h3', translate('content.designReview.reportStyleChanges')),
      renderReportProperties(node, record.propertyChanges)
    );
  if (record.textChange)
    section.append(
      node('h3', translate('content.designReview.reportTextChanges')),
      renderReportTextChange(node, record.textChange)
    );
  if (record.textMarkers?.length) {
    section.append(node('h3', translate('content.designReview.reportTextMarkers')));
    for (const marker of record.textMarkers)
      section.append(
        node('p', `${marker.source.slice(marker.start, marker.end)} · ${marker.color}`)
      );
  }
  section.append(node('p', record.evidence.targetSelector, 'metadata'));
  const viewport = record.evidence.viewport;
  section.append(
    node('p', `${viewport.width} × ${viewport.height} px · ${record.evidence.pageUrl}`, 'metadata')
  );
  return section;
}

function renderReportFrame(node: ReportNodes, frame: ReportFrame) {
  const section = node('article', '', 'item');
  const size = `${frame.rect.width} × ${frame.rect.height} px`;
  const position = `(${frame.rect.x}, ${frame.rect.y})`;
  const viewport = `${frame.viewport.width} × ${frame.viewport.height} px`;
  section.append(
    node('h2', frame.frameName),
    node('p', frame.comment || ''),
    node('p', translate('content.designReview.reportImageUnavailable'), 'unavailable'),
    node('p', `${size} · ${position} · ${viewport}`, 'metadata'),
    node('p', frame.linkedElementSelector || '', 'metadata'),
    node('p', frame.pageUrl, 'metadata')
  );
  return section;
}

/** Builds a human-readable document. Authored text never becomes markup. */
export function renderReviewPrintReport(
  doc: Document,
  snapshot: BrowserAnnotationSessionSnapshot,
  title: string,
  options: ReviewReportOptions = {}
): void {
  const node = createReportNodes(doc);
  const style = node('style', REPORT_STYLES);
  doc.head.replaceChildren(style);
  doc.title = title;
  const content = node('main');
  snapshot.domRecords.forEach((record, index) =>
    content.append(renderReportRecord(node, record, index, options))
  );
  snapshot.frameOrders.forEach((frame) => content.append(renderReportFrame(node, frame)));
  if (!snapshot.domRecords.length && !snapshot.frameOrders.length)
    content.append(node('p', translate('content.designReview.reportEmpty')));
  doc.body.replaceChildren(
    renderReportCover(node, snapshot, title, options),
    content,
    node('footer', translate('content.designReview.reportFooter'))
  );
}

/** Prints one immutable session snapshot; the browser provides the Save as PDF destination. */
export async function printReviewReport(
  title: string,
  snapshot = browserAnnotationSession.captureSnapshot(),
  options: ReviewReportOptions = {}
): Promise<void> {
  const host = document.createElement('div');
  host.dataset['ui'] = 'content.design-review.print-host';
  host.dataset['floatingUiCaptureTransient'] = 'true';
  // Native isolated-world creation keeps captured pixels outside the page-readable UI tree.
  const privateRoot = host.attachShadow({ mode: 'closed', clonable: false, serializable: false });
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-same-origin allow-modals');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.dataset['ui'] = 'content.design-review.print-report';
  frame.dataset['floatingUiCaptureTransient'] = 'true';
  frame.style.cssText =
    'position:fixed;width:1px;height:1px;left:-10000px;top:0;border:0;pointer-events:none';
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const cleanup = () => {
    clearTimeout(timeout);
    host.remove();
  };
  try {
    await new Promise<void>((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error('Print report did not load')), 10000);
      frame.onload = () => resolve();
      frame.onerror = () => reject(new Error('Print report did not load'));
      frame.src = 'about:blank';
      privateRoot.append(frame);
      appendToContentOverlayRoot(host);
    });
    clearTimeout(timeout);
    const doc = frame.contentDocument;
    const view = frame.contentWindow;
    if (!doc || !view) throw new Error('Print report is unavailable');
    renderReviewPrintReport(doc, snapshot, title, options);
    await Promise.all(Array.from(doc.images, (image) => image.decode().catch(() => undefined)));
    view.addEventListener('afterprint', cleanup, { once: true });
    timeout = setTimeout(cleanup, 60000);
    view.print();
  } catch (error) {
    cleanup();
    throw error;
  }
}
