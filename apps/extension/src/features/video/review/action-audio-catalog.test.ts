import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { ACTION_SOUND_CATALOG, isActionSoundSampleId } from './action-audio-catalog';

it('pins immutable v1 and paired v2 WAV bytes, native samples and bounded byte budget', async () => {
  const names: string[] = [];
  let total = 0;
  for (const [id, sample] of Object.entries(ACTION_SOUND_CATALOG)) {
    expect(isActionSoundSampleId(id)).toBe(true);
    const bytes = await readFile(new URL(`../../../../public/${sample.path}`, import.meta.url));
    expect(bytes.length).toBe(sample.size);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(sample.sha256);
    expect(bytes.subarray(0, 4).toString()).toBe('RIFF');
    expect(bytes.subarray(8, 16).toString()).toBe('WAVEfmt ');
    expect(bytes.readUInt16LE(20)).toBe(1);
    expect(bytes.readUInt16LE(22)).toBe(1);
    expect(bytes.readUInt32LE(24)).toBe(sample.sampleRate);
    expect(bytes.readUInt16LE(34)).toBe(16);
    expect(bytes.readUInt32LE(40)).toBe(sample.durationFrames * 2);
    let peak = 0;
    for (let offset = 44; offset < bytes.length; offset += 2)
      peak = Math.max(peak, Math.abs(bytes.readInt16LE(offset)) / 32768);
    // v1 gain variation is <=1.15; 1/maxVoices therefore bounds the action bus peak to .575.
    expect(peak).toBeLessThanOrEqual(0.5);
    expect(sample.mimeType).toBe('audio/wav');
    total += bytes.length;
    if (sample.version === 1) names.push(sample.path.split('/').at(-1)!);
  }
  expect(total).toBe(123974);
  expect(total).toBeLessThanOrEqual(128 * 1024);
  expect(names).toHaveLength(10);
  expect(
    (await readdir(new URL('../../../../public/action-sounds/v1/', import.meta.url))).sort()
  ).toEqual(names.sort());
  for (const value of [
    undefined,
    null,
    '../key-01.wav',
    'https://remote.invalid/key.wav',
    'typing-loop-v1',
    'constructor',
  ])
    expect(isActionSoundSampleId(value)).toBe(false);
});

it('ships distinct down and up attacks instead of a duplicated full legacy click', () => {
  const ids = [
    'mouse-classic-down-v2',
    'mouse-classic-up-v2',
    'mouse-soft-down-v2',
    'mouse-soft-up-v2',
  ] as const;
  expect(new Set(ids.map((id) => ACTION_SOUND_CATALOG[id].sha256)).size).toBe(4);
  for (const id of ids)
    expect(ACTION_SOUND_CATALOG[id].sha256).not.toBe(ACTION_SOUND_CATALOG['mouse-click-v1'].sha256);
});
