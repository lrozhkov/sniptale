// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { buildVirtualDOM } from '../../dom-tree-parser/traversal';
import { buildPortalHomepageFixture } from '../../parsers/generic/portal/homepage.test.fixtures';
import {
  buildEmbeddedDynamicFieldsSection,
  createNaumenMvsContainer,
  setPageTitleContext,
  setupCardPageContext,
} from '../../../../../../../tooling/test/support/content/dom-tree-parser';
import { applyDirectExtractors } from '.';
import {
  expectGenericDocsExtraction,
  expectGenericNarrativeExtraction,
  expectGenericSearchExtraction,
  expectStandardGwtExtraction,
} from './index.test.helpers';
import {
  buildGenericArticleFixture,
  buildGenericDocsFixture,
  buildGenericSearchFixture,
} from './generic.test.fixtures';
import { buildGwtSectionFixture, buildServiceCallSummaryFixture } from './naumen.test.fixtures';
import { createEmptyDocument } from './index.test.fixtures';

function createPageContext() {
  return {
    pageHostname: window.location.hostname,
    pageTitle: document.title,
    pageUrl: window.location.href,
  };
}

function registerPortalServiceCallExtractorTest(): void {
  it('extracts service-call summary directly into the canonical document', () => {
    const root = buildServiceCallSummaryFixture();

    const documentData = applyDirectExtractors(
      createEmptyDocument(),
      root,
      {
        vendor: 'naumen-portal',
        appFamily: 'naumen-portal',
        pageKind: 'service-call',
        pipelineId: 'naumen-portal',
        confidence: 0.95,
        matchedSignals: [],
        preferredRoots: ['#serviceCall', 'body'],
      },
      createPageContext()
    );

    const fields = documentData.structure.flatMap((section) =>
      section.children.filter((child) => child.type === 'field')
    );

    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Номер запроса', value: 'RP49784' }),
        expect.objectContaining({ label: 'Статус', value: 'В работе' }),
        expect.objectContaining({ label: 'Услуга', value: 'Услуга LR' }),
      ])
    );
  });
}

function registerPortalHomepageExtractorTest(): void {
  it('extracts portal homepage sections directly without legacy parser state', () => {
    buildPortalHomepageFixture();

    const documentData = applyDirectExtractors(
      createEmptyDocument(),
      document.body,
      {
        vendor: 'naumen-portal',
        appFamily: 'naumen-portal',
        pageKind: 'homepage',
        pipelineId: 'naumen-portal',
        confidence: 0.99,
        matchedSignals: [],
        preferredRoots: ['.Main__root', 'body'],
      },
      createPageContext()
    );

    expect(documentData.structure.map((section) => section.title)).toEqual(
      expect.arrayContaining([
        'Мы здесь, чтобы помочь вам',
        'Ожидают согласования',
        'Популярные услуги',
        'Статьи базы знаний',
      ])
    );
  });
}

function registerGenericArticleDirectExtractorTest(): void {
  it('extracts generic narrative content through the universal generic extractor', () => {
    buildGenericArticleFixture();

    const documentData = applyDirectExtractors(
      createEmptyDocument(),
      document.body,
      {
        vendor: 'generic',
        appFamily: 'generic-web',
        pageKind: 'content',
        pipelineId: 'generic-structured',
        confidence: 0.85,
        matchedSignals: [],
        preferredRoots: ['main article', 'article', '[role="main"]'],
      },
      createPageContext()
    );

    expectGenericNarrativeExtraction(documentData);
  });
}

function registerGenericDocsExtractorTest(): void {
  it('extracts docs-like content and preserves structured tables', () => {
    buildGenericDocsFixture();

    const documentData = applyDirectExtractors(
      createEmptyDocument(),
      document.body,
      {
        vendor: 'generic',
        appFamily: 'generic-web',
        pageKind: 'content',
        pipelineId: 'generic-structured',
        confidence: 0.85,
        matchedSignals: [],
        preferredRoots: ['main article', 'article', 'main', '[role="main"]'],
      },
      createPageContext()
    );

    expectGenericDocsExtraction(documentData);
  });
}

function registerGenericSearchExtractorTest(): void {
  it('extracts repeated result cards through the universal generic extractor', () => {
    buildGenericSearchFixture();

    const documentData = applyDirectExtractors(
      createEmptyDocument(),
      document.body,
      {
        vendor: 'generic',
        appFamily: 'generic-web',
        pageKind: 'content',
        pipelineId: 'generic-structured',
        confidence: 0.85,
        matchedSignals: [],
        preferredRoots: ['main', '[role="main"]', 'body'],
      },
      createPageContext()
    );

    expectGenericSearchExtraction(documentData);
  });
}

function registerNaumenSdStandardExtractorTest(): void {
  it('extracts standard GWT sections, attr lists, tables, and comments directly', () => {
    buildGwtSectionFixture();

    const documentData = applyDirectExtractors(
      createEmptyDocument(),
      document.body,
      {
        vendor: 'naumen-sd-gwt',
        appFamily: 'naumen-sd',
        pageKind: 'object-card',
        pipelineId: 'naumen-sd-gwt',
        confidence: 0.99,
        matchedSignals: [],
        preferredRoots: ['body'],
      },
      createPageContext()
    );

    expectStandardGwtExtraction(documentData);
  });
}

function registerNaumenSdDynamicFieldsExtractorTest(): void {
  it('extracts Naumen SD dynamic fields directly from embedded iframe seams', () => {
    setPageTitleContext();
    buildEmbeddedDynamicFieldsSection();
    const virtualRoot = buildVirtualDOM();

    const documentData = applyDirectExtractors(
      createEmptyDocument(),
      virtualRoot,
      {
        vendor: 'naumen-sd-gwt',
        appFamily: 'naumen-sd',
        pageKind: 'dynamic-fields',
        pipelineId: 'naumen-sd-gwt',
        confidence: 0.99,
        matchedSignals: [],
        preferredRoots: ['body'],
      },
      createPageContext()
    );

    const fields = documentData.structure.flatMap((section) =>
      section.children.filter((child) => child.type === 'field')
    );

    expect(fields).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: 'VIP статус', value: 'Нет' })])
    );
  });
}

function registerNaumenSdMvsExtractorTest(): void {
  it('extracts Naumen SD MVS embedded fields directly from virtual iframe seams', () => {
    setupCardPageContext();
    createNaumenMvsContainer();
    const virtualRoot = buildVirtualDOM();

    const documentData = applyDirectExtractors(
      createEmptyDocument(),
      virtualRoot,
      {
        vendor: 'naumen-sd-gwt',
        appFamily: 'naumen-sd',
        pageKind: 'embedded-mvs',
        pipelineId: 'naumen-sd-gwt',
        confidence: 0.99,
        matchedSignals: [],
        preferredRoots: ['body'],
      },
      createPageContext()
    );

    const labels = documentData.structure.flatMap((section) =>
      section.children.filter((child) => child.type === 'field').map((child) => child.label)
    );

    expect(labels).toEqual(
      expect.arrayContaining([
        'Лицензии / Менеджеры услуги',
        'Антивирусное ПО (6912) / Системный статус',
      ])
    );
  });
}

describe('pipeline direct extractors', () => {
  afterEach(() => {
    document.body.replaceChildren();
    document.title = '';
    window.history.replaceState({}, '', '/');
  });

  registerPortalServiceCallExtractorTest();
  registerPortalHomepageExtractorTest();
  registerGenericArticleDirectExtractorTest();
  registerGenericDocsExtractorTest();
  registerGenericSearchExtractorTest();
  registerNaumenSdStandardExtractorTest();
  registerNaumenSdDynamicFieldsExtractorTest();
  registerNaumenSdMvsExtractorTest();
});
