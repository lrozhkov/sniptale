import { describe, expect, it } from 'vitest';
import type { ExportData } from '@sniptale/runtime-contracts/export';
import type { ParsedDocument } from '@sniptale/runtime-contracts/dom-tree';
import { formatDataForAIJSON } from '../dom-tree-parser/ai/editable-format';
import { convertTreeToMarkdown } from '../dom-tree-parser/ai/markdown';
import { buildExportData } from '../export-manager/formats/data';

type AiProjection = {
  f: Array<{ n: string; c: string }>;
  t: Array<{ ttl: string; r: Array<{ d: Record<string, string> }> }>;
};

type SemanticProjection = {
  fields: string[];
  rows: string[];
  sections: string[];
};

function createSummarySection(): ParsedDocument['structure'][number] {
  return {
    type: 'section',
    id: 'summary',
    title: 'Summary',
    children: [
      {
        type: 'field',
        id: 'status',
        label: 'Status',
        selected: true,
        value: 'Open',
        valueType: 'string',
      },
      {
        type: 'table',
        id: 'assets',
        headers: ['Asset', 'State'],
        rows: [
          {
            data: { Asset: 'Laptop', State: 'Active' },
            id: 'asset-1',
            selected: true,
            selector: '#asset-1',
          },
        ],
        selected: true,
      },
    ],
  };
}

function createParityDocument(): ParsedDocument {
  return {
    context: 'parity-test',
    title: 'Support request',
    structure: [createSummarySection()],
    meta: {
      profile: {
        appFamily: 'generic-web',
        confidence: 0.8,
        matchedSignals: [],
        pageKind: 'content',
        pipelineId: 'generic-structured',
        preferredRoots: ['body'],
        vendor: 'generic',
      },
      title: 'Support request',
      url: 'https://example.test/support',
      warnings: [],
    },
  };
}

function readAiSemantics(projection: AiProjection): SemanticProjection {
  return {
    fields: projection.f.map((field) => `${field.n}:${field.c}`),
    rows: projection.t.flatMap((table) =>
      table.r.flatMap((row) => Object.entries(row.d).map(([key, value]) => `${key}:${value}`))
    ),
    sections: projection.t.map((table) => table.ttl),
  };
}

function readExportSemantics(data: ExportData): SemanticProjection {
  return {
    fields: data.sections.flatMap(
      (section) => section.fields?.map((field) => `${field.label}:${field.value}`) ?? []
    ),
    rows: data.sections.flatMap(
      (section) =>
        section.tables?.flatMap((table) =>
          table.rows.flatMap((row) =>
            Object.entries(row.data).map(([key, value]) => `${key}:${value}`)
          )
        ) ?? []
    ),
    sections: data.sections.map((section) => section.title),
  };
}

function expectMarkdownSemantics(markdown: string, semantics: SemanticProjection): void {
  semantics.sections.forEach((section) => expect(markdown).toContain(section));
  semantics.fields.forEach((field) => {
    const [label, value] = field.split(':');
    expect(markdown).toContain(label);
    expect(markdown).toContain(value);
  });
  semantics.rows.forEach((row) => {
    const [header, value] = row.split(':');
    expect(markdown).toContain(header);
    expect(markdown).toContain(value);
  });
}

describe('parser projector semantic parity', () => {
  it('projects shared parsed document semantics into AI, markdown, and export JSON', () => {
    const documentData = createParityDocument();
    const aiSemantics = readAiSemantics(JSON.parse(formatDataForAIJSON(documentData)));
    const markdown = convertTreeToMarkdown(documentData);
    const exportSemantics = readExportSemantics(buildExportData(documentData));

    expect(aiSemantics).toEqual(exportSemantics);
    expectMarkdownSemantics(markdown, exportSemantics);
  });
});
