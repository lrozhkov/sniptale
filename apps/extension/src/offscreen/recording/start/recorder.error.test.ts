import { expect, it } from 'vitest';
import { getMediaRecorderError } from '../recorder-error';

it('preserves a native MediaRecorder error for visible terminal reporting', () => {
  const native = new Error('encoder failed');
  expect(getMediaRecorderError({ error: native } as unknown as Event, 'fallback')).toBe(native);
});

it('uses the owned fallback when MediaRecorder omits native failure details', () => {
  expect(getMediaRecorderError({} as Event, 'The recording encoder failed.')).toEqual(
    new Error('The recording encoder failed.')
  );
});
