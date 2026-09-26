import { expect, it } from 'vitest';
import {
  readTourPreviewMessage,
  readScenarioPreviewStatus,
  SCENARIO_PREVIEW_MAX_BYTES,
} from './preview-contract';
it('admits only the bound nonempty HTML file and rejects unrelated messages', () => {
  const blob = new Blob(['<!doctype html>'], { type: 'text/html;charset=utf-8' });
  const message = { kind: 'tour-preview', mode: 'tour', nonce: 'nonce', blob };
  expect(readTourPreviewMessage(message, 'nonce')?.blob).toBe(blob);
  for (const value of [
    null,
    {},
    { ...message, nonce: 'other' },
    { ...message, mode: 'arbitrary-html' },
    { ...message, blob: 'html' },
    { ...message, blob: new Blob(['x'], { type: 'text/javascript' }) },
  ])
    expect(readTourPreviewMessage(value, 'nonce')).toBeNull();
});
it('enforces the blob budget and binds status without admitting commands', () => {
  const blob = new Blob(['x'], { type: 'text/html' });
  Object.defineProperty(blob, 'size', { value: SCENARIO_PREVIEW_MAX_BYTES + 1 });
  expect(
    readTourPreviewMessage({ kind: 'tour-preview', mode: 'guide', nonce: 'n', blob }, 'n')
  ).toBeNull();
  expect(
    readScenarioPreviewStatus({ kind: 'scenario-preview-status', nonce: 'n', status: 'ready' }, 'n')
  ).toBe('ready');
  expect(
    readScenarioPreviewStatus(
      { kind: 'scenario-preview-status', nonce: 'old', status: 'ready' },
      'n'
    )
  ).toBeNull();
  expect(
    readScenarioPreviewStatus(
      { kind: 'scenario-preview-status', nonce: 'n', status: 'delete' },
      'n'
    )
  ).toBeNull();
});
