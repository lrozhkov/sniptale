// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { browserAnnotationSession } from '../../../parser/page-preparation/annotations';
import { createPageStyleAnnotationEvidence, publishPageStyleAnnotation } from './annotation';

beforeEach(() => {
  browserAnnotationSession.resetForDocument();
  document.body.replaceChildren();
});

afterEach(() => {
  browserAnnotationSession.resetForDocument();
  document.body.replaceChildren();
});

describe('page-style annotation evidence', () => {
  it('captures stable top-document evidence without transient Sniptale identity', () => {
    const parent = document.createElement('main');
    parent.className = 'layout sniptale-transient';
    const target = document.createElement('p');
    target.id = 'target';
    target.className = 'copy sniptale-overlay emphasized';
    target.setAttribute('role', 'note');
    target.textContent = '  Visible   annotation text  ';
    parent.append(target);
    document.body.append(parent);

    const evidence = createPageStyleAnnotationEvidence(target);

    expect(evidence).toMatchObject({
      fileLabel: 'browser:Visible annotation text',
      frame: { kind: 'top-document' },
      targetRole: 'note',
      targetText: 'Visible   annotation text',
    });
    expect(evidence.targetSelector).toContain('#target');
    expect(evidence.targetSelector).not.toContain('data-sniptale-id');
    expect(evidence.targetPath).toContain('p#target.copy.emphasized');
    expect(evidence.targetPath).not.toContain('sniptale-');
  });

  it('captures iframe context and falls back to the element name for empty text', () => {
    const iframe = document.createElement('iframe');
    iframe.id = 'same-origin-frame';
    iframe.name = 'Editor frame';
    document.body.append(iframe);
    const target = iframe.contentDocument!.createElement('div');
    iframe.contentDocument!.body.append(target);

    const evidence = createPageStyleAnnotationEvidence(target);

    expect(evidence.fileLabel).toBe('browser:div');
    expect(evidence.frame).toMatchObject({
      kind: 'iframe',
      name: 'Editor frame',
      selector: 'iframe#same-origin-frame',
    });
    expect(evidence).not.toHaveProperty('targetRole');
  });
});

describe('page-style annotation publication', () => {
  it('ignores empty batches and publishes exact validated declaration evidence', () => {
    const target = document.createElement('div');
    document.body.append(target);
    const evidence = createPageStyleAnnotationEvidence(target);

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
    const evidence = createPageStyleAnnotationEvidence(target);

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
