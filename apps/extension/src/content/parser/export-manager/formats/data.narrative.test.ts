// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { buildExportArchiveBaseName, buildExportData, createEmptyExportPagePackage } from './data';

function createRichNarrativeBlocksTree(): ParsedDOMTree {
  return {
    context: 'Docs',
    title: 'Rich narrative page',
    structure: [
      {
        type: 'section',
        id: 'section-narrative',
        title: 'Overview',
        kind: 'narrative',
        children: [],
      },
    ],
    blocks: [
      {
        id: 'block-quote',
        sectionId: 'section-narrative',
        kind: 'quote',
        text: 'Quoted note',
      },
      {
        id: 'block-callout',
        sectionId: 'section-narrative',
        kind: 'callout',
        text: 'Important notice',
      },
      {
        id: 'block-code',
        sectionId: 'section-narrative',
        kind: 'code',
        text: 'const value = 1;',
      },
    ],
  };
}

function createTreeWithCanonicalMeta(): ParsedDOMTree {
  return {
    context: 'Portal',
    title: 'Project 7',
    structure: [],
    meta: {
      profile: {
        vendor: 'generic',
        appFamily: 'generic-web',
        pageKind: 'content',
        pipelineId: 'generic-structured',
        confidence: 0.8,
        matchedSignals: [],
        preferredRoots: ['body'],
      },
      title: 'Canonical Export Title',
      url: 'https://example.test/canonical-export',
      warnings: [],
    },
  };
}

function createStructuredFieldTree(): ParsedDOMTree {
  return {
    context: 'Portal',
    title: 'Structured page',
    structure: [
      {
        type: 'section',
        id: 'section-structured',
        title: 'Structured fields',
        children: [
          {
            type: 'field',
            id: 'field-link',
            label: 'Attachment',
            value: 'Open linked attachment',
            valueType: 'string',
            contentRole: 'paragraph',
            linkRef: 'attachment-1',
          },
        ],
      },
    ],
  };
}

beforeEach(() => {
  document.title = 'Export Title';
  window.history.replaceState({}, '', '/export/7');
  vi.stubGlobal('navigator', {
    userAgent: 'VitestAgent/1.0',
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('exports quote, callout, and code narrative blocks as text fields', () => {
  expect(buildExportData(createRichNarrativeBlocksTree()).sections).toEqual([
    {
      title: 'Overview',
      fields: [
        {
          label: 'Текст',
          value: 'Quoted note',
          type: 'string',
          contentRole: 'paragraph',
          linkRef: undefined,
        },
        {
          label: 'Текст',
          value: 'Important notice',
          type: 'string',
          contentRole: 'paragraph',
          linkRef: undefined,
        },
        {
          label: 'Код',
          value: 'const value = 1;',
          type: 'string',
          contentRole: 'paragraph',
          linkRef: undefined,
        },
      ],
    },
  ]);
});

it('preserves optional contentRole and linkRef when structured fields provide them', () => {
  expect(buildExportData(createStructuredFieldTree()).sections).toEqual([
    {
      title: 'Structured fields',
      fields: [
        {
          label: 'Attachment',
          value: 'Open linked attachment',
          type: 'string',
          contentRole: 'paragraph',
          linkRef: 'attachment-1',
        },
      ],
    },
  ]);
});

it('builds export archive names and empty page packages from canonical metadata', () => {
  const tree = createTreeWithCanonicalMeta();

  expect(buildExportArchiveBaseName(tree, buildExportData(tree), '2026-03-22_13-11-12')).toBe(
    'Canonical_Export_Title_2026-03-22_13-11-12'
  );
  expect(createEmptyExportPagePackage('canonical-export')).toEqual({
    archiveBaseName: 'canonical-export',
    entries: [],
  });
});
