import { expect, it, vi } from 'vitest';

import { parseStep } from './parse';

function createNoteStepRecord() {
  return {
    id: 'note-1',
    kind: 'note',
    title: 'Heads up',
    subtitle: 'Legacy subtitle',
    createdAt: 13,
    updatedAt: 14,
    tone: 'unknown',
  };
}

function createSectionStepRecord() {
  return {
    id: 'section-1',
    kind: 'section',
    title: 'Section',
    body: 'Caption',
    createdAt: 15,
    updatedAt: 16,
  };
}

function createDividerStepRecord() {
  return {
    id: 'divider-1',
    kind: 'divider',
    createdAt: 17,
    updatedAt: 18,
  };
}

function createBrokenCaptureStepRecord() {
  return {
    id: 'broken-capture',
    kind: 'capture',
    createdAt: 19,
    updatedAt: 20,
  };
}

it('parses note steps with legacy subtitle fallbacks', () => {
  vi.spyOn(Date, 'now').mockReturnValue(500);

  expect(parseStep(createNoteStepRecord(), 0)).toEqual(
    expect.objectContaining({
      id: 'note-1',
      tone: 'neutral',
      body: 'Legacy subtitle',
    })
  );
});

it('parses section steps', () => {
  vi.spyOn(Date, 'now').mockReturnValue(500);

  expect(parseStep(createSectionStepRecord(), 0)).toEqual(
    expect.objectContaining({
      id: 'section-1',
      kind: 'section',
    })
  );
});

it('parses divider steps', () => {
  vi.spyOn(Date, 'now').mockReturnValue(500);

  expect(parseStep(createDividerStepRecord(), 0)).toEqual(
    expect.objectContaining({
      id: 'divider-1',
      kind: 'divider',
    })
  );
});

it('rejects malformed capture steps', () => {
  vi.spyOn(Date, 'now').mockReturnValue(500);

  expect(parseStep(createBrokenCaptureStepRecord(), 0)).toBeNull();
});

it('returns null for non-record step values', () => {
  expect(parseStep(null, 0)).toBeNull();
});
