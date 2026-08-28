import {
  isSafeWebSnapshotCaptureAssetUrl,
  collectWebSnapshotQueryRoots,
  sanitizeWebSnapshotAttribute,
  sanitizeWebSnapshotCssText,
  serializeWebSnapshotXhtmlDocument,
  sanitizeWebSnapshotStylesheetText,
  removeWebSnapshotSensitiveControlState,
} from '../../../../features/web-snapshot/public';
import type { PreparedSnapshotWarning } from './types';
import {
  createIframeUnreadableWarning,
  createSanitizerDropWarning,
  describeIframeTarget,
} from './warnings';

const EXECUTABLE_SELECTORS = [
  'script',
  'noscript',
  'object',
  'embed',
  'meta[http-equiv="refresh" i]',
];

export const IFRAME_RASTER_PLACEHOLDER_ATTRIBUTE = 'data-sniptale-iframe-raster-placeholder';
export const IFRAME_RASTER_RECT_ATTRIBUTES = {
  coordinateSpace: 'data-sniptale-iframe-raster-coordinate-space',
  height: 'data-sniptale-iframe-raster-height',
  width: 'data-sniptale-iframe-raster-width',
  x: 'data-sniptale-iframe-raster-x',
  y: 'data-sniptale-iframe-raster-y',
} as const;
export const IFRAME_RASTER_STATUS_ATTRIBUTE = 'data-sniptale-iframe-raster-status';
export const IFRAME_RASTERIZED_ATTRIBUTE = 'data-sniptale-iframe-rasterized';

const IFRAME_RASTER_RESERVED_ATTRIBUTES = [
  IFRAME_RASTER_PLACEHOLDER_ATTRIBUTE,
  ...Object.values(IFRAME_RASTER_RECT_ATTRIBUTES),
  IFRAME_RASTER_STATUS_ATTRIBUTE,
  IFRAME_RASTERIZED_ATTRIBUTE,
] as const;

function removeIframeRasterAttributes(element: Element): void {
  for (const attribute of IFRAME_RASTER_RESERVED_ATTRIBUTES) {
    element.removeAttribute(attribute);
  }
}

export function clearPreparedSnapshotIframeRasterAttributes(snapshot: Document): void {
  for (const root of collectWebSnapshotQueryRoots(snapshot)) {
    for (const element of root.querySelectorAll('*')) removeIframeRasterAttributes(element);
  }
}

function removeElements(
  root: ParentNode,
  selectors: string[],
  warnings: PreparedSnapshotWarning[]
) {
  for (const element of root.querySelectorAll(selectors.join(','))) {
    warnings.push(createSanitizerDropWarning(element.tagName.toLowerCase()));
    element.remove();
  }
}

function createIframePlaceholder(
  iframe: HTMLIFrameElement,
  baseUrl: string,
  snapshotDocument: Document
): HTMLDivElement {
  const placeholder = snapshotDocument.createElement('div');
  const target = describeIframeTarget(iframe, baseUrl);
  const width = Number(iframe.getAttribute(IFRAME_RASTER_RECT_ATTRIBUTES.width)) || 0;
  const height = Number(iframe.getAttribute(IFRAME_RASTER_RECT_ATTRIBUTES.height)) || 0;
  placeholder.setAttribute('data-virtual-iframe', 'true');
  placeholder.setAttribute('data-iframe-unreadable', 'true');
  placeholder.setAttribute('data-iframe-source', target);
  placeholder.setAttribute(IFRAME_RASTER_PLACEHOLDER_ATTRIBUTE, 'true');
  for (const attribute of Object.values(IFRAME_RASTER_RECT_ATTRIBUTES)) {
    placeholder.setAttribute(attribute, iframe.getAttribute(attribute) ?? '0');
  }
  placeholder.style.setProperty('box-sizing', 'border-box', 'important');
  placeholder.style.setProperty('display', 'inline-block', 'important');
  placeholder.style.setProperty('height', `${height}px`, 'important');
  placeholder.style.setProperty('margin', '0', 'important');
  placeholder.style.setProperty('overflow', 'hidden', 'important');
  placeholder.style.setProperty('padding', '0', 'important');
  placeholder.style.setProperty('vertical-align', 'baseline', 'important');
  placeholder.style.setProperty('width', `${width}px`, 'important');
  placeholder.textContent = 'Iframe content unavailable in static snapshot.';
  return placeholder;
}

function replaceExecutableIframes(
  root: ParentNode,
  baseUrl: string,
  warnings: PreparedSnapshotWarning[]
): void {
  const snapshotDocument = root.ownerDocument ?? document;
  for (const iframe of Array.from(root.querySelectorAll('iframe'))) {
    warnings.push(createIframeUnreadableWarning(iframe, baseUrl));
    iframe.replaceWith(createIframePlaceholder(iframe, baseUrl, snapshotDocument));
  }
}

function removeForgedIframeRasterAttributes(root: ParentNode): void {
  for (const element of root.querySelectorAll('*')) {
    if (element.localName === 'iframe') continue;
    removeIframeRasterAttributes(element);
  }
}

function sanitizeElementAttributes(
  element: Element,
  baseUrl: string,
  warnings: PreparedSnapshotWarning[],
  preserveAssetUrls: boolean
): void {
  for (const attribute of Array.from(element.attributes)) {
    if (attribute.name.toLowerCase() === 'style') {
      const sanitizedStyle = sanitizeWebSnapshotCssText(
        attribute.value,
        preserveAssetUrls ? (url) => resolvePreparedCssUrl(url, baseUrl) : () => null
      );
      element.setAttribute(attribute.name, sanitizedStyle);
      continue;
    }
    const sanitized = sanitizeWebSnapshotAttribute(attribute.name, attribute.value, baseUrl);

    if (sanitized === null) {
      warnings.push(
        createSanitizerDropWarning(`${element.tagName.toLowerCase()}[${attribute.name}]`)
      );
      element.removeAttribute(attribute.name);
    } else if (sanitized !== attribute.value) {
      element.setAttribute(attribute.name, sanitized);
    }
  }
}

function disableUnsafeFormBehavior(root: ParentNode): void {
  for (const form of root.querySelectorAll('form')) {
    form.setAttribute('data-sniptale-disabled-form', 'true');
    form.removeAttribute('action');
    form.removeAttribute('method');
    form.removeAttribute('target');
  }
}

function resolvePreparedCssUrl(value: string, baseUrl: string): string | null {
  const trimmedValue = value.trim();
  if (trimmedValue.startsWith('#')) return trimmedValue;
  if (!isSafeWebSnapshotCaptureAssetUrl(trimmedValue, baseUrl)) return null;
  try {
    const url = new URL(trimmedValue, baseUrl);
    return ['data:', 'http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function sanitizeStyleElements(
  root: ParentNode,
  baseUrl: string,
  preserveAssetUrls: boolean
): void {
  for (const styleElement of root.querySelectorAll('style')) {
    styleElement.textContent = sanitizeWebSnapshotStylesheetText(
      styleElement.textContent ?? '',
      preserveAssetUrls ? (url) => resolvePreparedCssUrl(url, baseUrl) : () => null
    );
  }
}

export function sanitizePreparedSnapshotDocument(
  snapshot: Document,
  baseUrl: string,
  options: { preserveAssetUrls?: boolean } = {}
): PreparedSnapshotWarning[] {
  const warnings: PreparedSnapshotWarning[] = [];
  const preserveAssetUrls = options.preserveAssetUrls === true;
  for (const root of collectWebSnapshotQueryRoots(snapshot)) {
    removeElements(root, EXECUTABLE_SELECTORS, warnings);
    removeForgedIframeRasterAttributes(root);
    replaceExecutableIframes(root, baseUrl, warnings);
    disableUnsafeFormBehavior(root);
    removeWebSnapshotSensitiveControlState(root);
    sanitizeStyleElements(root, baseUrl, preserveAssetUrls);
    for (const element of root.querySelectorAll('*')) {
      sanitizeElementAttributes(element, baseUrl, warnings, preserveAssetUrls);
    }
  }

  return warnings;
}

type ComparableSnapshotChild = Node | { text: string };

function collectComparableChildren(node: Node): ComparableSnapshotChild[] {
  const childNodes =
    node.nodeType === Node.ELEMENT_NODE && node.nodeName.toLowerCase() === 'template'
      ? Array.from((node as HTMLTemplateElement).content.childNodes)
      : Array.from(node.childNodes);
  const comparable: ComparableSnapshotChild[] = [];
  for (const child of childNodes) {
    if (child.nodeType !== Node.TEXT_NODE) {
      comparable.push(child);
      continue;
    }
    const previous = comparable.at(-1);
    if (previous && !(previous instanceof Node)) {
      previous.text += child.nodeValue ?? '';
    } else {
      comparable.push({ text: child.nodeValue ?? '' });
    }
  }
  return comparable.filter((child) => child instanceof Node || child.text.length > 0);
}

function haveMatchingAttributes(left: Element, right: Element): boolean {
  const leftAttributes = Array.from(left.attributes);
  const rightAttributes = Array.from(right.attributes);
  return (
    leftAttributes.length === rightAttributes.length &&
    leftAttributes.every((attribute, index) => {
      const rightAttribute = rightAttributes[index];
      return (
        rightAttribute?.name === attribute.name &&
        rightAttribute.namespaceURI === attribute.namespaceURI &&
        rightAttribute.value === attribute.value
      );
    })
  );
}

function haveMatchingSerializedStructure(left: Node, right: Node): boolean {
  if (
    left.nodeType !== right.nodeType ||
    left.nodeName !== right.nodeName ||
    left.nodeValue !== right.nodeValue
  ) {
    return false;
  }
  if (
    left.nodeType === Node.ELEMENT_NODE &&
    right.nodeType === Node.ELEMENT_NODE &&
    !haveMatchingAttributes(left as Element, right as Element)
  ) {
    return false;
  }
  const leftChildren = collectComparableChildren(left);
  const rightChildren = collectComparableChildren(right);
  return (
    leftChildren.length === rightChildren.length &&
    leftChildren.every((child, index) => {
      const rightChild = rightChildren[index];
      if (!rightChild) return false;
      if (!(child instanceof Node) || !(rightChild instanceof Node)) {
        return (
          !(child instanceof Node) &&
          !(rightChild instanceof Node) &&
          child.text === rightChild.text
        );
      }
      return haveMatchingSerializedStructure(child, rightChild);
    })
  );
}

function describeSerializedStructureMismatch(
  left: Node,
  right: Node,
  path = left.nodeName.toLowerCase()
): string | null {
  if (
    left.nodeType !== right.nodeType ||
    left.nodeName !== right.nodeName ||
    left.nodeValue !== right.nodeValue
  ) {
    return `${path}: ${left.nodeName}/${JSON.stringify(left.nodeValue)} became ${right.nodeName}/${JSON.stringify(right.nodeValue)}`;
  }
  if (
    left.nodeType === Node.ELEMENT_NODE &&
    right.nodeType === Node.ELEMENT_NODE &&
    !haveMatchingAttributes(left as Element, right as Element)
  ) {
    return `${path}: attributes changed`;
  }
  const leftChildren = collectComparableChildren(left);
  const rightChildren = collectComparableChildren(right);
  if (leftChildren.length !== rightChildren.length) {
    return `${path}: child count changed from ${leftChildren.length} to ${rightChildren.length}`;
  }
  for (const [index, leftChild] of leftChildren.entries()) {
    const rightChild = rightChildren[index];
    if (!rightChild) return `${path}: child ${index} is missing`;
    if (!(leftChild instanceof Node) || !(rightChild instanceof Node)) {
      if (
        leftChild instanceof Node ||
        rightChild instanceof Node ||
        leftChild.text !== rightChild.text
      ) {
        return `${path}: text child ${index} changed`;
      }
      continue;
    }
    const mismatch = describeSerializedStructureMismatch(
      leftChild,
      rightChild,
      `${path}/${leftChild.nodeName.toLowerCase()}[${index}]`
    );
    if (mismatch) return mismatch;
  }
  return null;
}

function createHtmlSerializationProjection(snapshot: Document): Document {
  const projection = new DOMParser().parseFromString(
    '<!doctype html><html><head></head><body></body></html>',
    'text/html'
  );
  projection.documentElement.replaceWith(projection.importNode(snapshot.documentElement, true));
  for (const root of collectWebSnapshotQueryRoots(projection)) {
    for (const template of root.querySelectorAll('template[shadowrootmode]')) {
      const mode = template.getAttribute('shadowrootmode');
      if (mode !== null) template.setAttribute('data-sniptale-probe-shadowrootmode', mode);
      template.removeAttribute('shadowrootmode');
    }
  }
  return projection;
}

function inspectParseStableHtml(snapshot: Document): {
  html: string | null;
  mismatch: string | null;
} {
  const projection = createHtmlSerializationProjection(snapshot);
  const html = `<!doctype html>${projection.documentElement.outerHTML}`;
  const reparsed = new DOMParser().parseFromString(html, 'text/html');
  if (!haveMatchingSerializedStructure(projection.documentElement, reparsed.documentElement)) {
    return {
      html: null,
      mismatch: describeSerializedStructureMismatch(
        projection.documentElement,
        reparsed.documentElement
      ),
    };
  }
  return { html: `<!doctype html>${snapshot.documentElement.outerHTML}`, mismatch: null };
}

export function serializePreparedSnapshotDocument(
  snapshot: Document,
  options: { preferParseStableHtml?: boolean } = {}
): string {
  if (options.preferParseStableHtml) {
    const { html } = inspectParseStableHtml(snapshot);
    if (html !== null) return html;
  }
  return serializeWebSnapshotXhtmlDocument(snapshot);
}
