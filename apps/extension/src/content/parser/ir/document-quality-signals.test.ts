import { describe, expect, it } from 'vitest';
import type { ParsedDocument } from '@sniptale/runtime-contracts/dom-tree';

import { buildQualitySignals } from './document-quality-signals';

function createSignalDocument(): ParsedDocument {
  return {
    context: 'test',
    title: 'Signals',
    structure: [
      {
        type: 'section',
        id: 'section-1',
        title: 'Flags',
        selected: true,
        children: [
          ...Array.from({ length: 5 }, (_, index) => ({
            type: 'field' as const,
            id: `dup-${index + 1}`,
            label: 'Status',
            value: `Value ${index + 1}`,
            valueType: 'string' as const,
          })),
          ...Array.from({ length: 8 }, (_, index) => ({
            type: 'field' as const,
            id: `flag-${index + 1}`,
            label: `Flag ${index + 1}`,
            value: 'Да',
            valueType: 'boolean' as const,
          })),
        ],
      },
    ],
    meta: {
      payloadTrace: [{ schemaTextHint: 'schema candidate' }],
      profile: { pipelineId: 'generic-safe-fallback' } as never,
      rootSelection: {
        candidateEvaluations: [
          {
            score: 100,
            selected: true,
            selector: '.selected-root',
            source: 'dom',
          },
          {
            score: 160,
            selected: false,
            selector: '.schema-root',
            source: 'schema-text',
          },
        ],
      } as never,
    } as never,
  };
}

describe('document quality signals', () => {
  it('builds duplicate-label, boolean-noise, schema-mismatch, and fallback signals', () => {
    const signals = buildQualitySignals(createSignalDocument());

    expect(signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'duplicate-property-labels', severity: 'warning' }),
        expect.objectContaining({ kind: 'boolean-noise', severity: 'warning' }),
        expect.objectContaining({ kind: 'schema-dom-mismatch', severity: 'warning' }),
        expect.objectContaining({ kind: 'fallback-pipeline-used', severity: 'info' }),
      ])
    );
  });

  it(
    'skips optional signals when the document does not cross their thresholds',
    shouldSkipOptionalSignals
  );
});

function shouldSkipOptionalSignals(): void {
  const signals = buildQualitySignals({
    context: 'test',
    title: 'Healthy',
    structure: [
      {
        type: 'section',
        id: 'section-1',
        title: 'Overview',
        selected: true,
        children: [
          {
            type: 'field',
            id: 'field-1',
            label: 'Summary',
            value: 'Healthy content',
            valueType: 'string',
            contentRole: 'paragraph',
          },
        ],
      },
    ],
    meta: {
      payloadTrace: [],
      profile: { pipelineId: 'naumen-sd-gwt' } as never,
      rootSelection: {
        candidateEvaluations: [
          {
            score: 130,
            selected: true,
            selector: '.selected-root',
            source: 'dom',
          },
        ],
      } as never,
    } as never,
  });

  expect(signals).toEqual([]);
}
