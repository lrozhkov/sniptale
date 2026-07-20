// @vitest-environment jsdom

import { afterEach, expect, it } from 'vitest';
import type { SectionNode } from '@sniptale/runtime-contracts/dom-tree';
import { parseDOMTree } from '../../../dom-tree-parser';
import { initContext } from '../../../dom-tree-parser/traversal';
import { parseServiceCallSummaryElement, ServiceCallSummaryParser } from './service-call-summary';

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

function buildServiceCallSummary() {
  document.title = 'Карточка запроса';
  appendElement(document.body, 'h1', { textContent: 'Карточка клиента' });

  const container = appendElement(document.body, 'div', { id: 'serviceCall' });
  const title = appendElement(container, 'div', { id: 'ServiceCall__title' });
  appendElement(title, 'span', { textContent: 'RP49784' });
  appendElement(container, 'div', {
    className: 'StatusTag__tag ServiceCallStatus__status',
    textContent: 'В работе',
  });
  appendServiceCallSummaryAttributes(container);
  appendServiceCallSummaryDetails(container);
}

function appendServiceCallSummaryAttributes(container: HTMLElement) {
  const attributes = appendElement(container, 'div', {
    className: 'TextBoxWithIcon__attributesBox',
  });
  const createdAt = appendElement(attributes, 'span', {
    className: 'TextBoxWithIcon__attribute',
  });
  createdAt.append('Дата создания: 14.10.2025 18:09');
  appendElement(attributes, 'span', { textContent: '|' });
  const forecast = appendElement(attributes, 'span', {
    className: 'TextBoxWithIcon__attribute',
  });
  forecast.append(
    'Прогнозируемый срок обработки: ',
    appendElement(forecast, 'strong', {
      textContent: '15.10.2025 08:19',
    })
  );
}

function appendServiceCallSummaryDetails(container: HTMLElement) {
  const serviceTitle = appendElement(container, 'div', {
    className: 'DetailsHead__serviceTitle',
  });
  serviceTitle.append(
    'Услуга: ',
    appendElement(serviceTitle, 'span', { textContent: 'Услуга LR' })
  );
  const routeTitle = appendElement(container, 'div', {
    className: 'DetailsHead__routeTitle',
  });
  routeTitle.append(
    'Вид запроса: ',
    appendElement(routeTitle, 'span', { textContent: 'Подбор кандидата' })
  );
  appendElement(container, 'span', {
    className: 'DetailsHead__category',
    textContent: 'Тестовая категория',
  });
  appendElement(container, 'div', {
    className: 'Deadline__waitingTime',
    textContent: 'Плановое время выполнения: 15.10.2025 11:00',
  });
}

function readSummaryFields() {
  const tree = parseDOMTree();
  return tree.structure.flatMap((section) =>
    section.children.filter((child) => child.type === 'field')
  );
}

function createContext() {
  return initContext(undefined, undefined, {
    pageHostname: 'example.test',
    pageTitle: 'Карточка запроса',
    pageUrl: 'https://example.test/service-call',
  });
}

function createSummarySection(): SectionNode {
  return {
    type: 'section',
    id: 'summary-section',
    title: 'Общая информация',
    children: [],
    selected: true,
    kind: 'record',
  };
}

afterEach(() => {
  document.body.replaceChildren();
  document.title = '';
});

it('includes top service-call header fields in the parsed tree', () => {
  buildServiceCallSummary();

  expect(readSummaryFields()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ label: 'Номер запроса', value: 'RP49784' }),
      expect.objectContaining({ label: 'Статус', value: 'В работе' }),
      expect.objectContaining({ label: 'Услуга', value: 'Услуга LR' }),
      expect.objectContaining({ label: 'Вид запроса', value: 'Подбор кандидата' }),
      expect.objectContaining({ label: 'Дата создания', value: '14.10.2025 18:09' }),
      expect.objectContaining({
        label: 'Прогнозируемый срок обработки',
        value: '15.10.2025 08:19',
      }),
      expect.objectContaining({
        label: 'Плановое время выполнения',
        value: '15.10.2025 11:00',
      }),
    ])
  );
});

it('restores canonical date labels even when inline prefixes were lost in the live dom', () => {
  document.title = 'Карточка запроса';

  const container = appendElement(document.body, 'div', { id: 'serviceCall' });
  const attributes = appendElement(container, 'div', {
    className: 'TextBoxWithIcon__attributesBox',
  });
  appendElement(attributes, 'span', {
    className: 'TextBoxWithIcon__attribute',
    textContent: '15.10.2025 10:00',
  });
  appendElement(attributes, 'span', {
    className: 'TextBoxWithIcon__attribute',
    textContent: '16.10.2025 12:00',
  });

  expect(readSummaryFields()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ label: 'Дата создания', value: '15.10.2025 10:00' }),
      expect.objectContaining({
        label: 'Прогнозируемый срок обработки',
        value: '16.10.2025 12:00',
      }),
    ])
  );
});

it('emits parallel record-field blocks for summary metadata', () => {
  buildServiceCallSummary();

  const tree = parseDOMTree();

  expect(tree.blocks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: 'record-field',
        items: ['Номер запроса', 'RP49784'],
      }),
      expect.objectContaining({
        kind: 'record-field',
        items: ['Статус', 'В работе'],
      }),
    ])
  );
});

it('reuses the existing summary section and parses fallback attribute-box parts', () => {
  const ctx = createContext();
  const section = createSummarySection();
  ctx.result.structure.push(section);

  const container = appendElement(document.body, 'div', { id: 'serviceCall' });
  const attributes = appendElement(container, 'div', {
    className: 'TextBoxWithIcon__attributesBox',
    textContent:
      'Дата создания: 14.10.2025 18:09 | Прогнозируемый срок обработки: 15.10.2025 08:19 | Ответственный: Иван Иванов',
  });
  expect(attributes).toBeTruthy();

  const result = parseServiceCallSummaryElement(container, ctx);

  expect(result.newSection).toBe(section);
  expect(ctx.result.structure).toHaveLength(1);
  expect(section.children).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ label: 'Дата создания', value: '14.10.2025 18:09' }),
      expect.objectContaining({
        label: 'Прогнозируемый срок обработки',
        value: '15.10.2025 08:19',
      }),
      expect.objectContaining({ label: 'Ответственный', value: 'Иван Иванов' }),
    ])
  );
});

it('restores numbered date labels for unlabeled attribute spans and exposes direct canParse', () => {
  const parser = new ServiceCallSummaryParser();
  const ctx = createContext();
  const container = appendElement(document.body, 'div', { id: 'serviceCall' });

  for (const text of ['15.10.2025 10:00', '16.10.2025 12:00', '17.10.2025 14:00']) {
    appendElement(container, 'span', {
      className: 'TextBoxWithIcon__attribute',
      textContent: text,
    });
  }

  const result = parser.parse(container, ctx);

  expect(parser.canParse(container, ctx)).toBe(true);
  expect(result.fields).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ label: 'Дата создания', value: '15.10.2025 10:00' }),
      expect.objectContaining({
        label: 'Прогнозируемый срок обработки',
        value: '16.10.2025 12:00',
      }),
      expect.objectContaining({ label: 'Дата 3', value: '17.10.2025 14:00' }),
    ])
  );
  expect(result.fields?.[0]).not.toHaveProperty('linkRef');
});

it('returns an empty result when the summary surface has no extractable fields', () => {
  const ctx = createContext();
  const container = appendElement(document.body, 'div', { id: 'serviceCall' });
  appendElement(container, 'div', {
    className: 'DetailsHead__serviceTitle',
    textContent: 'Сломанный заголовок без значения',
  });

  expect(parseServiceCallSummaryElement(container, ctx)).toEqual({});
  expect(ctx.result.structure).toEqual([]);
});

it('drops blank header fragments while keeping valid summary fields', () => {
  const ctx = createContext();
  const container = appendElement(document.body, 'div', { id: 'serviceCall' });

  appendElement(container, 'span', {
    className: 'TextBoxWithIcon__attribute',
    textContent: '   ',
  });
  appendElement(container, 'div', {
    className: 'StatusTag__tag ServiceCallStatus__status',
    textContent: 'В работе',
  });

  const result = parseServiceCallSummaryElement(container, ctx);

  expect(result.fields).toEqual([expect.objectContaining({ label: 'Статус', value: 'В работе' })]);
  expect(ctx.result.structure[0]?.children).toHaveLength(1);
});
