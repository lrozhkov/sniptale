import { expect, it, vi } from 'vitest';
import { createReviewNoteTransitions, deferReviewGesture } from './note-transitions';

it('retains the first continuation after blur and drops competing requests', async () => {
  let finish!: () => void;
  let isNew = true;
  const completion = new Promise<void>((resolve) => {
    finish = () => {
      isNew = false;
      resolve();
    };
  });
  const pending = vi.fn();
  const owner = createReviewNoteTransitions({
    isNew: () => isNew,
    finishNew: () => completion,
    onPending: pending,
    onFailure: vi.fn(),
  });
  const first = vi.fn();
  const second = vi.fn();
  owner.leave();
  const operation = owner.perform(first);
  owner.beforeAction(second);
  expect(first).not.toHaveBeenCalled();
  finish();
  await operation;
  expect(first).toHaveBeenCalledOnce();
  expect(second).not.toHaveBeenCalled();
  expect(pending.mock.calls).toEqual([[true], [false]]);
  const immediate = vi.fn(() => 42);
  expect(owner.perform(immediate)).toBe(42);
});

it('retains the field on failure, rejects the action, and permits a retry', async () => {
  const finishNew = vi.fn().mockRejectedValueOnce(new Error('Quota')).mockResolvedValue(undefined);
  const failure = vi.fn();
  const action = vi.fn();
  const owner = createReviewNoteTransitions({
    isNew: () => true,
    finishNew,
    onPending: vi.fn(),
    onFailure: failure,
  });
  await owner.perform(action);
  expect(action).not.toHaveBeenCalled();
  expect(failure).toHaveBeenCalledOnce();
  owner.leave();
  expect(finishNew).toHaveBeenCalledOnce();
  await owner.perform(action);
  expect(action).toHaveBeenCalledOnce();
});

it('does not execute a late action after the editor is closed', async () => {
  let release!: () => void;
  let active = true;
  const owner = createReviewNoteTransitions({
    isNew: () => true,
    isActive: () => active,
    finishNew: () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    onPending: vi.fn(),
    onFailure: vi.fn(),
  });
  const action = vi.fn();
  const operation = owner.perform(action);
  active = false;
  release();
  await operation;
  expect(action).not.toHaveBeenCalled();
});

it('keeps pointer selection and the final typed commit together while saving', () => {
  let admit!: () => void;
  const select = vi.fn();
  const commit = vi.fn();
  const gesture = deferReviewGesture((action) => {
    admit = action;
  }, select);
  gesture.commit(commit);
  expect(select).not.toHaveBeenCalled();
  expect(commit).not.toHaveBeenCalled();
  admit();
  expect(select).toHaveBeenCalledOnce();
  expect(commit).toHaveBeenCalledOnce();
  const cancelled = deferReviewGesture((action) => {
    admit = action;
  }, select);
  cancelled.cancel();
  cancelled.commit(commit);
  admit();
  expect(select).toHaveBeenCalledOnce();
  expect(commit).toHaveBeenCalledOnce();
});
