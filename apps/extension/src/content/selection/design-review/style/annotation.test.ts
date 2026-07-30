// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  browserAnnotationSession,
  createBrowserAnnotationTargetEvidence,
} from '../../../parser/page-preparation/annotations';
import { publishPageStyleAnnotation } from './annotation';

beforeEach(() => {
  browserAnnotationSession.resetForDocument();
  document.body.replaceChildren();
});

afterEach(() => {
  browserAnnotationSession.resetForDocument();
  document.body.replaceChildren();
});

describe('page-style annotation publication', () => {
  it('ignores empty batches and publishes exact validated declaration evidence', () => {
    const target = document.createElement('div');
    document.body.append(target);
    const evidence = createBrowserAnnotationTargetEvidence(target);

    publishPageStyleAnnotation({ changes: [], evidence, target });
    expect(browserAnnotationSession.captureSnapshot().domRecords).toEqual([]);

    publishPageStyleAnnotation({
      changes: [
        {
          after: { priority: 'important', value: 'red' },
          afterPolicy: { source: 'inspector' },
          before: { priority: '', value: '' },
          beforePolicy: { source: 'inspector' },
          order: 0,
          property: 'color',
        },
      ],
      evidence,
      target,
    });

    expect(browserAnnotationSession.captureSnapshot().domRecords[0]?.propertyChanges).toEqual([
      {
        after: { priority: 'important', value: 'red' },
        before: { priority: '', value: '' },
        order: 0,
        property: 'color',
      },
    ]);
  });

  it('rejects evidence that the canonical declaration policy cannot replay', () => {
    const target = document.createElement('div');
    document.body.append(target);
    const evidence = createBrowserAnnotationTargetEvidence(target);

    expect(() =>
      publishPageStyleAnnotation({
        changes: [
          {
            after: {
              priority: '',
              value: 'image-set("https://tracker.test/pixel.png" 1x)',
            },
            afterPolicy: { source: 'inspector' },
            before: { priority: '', value: '' },
            beforePolicy: { source: 'inspector' },
            order: 0,
            property: 'color',
          },
        ],
        evidence,
        target,
      })
    ).toThrow('Cannot publish invalid page-style annotation evidence');
    expect(browserAnnotationSession.captureSnapshot().domRecords).toEqual([]);
  });
});
