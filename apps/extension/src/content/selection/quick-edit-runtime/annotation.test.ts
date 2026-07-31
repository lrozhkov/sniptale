// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it } from 'vitest';
import { browserAnnotationSession } from '../../parser/page-preparation/annotations';
import { captureQuickEditTextAnnotation, publishCommittedQuickEditTextChanges } from './annotation';

beforeEach(() => {
  browserAnnotationSession.resetForDocument();
  document.body.replaceChildren();
});

afterEach(() => {
  browserAnnotationSession.resetForDocument();
  document.body.replaceChildren();
});

it('captures original text and selector evidence before publishing committed text', () => {
  const target = document.createElement('p');
  target.id = 'editable';
  target.dataset['sniptaleId'] = 'transient';
  target.textContent = 'Before';
  document.body.append(target);
  const capture = captureQuickEditTextAnnotation(target);

  target.textContent = 'After';
  publishCommittedQuickEditTextChanges([{ after: target.textContent, capture }]);

  expect(browserAnnotationSession.captureSnapshot().domRecords).toEqual([
    expect.objectContaining({
      evidence: expect.objectContaining({ targetSelector: '#editable', targetText: 'Before' }),
      textChange: { after: 'After', before: 'Before' },
    }),
  ]);
});

it('groups a committed batch by live identity and ignores no-op text', () => {
  const first = document.createElement('p');
  const second = document.createElement('p');
  first.textContent = 'First';
  second.textContent = 'Second';
  document.body.append(first, second);
  const firstCapture = captureQuickEditTextAnnotation(first);
  const secondCapture = captureQuickEditTextAnnotation(second);

  publishCommittedQuickEditTextChanges([
    { after: 'First changed', capture: firstCapture },
    { after: 'Second', capture: secondCapture },
  ]);

  expect(browserAnnotationSession.captureSnapshot().domRecords).toEqual([
    expect.objectContaining({ textChange: { after: 'First changed', before: 'First' } }),
  ]);
  expect(browserAnnotationSession.getAnnotationId(second)).toBeNull();
});

it('removes only text evidence when text returns to its original baseline', () => {
  const target = document.createElement('p');
  target.textContent = 'Before';
  document.body.append(target);
  const evidence = captureQuickEditTextAnnotation(target).evidence;
  browserAnnotationSession.setComment({ comment: 'Keep', evidence, target });

  publishCommittedQuickEditTextChanges([
    { after: 'After', capture: { before: 'Before', evidence, target } },
  ]);
  publishCommittedQuickEditTextChanges([
    { after: 'Before', capture: { before: 'After', evidence, target } },
  ]);

  expect(browserAnnotationSession.captureSnapshot().domRecords).toEqual([
    expect.objectContaining({ comment: 'Keep', propertyChanges: [] }),
  ]);
  expect(browserAnnotationSession.captureSnapshot().domRecords[0]).not.toHaveProperty('textChange');
});
