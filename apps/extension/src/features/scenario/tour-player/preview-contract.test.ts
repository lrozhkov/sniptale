import { expect, it } from 'vitest';
import { readTourPreviewMessage } from './preview-contract';
it('admits only the bound nonempty HTML file and rejects unrelated messages', () => {
  const blob = new Blob(['<!doctype html>'], { type: 'text/html;charset=utf-8' });
  const message = { kind: 'tour-preview', nonce: 'nonce', blob };
  expect(readTourPreviewMessage(message, 'nonce')?.blob).toBe(blob);
  for (const value of [
    null,
    {},
    { ...message, nonce: 'other' },
    { ...message, blob: 'html' },
    { ...message, blob: new Blob(['x'], { type: 'text/javascript' }) },
  ])
    expect(readTourPreviewMessage(value, 'nonce')).toBeNull();
});
