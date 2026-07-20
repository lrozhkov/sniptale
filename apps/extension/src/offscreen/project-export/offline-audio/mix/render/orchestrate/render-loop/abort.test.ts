import { expect, it } from 'vitest';

import { throwIfOfflineAudioMixAborted } from './abort';

it('throws an abort error when the signal is already aborted', () => {
  const controller = new AbortController();
  controller.abort();

  expect(() => throwIfOfflineAudioMixAborted(controller.signal)).toThrow('The export was aborted.');
});
