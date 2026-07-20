import type { SectionNode } from '@sniptale/runtime-contracts/dom-tree';
import { MVS_APPLICATION_CODE } from '../../../dom-tree-parser/mvs/constants';
import type { TraversalContext } from '../../types';

export function createContext(): TraversalContext {
  return {
    currentSection: null,
    globalFieldIndex: 1,
    globalTableIndex: 1,
    pendingFields: new Map<string, never[]>(),
    processedAttrLists: new Set<HTMLTableElement>(),
    processedCommentContainers: new Set<HTMLElement>(),
    processedComments: new Set<HTMLElement>(),
    processedFieldElements: new Set<HTMLElement>(),
    processedTables: new Set<HTMLTableElement>(),
    result: {
      context: 'test',
      title: 'MVS',
      structure: [],
      meta: {
        profile: {
          vendor: 'naumen-sd-gwt',
          appFamily: 'naumen-sd',
          pageKind: 'embedded-app',
          pipelineId: 'naumen-sd-gwt',
          confidence: 0.9,
          matchedSignals: [],
          preferredRoots: ['body'],
        },
        title: 'MVS',
        url: 'https://example.test/object',
        warnings: [],
      },
    },
    sectionElements: [],
    sectionIndex: 1,
    getOriginalElementFn: (node) => node,
  };
}

export function appendElement<T extends keyof HTMLElementTagNameMap>(
  doc: Document,
  parent: HTMLElement,
  tagName: T,
  props?: Partial<HTMLElementTagNameMap[T]>
): HTMLElementTagNameMap[T] {
  const element = doc.createElement(tagName);
  Object.assign(element, props ?? {});
  parent.append(element);
  return element;
}

export function appendTextElement(
  doc: Document,
  parent: HTMLElement,
  tagName: keyof HTMLElementTagNameMap,
  text: string,
  props?: Record<string, string>
) {
  const element = appendElement(doc, parent, tagName, {});
  Object.entries(props ?? {}).forEach(([key, value]) => element.setAttribute(key, value));
  element.textContent = text;
  return element;
}

export function buildContainer(id: string, appCode = MVS_APPLICATION_CODE) {
  const iframe = document.createElement('iframe');
  iframe.id = id;
  document.body.append(iframe);

  const container = document.createElement('div');
  container.id = id;
  container.setAttribute('data-application-code', appCode);
  container.setAttribute('data-virtual-iframe', 'true');
  document.body.append(container);
  return { container, iframe };
}

export function createSection(title: string): SectionNode {
  return {
    type: 'section',
    id: `${title}-section`,
    title,
    children: [],
    selected: true,
  };
}

export function createParserContainer() {
  const element = document.createElement('div');
  element.setAttribute('data-virtual-iframe', 'true');
  element.setAttribute('data-application-code', MVS_APPLICATION_CODE);
  return element;
}

export function buildIframeDocument(title = 'MVS iframe'): Document {
  const iframeDoc = document.implementation.createHTMLDocument(title);
  iframeDoc.title = title;
  return iframeDoc;
}

export function appendBlock(doc: Document, id: string) {
  return appendElement(doc, doc.body, 'div', { id });
}

export function appendFieldCandidate(
  doc: Document,
  block: HTMLElement,
  label: string,
  value: string
) {
  const row = appendElement(doc, block, 'div', {});
  appendTextElement(doc, row, 'div', `${label}:`);
  appendTextElement(doc, row, 'div', value);
  return row;
}

export function appendRawFieldCandidate(
  doc: Document,
  block: HTMLElement,
  labelText: string,
  value: string
) {
  const row = appendElement(doc, block, 'div', {});
  appendTextElement(doc, row, 'div', labelText);
  appendTextElement(doc, row, 'div', value);
  return row;
}

export function appendLinkFieldCandidate(
  doc: Document,
  block: HTMLElement,
  label: string,
  href: string,
  text: string
) {
  const row = appendElement(doc, block, 'div', {});
  appendTextElement(doc, row, 'div', `${label}:`);
  const value = appendElement(doc, row, 'a', {});
  value.href = href;
  value.textContent = text;
  return row;
}
