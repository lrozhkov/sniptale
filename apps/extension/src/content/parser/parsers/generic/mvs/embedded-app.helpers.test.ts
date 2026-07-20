// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MVS_APPLICATION_CODE } from '../../../dom-tree-parser/mvs/constants';
import {
  appendBlock,
  appendElement,
  appendFieldCandidate,
  appendLinkFieldCandidate,
  appendRawFieldCandidate,
  appendTextElement,
  buildContainer,
  buildIframeDocument,
  createContext,
  createSection,
} from './embedded-app.test.fixtures';

const { getIframeDocumentMock } = vi.hoisted(() => ({
  getIframeDocumentMock: vi.fn<(iframe: HTMLIFrameElement) => Document | null>(),
}));

vi.mock('../../../../platform/frame', () => ({
  getIframeDocument: getIframeDocumentMock,
}));

import { extractMvsEmbeddedAppFields } from './embedded-app.helpers';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  document.body.replaceChildren();
});

function registerGuardTests() {
  it('returns no fields for non-MVS containers and missing iframe documents', () => {
    const wrong = buildContainer('mvs-wrong', 'other-app').container;
    const missingIframe = document.createElement('div');
    missingIframe.id = 'missing-iframe';
    missingIframe.setAttribute('data-application-code', MVS_APPLICATION_CODE);
    const missingDoc = buildContainer('mvs-missing-doc').container;

    getIframeDocumentMock.mockReturnValue(null);

    expect(extractMvsEmbeddedAppFields(wrong, createContext())).toEqual([]);
    expect(extractMvsEmbeddedAppFields(missingIframe, createContext())).toEqual([]);
    expect(extractMvsEmbeddedAppFields(missingDoc, createContext())).toEqual([]);
  });
}

function registerSectionOwnershipTests() {
  it('reuses the active section when one already exists', () => {
    const ctx = createContext();
    const currentSection = createSection('Активный раздел');
    ctx.result.structure.push(currentSection);
    ctx.currentSection = currentSection;

    const { container } = buildContainer('mvs-existing-section');
    const iframeDoc = buildIframeDocument('Ignored title');
    const block = appendBlock(iframeDoc, 'dom_card-existing');
    appendTextElement(iframeDoc, block, 'a', 'Карточка', { href: '#uuid:1' });
    appendFieldCandidate(iframeDoc, block, 'Статус', 'Открыт');
    getIframeDocumentMock.mockReturnValue(iframeDoc);

    const fields = extractMvsEmbeddedAppFields(container, ctx);

    expect(fields).toHaveLength(1);
    expect(currentSection.children).toEqual([]);
    expect(ctx.result.structure).toEqual([currentSection]);
    expect(ctx.currentSection).toBe(currentSection);
  });

  it('creates a section from the application code when the iframe title is empty', () => {
    const ctx = createContext();
    const { container } = buildContainer('mvs-new-section');
    const iframeDoc = buildIframeDocument('');
    iframeDoc.title = '';
    const block = appendBlock(iframeDoc, 'dom_card-fallback');
    appendTextElement(iframeDoc, block, 'a', 'Сводка', { href: '#uuid:fallback' });
    getIframeDocumentMock.mockReturnValue(iframeDoc);

    const fields = extractMvsEmbeddedAppFields(container, ctx);

    expect(fields).toHaveLength(1);
    expect(ctx.currentSection?.title).toBe(MVS_APPLICATION_CODE);
    expect(ctx.result.structure).toHaveLength(1);
    expect(ctx.sectionIndex).toBe(2);
  });
}

function registerFieldExtractionDataTests() {
  it('extracts only top-level blocks and skips invalid field candidates', () => {
    const ctx = createContext();
    const { container } = buildContainer('mvs-fields');
    const iframeDoc = buildIframeDocument();
    const block = appendBlock(iframeDoc, 'dom_card-fields');
    appendTextElement(iframeDoc, block, 'a', 'Карточка', { href: '#uuid:2' });
    appendRawFieldCandidate(iframeDoc, block, 'Без двоеточия', 'Будет пропущено');
    appendFieldCandidate(iframeDoc, block, 'X'.repeat(121), 'Слишком длинная метка');
    appendFieldCandidate(iframeDoc, block, 'Повтор', 'Повтор');
    appendLinkFieldCandidate(
      iframeDoc,
      block,
      'Задача',
      'https://example.test/tasks/1',
      'Задача 1'
    );
    const multiValue = appendElement(iframeDoc, block, 'div', {});
    appendTextElement(iframeDoc, multiValue, 'div', 'Описание:');
    appendTextElement(iframeDoc, multiValue, 'span', 'Первый фрагмент');
    appendTextElement(iframeDoc, multiValue, 'span', 'Второй фрагмент');
    const nested = appendNestedBlock(iframeDoc, block);
    getIframeDocumentMock.mockReturnValue(iframeDoc);

    const fields = extractMvsEmbeddedAppFields(container, ctx);

    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Карточка / Задача',
          value: 'Задача 1',
          valueType: 'link',
        }),
        expect.objectContaining({
          label: 'Карточка / Описание',
          value: 'Описание:Первый фрагментВторой фрагмент',
          valueType: 'string',
        }),
        expect.objectContaining({
          label: 'Карточка / Внутреннее поле',
          value: 'Игнорируется',
          valueType: 'string',
        }),
      ])
    );
    expect(fields.map((field) => field.label)).not.toContain('Карточка / Без двоеточия');
    expect(block.getAttribute('data-sniptale-group')).toBeNull();
    expect(nested.getAttribute('data-sniptale-group')).toBeNull();
  });
}

function appendNestedBlock(doc: Document, parentBlock: HTMLElement) {
  const nested = appendBlock(doc, 'dom_card-nested');
  parentBlock.append(nested);
  appendTextElement(doc, nested, 'a', 'Вложенный блок', { href: '#uuid:nested' });
  appendFieldCandidate(doc, nested, 'Внутреннее поле', 'Игнорируется');
  return nested;
}

function registerFallbackFieldTests() {
  it('creates fallback fields for title-only blocks and skips title-less blocks', () => {
    const ctx = createContext();
    const { container } = buildContainer('mvs-fallbacks');
    const iframeDoc = buildIframeDocument();
    const linkedBlock = appendBlock(iframeDoc, 'dom_card-link-only');
    appendTextElement(iframeDoc, linkedBlock, 'a', 'Карточка с ссылкой', {
      href: '#uuid:card',
      target: '_top',
    });
    const dataTitleBlock = appendBlock(iframeDoc, 'h_mx_group-data-title');
    const titledNode = appendElement(iframeDoc, dataTitleBlock, 'div', {});
    titledNode.setAttribute('data-title', '  Блок по data-title  ');
    const ignoredBlock = appendBlock(iframeDoc, 'dom_card-no-title');
    appendTextElement(iframeDoc, ignoredBlock, 'div', 'Без подходящего заголовка');
    getIframeDocumentMock.mockReturnValue(iframeDoc);

    const fields = extractMvsEmbeddedAppFields(container, ctx);

    expect(fields).toEqual([
      expect.objectContaining({
        label: 'Карточка с ссылкой',
        value: 'Карточка с ссылкой',
        valueType: 'link',
      }),
      expect.objectContaining({
        label: 'Блок по data-title',
        value: 'Блок по data-title',
        valueType: 'string',
      }),
    ]);
  });
}

function registerProcessedContainerToleranceTest() {
  it('still extracts iframe-backed fields even if the outer MVS container is already marked processed', () => {
    const ctx = createContext();
    const { container } = buildContainer('mvs-processed');
    const iframeDoc = buildIframeDocument();
    const linkedBlock = appendBlock(iframeDoc, 'dom_card-link-only');
    appendTextElement(iframeDoc, linkedBlock, 'a', 'Карточка с ссылкой', {
      href: '#uuid:card',
      target: '_top',
    });
    const dataTitleBlock = appendBlock(iframeDoc, 'h_mx_group-data-title');
    const titledNode = appendElement(iframeDoc, dataTitleBlock, 'div', {});
    titledNode.setAttribute('data-title', '  Блок по data-title  ');
    getIframeDocumentMock.mockReturnValue(iframeDoc);
    ctx.processedFieldElements.add(container);

    expect(extractMvsEmbeddedAppFields(container, ctx)).toEqual([
      expect.objectContaining({
        label: 'Карточка с ссылкой',
        value: 'Карточка с ссылкой',
      }),
      expect.objectContaining({
        label: 'Блок по data-title',
        value: 'Блок по data-title',
      }),
    ]);
  });
}

describe('mvs embedded app helpers', () => {
  registerGuardTests();
  registerSectionOwnershipTests();
  registerFieldExtractionDataTests();
  registerFallbackFieldTests();
  registerProcessedContainerToleranceTest();
});
