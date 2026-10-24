import { expect, it } from 'vitest';
import {
  VOICE_HISTORY_MAX_AUDIO_BYTES,
  VOICE_HISTORY_MAX_DURATION_SECONDS,
} from '@sniptale/runtime-contracts/voice-input';
import { createHistoryFixture, publish, recording } from './test-support';

it('retains immutable audio and raw text before completing correction', async () => {
  const fixture = createHistoryFixture();
  const history = fixture.create();
  await history.initialize();
  const original = await publish(history);
  let scope = await history.beginProcessing(original);
  scope = await history.saveRawTranscript(scope, 'raw words');
  expect((await history.get(scope)).rawTranscript).toBe('raw words');
  const result = await history.complete(scope, {
    rawTranscript: 'raw words',
    transcript: 'Corrected.',
    correctionStatus: 'applied',
  });
  expect(result).toMatchObject({
    status: 'ready',
    transcript: 'Corrected.',
    sequence: 1,
    revision: 4,
  });
  expect(await (await history.readAudio(original)).text()).toBe('original');
  await expect(history.get(original)).rejects.toMatchObject({ code: 'stale' });
});

it('keeps the last twenty original capture sequences without changing retry order', async () => {
  const history = createHistoryFixture().create();
  await history.initialize();
  for (let i = 0; i < 22; i++) await publish(history);
  const entries = await history.list();
  expect(entries.map((entry) => entry.sequence)).toEqual(
    Array.from({ length: 20 }, (_, i) => 22 - i)
  );
  await history.beginProcessing(entries[19]!);
  expect((await history.list()).map((entry) => entry.sequence)).toEqual(
    entries.map((entry) => entry.sequence)
  );
});

it('keeps list get audio and verification write-free', async () => {
  const fixture = createHistoryFixture();
  const history = fixture.create();
  await history.initialize();
  const scope = await publish(history);
  fixture.catalog.write.mockClear();
  fixture.audio.remove.mockClear();
  await history.list();
  await history.get(scope);
  await history.readAudio(scope);
  await history.verifyEmpty();
  expect(fixture.catalog.write).not.toHaveBeenCalled();
  expect(fixture.audio.remove).not.toHaveBeenCalled();
});

it('rejects empty unsupported oversized and overlong audio before publication', async () => {
  const fixture = createHistoryFixture();
  const history = fixture.create();
  await history.initialize();
  const token = await history.beginCapture();
  await expect(
    history.publishAudio(token, { ...recording(), audio: new Blob([]) })
  ).rejects.toMatchObject({ code: 'storage-failed' });
  await expect(
    history.publishAudio(token, { ...recording(), audio: new Blob(['x'], { type: 'text/plain' }) })
  ).rejects.toMatchObject({ code: 'storage-failed' });
  await expect(
    history.publishAudio(token, {
      ...recording(),
      audio: new Blob([new Uint8Array(VOICE_HISTORY_MAX_AUDIO_BYTES + 1)], { type: 'audio/wav' }),
    })
  ).rejects.toMatchObject({ code: 'too-large' });
  await expect(
    history.publishAudio(token, {
      ...recording(),
      durationSeconds: VOICE_HISTORY_MAX_DURATION_SECONDS + 1,
    })
  ).rejects.toMatchObject({ code: 'too-large' });
  expect(fixture.audio.write).not.toHaveBeenCalled();
});

it('reports corrupt or missing immutable audio without repairing the catalog', async () => {
  const fixture = createHistoryFixture();
  const history = fixture.create();
  await history.initialize();
  const scope = await publish(history);
  const key = [...fixture.files.keys()][0]!;
  fixture.files.set(key, new File(['modified'], key));
  fixture.catalog.write.mockClear();
  await expect(history.readAudio(scope)).rejects.toMatchObject({ code: 'storage-failed' });
  fixture.files.clear();
  await expect(history.readAudio(scope)).rejects.toMatchObject({ code: 'storage-failed' });
  expect(fixture.catalog.write).not.toHaveBeenCalled();
  expect(await history.list()).toHaveLength(1);
});

it('returns WAV file metadata without changing original audio bytes', async () => {
  const history = createHistoryFixture().create();
  await history.initialize();
  const scope = await history.publishAudio(await history.beginCapture(), {
    ...recording(),
    audio: new Blob(['RIFF-original'], { type: 'audio/wav' }),
  });
  const audio = await history.readAudio(scope);
  expect(audio.name).toBe('voice.wav');
  expect(audio.type).toBe('audio/wav');
  expect(await audio.text()).toBe('RIFF-original');
});

it('strictly validates aggregate metadata without accepting duplicate sequence or path debt', async () => {
  const { parseVoiceHistoryCatalog } = await import('./catalog');
  const fixture = createHistoryFixture();
  const history = fixture.create();
  await history.initialize();
  await publish(history);
  const catalog = fixture.peek()!;
  expect(parseVoiceHistoryCatalog(catalog)).toEqual(catalog);
  expect(
    parseVoiceHistoryCatalog({ ...catalog, entries: [...catalog.entries, catalog.entries[0]] })
  ).toBeNull();
  expect(parseVoiceHistoryCatalog({ ...catalog, pendingDeletes: ['../outside'] })).toBeNull();
  expect(parseVoiceHistoryCatalog({ ...catalog, epoch: 'recreated' })).toBeNull();
  expect(parseVoiceHistoryCatalog({ ...catalog, unexpected: 'secret' })).toBeNull();
});
