import { afterEach, expect, it, vi } from 'vitest';
import { createTrimmedRecordingFile } from './trim-file';
afterEach(() => vi.unstubAllGlobals());
it('encodes only the chosen samples and closes the decoder on success and failure', async () => {
  const close = vi.fn(async () => undefined);
  const decodeAudioData = vi.fn(async () => ({
    length: 4,
    sampleRate: 4,
    numberOfChannels: 1,
    getChannelData: () => new Float32Array([0, 0.5, -0.5, 1]),
  }));
  vi.stubGlobal(
    'AudioContext',
    class {
      close = close;
      decodeAudioData = decodeAudioData;
    }
  );
  const file = await createTrimmedRecordingFile(new Blob(['source']), 0.25, 0.75);
  const bytes = new DataView(await file.arrayBuffer());
  expect(file.type).toBe('audio/wav');
  expect(bytes.getUint32(40, true)).toBe(4);
  expect(bytes.getInt16(44, true)).toBe(16384);
  expect(bytes.getInt16(46, true)).toBe(-16384);
  expect(close).toHaveBeenCalledTimes(1);
  await expect(createTrimmedRecordingFile(new Blob(), 3, 4)).rejects.toThrow('Empty');
  expect(close).toHaveBeenCalledTimes(2);
});
