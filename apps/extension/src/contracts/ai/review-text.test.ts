import { describe, expect, it } from 'vitest';
import {
  parseReviewTextClientMessage,
  parseReviewTextProposal,
  parseReviewTextServerMessage,
  reviewTextContextSchema,
  type ReviewTextContext,
} from './review-text';

const context: ReviewTextContext = {
  version: 1,
  prompt: 'Make it shorter',
  mode: 'phrases',
  wholeDocument: false,
  changeIntervals: false,
  resegment: false,
  window: { start: 1, end: 8 },
  fragments: [
    { id: 'one', text: 'First', start: 1, end: 2 },
    { id: 'two', text: 'Second', start: 6, end: 8 },
  ],
};
const proposal = {
  version: 1,
  fragments: [
    { fromIds: ['one'], text: 'A' },
    { fromIds: ['two'], text: 'B' },
  ],
};

describe('bounded review text contract', () => {
  it('accepts fixed text edits without requiring any media identity or language', () => {
    expect(reviewTextContextSchema.safeParse(context).success).toBe(true);
    expect(parseReviewTextProposal(proposal, context)).toEqual(proposal);
  });
  it.each([
    { ...proposal, gain: 0 },
    {
      ...proposal,
      fragments: [{ fromIds: ['one'], text: 'A', start: 1, end: 2 }, proposal.fragments[1]],
    },
    { ...proposal, fragments: [{ fromIds: ['one'], text: 'A' }] },
    { ...proposal, fragments: [proposal.fragments[0], proposal.fragments[0]] },
    { ...proposal, fragments: [{ fromIds: ['unknown'], text: 'A' }, proposal.fragments[1]] },
    { ...proposal, fragments: [{ fromIds: ['one', 'two'], text: 'Combined' }] },
    {
      ...proposal,
      fragments: [{ fromIds: ['one'], text: 'A', audio: 'url' }, proposal.fragments[1]],
    },
  ])('refuses missing, repeated, unknown or unauthorized fields and structure', (value) => {
    expect(parseReviewTextProposal(value, context)).toBeNull();
  });
  it('requires both explicit timing and whole-script permission to restructure', () => {
    const restructured = {
      version: 1,
      fragments: [{ fromIds: ['one', 'two'], text: 'Together', start: 1, end: 8 }],
    };
    const permitted: ReviewTextContext = {
      ...context,
      mode: 'script',
      wholeDocument: true,
      changeIntervals: true,
      resegment: true,
    };
    expect(parseReviewTextProposal(restructured, permitted)).toEqual(restructured);
    for (const patch of [
      { wholeDocument: false },
      { mode: 'phrases' as const },
      { changeIntervals: false },
    ])
      expect(parseReviewTextProposal(restructured, { ...permitted, ...patch })).toBeNull();
    for (const interval of [
      { start: 0, end: 8 },
      { start: 1, end: 9 },
      { start: 3, end: 3 },
      { start: NaN, end: 8 },
    ])
      expect(
        parseReviewTextProposal(
          { ...restructured, fragments: [{ ...restructured.fragments[0], ...interval }] },
          permitted
        )
      ).toBeNull();
  });
  it('admits explicit splits with complete old-to-new mapping, refusing unmapped or duplicate sources', () => {
    const permitted = {
      ...context,
      mode: 'script' as const,
      wholeDocument: true,
      changeIntervals: true,
      resegment: true,
    };
    const split = {
      version: 1,
      fragments: [
        { fromIds: ['one'], text: 'A', start: 1, end: 2 },
        { fromIds: ['one', 'two'], text: 'B', start: 6, end: 8 },
      ],
    };
    expect(parseReviewTextProposal(split, permitted)).toEqual(split);
    expect(
      parseReviewTextProposal(
        { ...split, fragments: [{ ...split.fragments[0], fromIds: ['one', 'one', 'two'] }] },
        permitted
      )
    ).toBeNull();
  });
  it('bounds the complete input and expected output before dispatch rather than silently chunking', () => {
    expect(
      reviewTextContextSchema.safeParse({
        ...context,
        fragments: [{ ...context.fragments[0], text: 'я'.repeat(2_000) }],
      }).success
    ).toBe(false);
    expect(
      reviewTextContextSchema.safeParse({ ...context, prompt: 'x'.repeat(4_001) }).success
    ).toBe(false);
    expect(
      reviewTextContextSchema.safeParse({
        ...context,
        fragments: [context.fragments[0], context.fragments[0]],
      }).success
    ).toBe(false);
    expect(reviewTextContextSchema.safeParse({ ...context, assetId: 'private' }).success).toBe(
      false
    );
  });
  it('requires captured destination and model identity on the one-shot wire', () => {
    const start = {
      type: 'start',
      requestId: 'f204dbf4-fcc2-4d0d-964d-d623d6e00578',
      modelId: 'model',
      approvedProviderId: 'provider',
      approvedDestination: `sha256:${'a'.repeat(64)}`,
      approvedModelCode: 'code',
      llmSessionToken: 'token',
      context,
      scope: { workspaceId: 'workspace', workspaceRevision: 1 },
    };
    expect(parseReviewTextClientMessage(start)).toEqual(start);
    expect(parseReviewTextClientMessage({ ...start, approvedDestination: undefined })).toBeNull();
    expect(parseReviewTextClientMessage({ ...start, baseUrl: 'https://other' })).toBeNull();
    expect(
      parseReviewTextServerMessage({
        type: 'failure',
        requestId: start.requestId,
        code: 'provider-failed',
        error: 'private',
      })
    ).toBeNull();
  });
});

it('preserves disjoint nested and repeated projected ranges without treating the envelope as placement', () => {
  const ranges = [
    { start: 1, end: 8 },
    { start: 2, end: 3 },
    { start: 2, end: 3 },
  ];
  const input = { ...context, fragments: [{ ...context.fragments[0]!, start: 1, end: 8, ranges }] };
  expect(reviewTextContextSchema.parse(input).fragments[0]?.ranges).toEqual(ranges);
  expect(
    parseReviewTextProposal({ version: 1, fragments: [proposal.fragments[0]] }, input)
  ).toEqual({ version: 1, fragments: [proposal.fragments[0]] });
  for (const invalid of [
    [],
    [ranges[0]],
    [ranges[1], ranges[0]],
    [
      { start: 1, end: 8 },
      { start: 2, end: 9 },
    ],
    [
      { start: 1, end: 8 },
      { start: 2, end: 2 },
    ],
    [
      { start: 1, end: 8 },
      { start: 2, end: Infinity },
    ],
    [
      { start: 1, end: 8 },
      { start: 2, end: 3, clipId: 'private' },
    ],
  ])
    expect(
      reviewTextContextSchema.safeParse({
        ...input,
        fragments: [{ ...input.fragments[0], ranges: invalid }],
      }).success
    ).toBe(false);
  expect(
    reviewTextContextSchema.safeParse({
      ...input,
      fragments: [
        { ...input.fragments[0], ranges: Array.from({ length: 2_000 }, () => ranges[0]) },
      ],
    }).success
  ).toBe(false);
});

it('admits a strict montage document scope separately from a Gallery workspace', () => {
  const scope = {
    kind: 'project-text',
    projectId: 'project',
    projectRevision: 2,
    projectUpdatedAt: 100,
    documentId: 'document',
  };
  const start = {
    type: 'start',
    requestId: 'f204dbf4-fcc2-4d0d-964d-d623d6e00578',
    modelId: 'model',
    approvedProviderId: 'provider',
    approvedDestination: `sha256:${'a'.repeat(64)}`,
    approvedModelCode: 'code',
    llmSessionToken: 'token',
    context,
    scope,
  };
  expect(parseReviewTextClientMessage(start)).toEqual(start);
  for (const patch of [
    { kind: 'other' },
    { documentId: '' },
    { projectRevision: 1.5 },
    { projectUpdatedAt: NaN },
    { workspaceId: 'gallery' },
    { assetId: 'private' },
  ])
    expect(parseReviewTextClientMessage({ ...start, scope: { ...scope, ...patch } })).toBeNull();
  const { documentId: _documentId, ...missing } = scope;
  expect(parseReviewTextClientMessage({ ...start, scope: missing })).toBeNull();
});
