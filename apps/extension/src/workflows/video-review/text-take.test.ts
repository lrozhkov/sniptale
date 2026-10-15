import { expect, it } from 'vitest';
import { createVideoReviewSession } from './session';
import { assertReviewTextTakeBasis, captureReviewTextTakeBasis } from './text-take';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import {
  addReviewTextFragment,
  createReviewTextDocument,
} from '../../features/video/review/text-document';

function fixture(timeDomain: 'source' | 'result' = 'result') {
  const advanced = createQuickEditAdvancedState();
  const added = addReviewTextFragment(createReviewTextDocument(), {
    id: 'text',
    text: 'Narration',
    start: 1,
    end: 4,
    timeDomain,
  });
  if (!added.ok) throw new Error('fixture');
  advanced.text = added.document;
  const session = createVideoReviewSession({
    workspace: {
      aggregateId: 'video',
      sourceAssetId: 'source',
      formatVersion: 1,
      revision: 1,
      source: { duration: 10, width: 640, height: 360, mimeType: 'video/webm', size: 5 },
      advanced,
      history: [],
      cursor: 0,
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  });
  session.setAutosaveEnabled(false);
  return session;
}

it('projects a partially cut source phrase through Speed without changing the text clock', async () => {
  const session = fixture('source');
  for (const edit of [
    { id: 'cut', kind: 'cut' as const, start: 0, end: 2, requestedStart: 0, requestedEnd: 2 },
    {
      id: 'speed',
      kind: 'speed' as const,
      start: 2,
      end: 10,
      requestedStart: 2,
      requestedEnd: 10,
      rate: 2 as const,
      audio: 'speed' as const,
    },
  ])
    await session.commit({ id: edit.id, at: 1, target: 'edit', before: null, after: edit });
  const basis = captureReviewTextTakeBasis(session, 'text');
  expect(basis).toMatchObject({
    resultStart: 0,
    resultDuration: 4,
    fragment: { start: 1, end: 4, timeDomain: 'source' },
  });
  expect(session.getSnapshot().dirty).toBe(true);
});

it('refuses an excluded source phrase before recording or import', async () => {
  const session = fixture('source');
  await session.commit({
    id: 'cut',
    at: 1,
    target: 'edit',
    before: null,
    after: { id: 'cut', kind: 'cut', start: 0, end: 5, requestedStart: 0, requestedEnd: 5 },
  });
  expect(() => captureReviewTextTakeBasis(session, 'text')).toThrow('duration');
});

it('rejects a changed timing revision even when the captured text remains identical', async () => {
  const session = fixture();
  const basis = captureReviewTextTakeBasis(session, 'text');
  const snapshot = {
    kind: 'gallery' as const,
    textId: 'text',
    revision: basis.fragment.revision,
    timingRevision: basis.fragment.timingRevision,
    text: basis.fragment.text,
    start: basis.fragment.start,
    end: basis.fragment.end,
    timeDomain: basis.fragment.timeDomain,
  };
  const preview = { geometry: basis.geometry, expiresAt: Infinity, textSnapshot: snapshot };
  assertReviewTextTakeBasis(session, preview);
  const before = session.getSnapshot().document.advancedContent;
  await session.commit({
    id: 'timing',
    at: 1,
    target: 'advancedContent',
    before,
    after: {
      ...before,
      text: {
        version: 1,
        fragments: before.text!.fragments.map((fragment) => ({
          ...fragment,
          start: 2,
          end: 5,
          timingRevision: fragment.timingRevision + 1,
        })),
      },
    },
  });
  expect(() => assertReviewTextTakeBasis(session, preview)).toThrow('stale');
});
