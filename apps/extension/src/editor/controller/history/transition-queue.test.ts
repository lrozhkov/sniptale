import { expect, it } from 'vitest';
import {
  getEditorDocumentTransitionRevision,
  hasPendingEditorDocumentTransition,
  runEditorDocumentTransition,
} from './transition-queue';

it('invalidates a prepared edit at transition admission before the source is replaced', async () => {
  const owner = {};
  const preparedRevision = getEditorDocumentTransitionRevision(owner);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let source = 'old';
  const transition = runEditorDocumentTransition(owner, async () => {
    await gate;
    source = 'new';
  });
  expect(source).toBe('old');
  expect(getEditorDocumentTransitionRevision(owner)).not.toBe(preparedRevision);
  expect(hasPendingEditorDocumentTransition(owner)).toBe(true);
  release();
  await transition;
  expect(source).toBe('new');
  expect(hasPendingEditorDocumentTransition(owner)).toBe(false);
  expect(getEditorDocumentTransitionRevision(owner)).toBe(1);
});
it('retains queued command ordering and keeps generation invalidation after failure', async () => {
  const owner = {};
  let release!: () => void;
  const order: string[] = [];
  const first = runEditorDocumentTransition(owner, async () => {
    order.push('first');
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    throw new Error('refused');
  });
  const outcome = first.catch(() => 'refused');
  const second = runEditorDocumentTransition(owner, async () => {
    order.push('second');
  });
  expect(order).toEqual(['first']);
  expect(getEditorDocumentTransitionRevision(owner)).toBe(2);
  release();
  await outcome;
  await second;
  expect(order).toEqual(['first', 'second']);
  expect(hasPendingEditorDocumentTransition(owner)).toBe(false);
  expect(getEditorDocumentTransitionRevision(owner)).toBe(2);
});
it('keeps independent document owners isolated and supports the existing null owner', async () => {
  const owner = {},
    other = {};
  await runEditorDocumentTransition(owner, async () => 1);
  expect(getEditorDocumentTransitionRevision(other)).toBe(0);
  expect(hasPendingEditorDocumentTransition(null)).toBe(false);
  expect(getEditorDocumentTransitionRevision(null)).toBe(0);
  await expect(runEditorDocumentTransition(null, async () => 2)).resolves.toBe(2);
  await expect(
    runEditorDocumentTransition(null, () => {
      throw new Error('refused');
    })
  ).rejects.toThrow('refused');
});
