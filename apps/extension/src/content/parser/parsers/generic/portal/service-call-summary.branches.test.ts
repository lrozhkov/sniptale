// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { initContext } from '../../../dom-tree-parser/traversal';
import { parseServiceCallSummaryElement } from './service-call-summary';

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

function createContext() {
  return initContext(undefined, undefined, {
    pageHostname: 'example.test',
    pageTitle: 'Карточка запроса',
    pageUrl: 'https://example.test/service-call',
  });
}

afterEach(() => {
  document.body.replaceChildren();
  document.title = '';
});

function registerEmptyAttributePartTest() {
  it('ignores empty attribute-box parts while still parsing valid labeled parts', () => {
    const ctx = createContext();
    const container = appendElement(document.body, 'div', { id: 'serviceCall' });
    appendElement(container, 'div', {
      className: 'TextBoxWithIcon__attributesBox',
      textContent:
        'Дата создания: 14.10.2025 18:09 |   | Прогнозируемый срок обработки: 15.10.2025 08:19',
    });

    const result = parseServiceCallSummaryElement(container, ctx);

    expect(result.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Дата создания', value: '14.10.2025 18:09' }),
        expect.objectContaining({
          label: 'Прогнозируемый срок обработки',
          value: '15.10.2025 08:19',
        }),
      ])
    );
  });
}

function registerMissingValueSkipTest() {
  it('skips labeled header entries whose value part is empty', () => {
    const ctx = createContext();
    const container = appendElement(document.body, 'div', { id: 'serviceCall' });
    appendElement(container, 'div', {
      className: 'DetailsHead__serviceTitle',
      textContent: 'Услуга: ',
    });
    appendElement(container, 'div', {
      className: 'DetailsHead__routeTitle',
      textContent: 'Вид запроса: Подбор кандидата',
    });

    const result = parseServiceCallSummaryElement(container, ctx);

    expect(result.fields).toEqual([
      expect.objectContaining({
        label: 'Вид запроса',
        value: 'Подбор кандидата',
      }),
    ]);
  });
}

describe('service-call-summary branch coverage', () => {
  registerEmptyAttributePartTest();
  registerMissingValueSkipTest();
});
