import { expect, it } from 'vitest';
import { parseAudioWorkletHostMessage, parseAudioWorkletProcessorMessage } from './worklet';

it('admits only closed worklet commands and an owned processing snapshot', () => {
  const processing = { version: 1, bypassed: false, effects: [] };
  const input = {
    kind: 'initialize',
    generation: 1,
    channels: 2,
    sourceLengthFrames: 48000,
    durationFrames: 24000,
    rate: 2,
    processing,
    assets: {},
  };
  const result = parseAudioWorkletHostMessage(input);
  expect(result).toEqual(input);
  expect(result?.kind === 'initialize' && result.processing).not.toBe(processing);
  for (const patch of [
    { url: 'https://example.com/code.wasm' },
    { channels: 3 },
    { rate: 0 },
    { generation: 0 },
    { durationFrames: Infinity },
    { assets: { 'custom.wasm': new Uint8Array(1) } },
    { processing: { ...processing, script: 'forbidden' } },
  ])
    expect(parseAudioWorkletHostMessage({ ...input, ...patch })).toBeNull();
});
it('bounds finite source PCM without copying transferred arrays', () => {
  const planes = [new Float32Array(48000), new Float32Array(48000)];
  const input = { kind: 'source-reply', generation: 3, requestId: 7, planes };
  const result = parseAudioWorkletHostMessage(input);
  expect(result?.kind === 'source-reply' && result.planes[0]).toBe(planes[0]);
  for (const invalid of [
    [new Float32Array(48001)],
    [new Float32Array(0)],
    [new Float32Array([NaN])],
    [new Float32Array([Infinity])],
    [new Float32Array(2), new Float32Array(3)],
    [new Float32Array(1), new Float32Array(1), new Float32Array(1)],
  ])
    expect(parseAudioWorkletHostMessage({ ...input, planes: invalid })).toBeNull();
  expect(parseAudioWorkletHostMessage({ ...input, requestId: -1 })).toBeNull();
});
it('bounds requests and queued output independently and rejects invalid play clocks', () => {
  const request = {
    kind: 'source-read',
    generation: 2,
    requestId: 1,
    startFrame: 48000,
    endFrame: 96000,
  };
  expect(parseAudioWorkletProcessorMessage(request)).toEqual(request);
  expect(parseAudioWorkletProcessorMessage({ ...request, endFrame: 96001 })).toBeNull();
  expect(parseAudioWorkletProcessorMessage({ ...request, endFrame: 48000 })).toBeNull();
  expect(
    parseAudioWorkletProcessorMessage({
      kind: 'primed',
      generation: 2,
      startFrame: 48000,
      bufferedFrames: 19201,
    })
  ).toBeNull();
  const play = {
    kind: 'play',
    generation: 2,
    whenFrame: 96000,
    startFrame: 48000,
    endFrame: 50000,
  };
  expect(parseAudioWorkletHostMessage(play)).toEqual(play);
  expect(parseAudioWorkletHostMessage({ ...play, endFrame: 48000 })).toBeNull();
  expect(parseAudioWorkletHostMessage({ ...play, whenFrame: 1.5 })).toBeNull();
});
it('bounds fixed local asset bytes and retains no executable URL alternative', () => {
  const input = {
    kind: 'initialize',
    generation: 1,
    channels: 1,
    sourceLengthFrames: 0,
    durationFrames: 0,
    rate: 1,
    processing: { version: 1, bypassed: false, effects: [] },
    assets: { 'audio-effects/rnnoise.wasm': new Uint8Array(4) },
  };
  expect(parseAudioWorkletHostMessage(input)).not.toBeNull();
  expect(
    parseAudioWorkletHostMessage({
      ...input,
      assets: { 'audio-effects/rnnoise.wasm': new Uint8Array(4 * 1024 * 1024 + 1) },
    })
  ).toBeNull();
  expect(
    parseAudioWorkletHostMessage({
      ...input,
      assets: {
        'audio-effects/rnnoise.wasm': new Uint8Array(3 * 1024 * 1024),
        'audio-effects/faust/eq.wasm': new Uint8Array(2 * 1024 * 1024),
      },
    })
  ).toBeNull();
});
