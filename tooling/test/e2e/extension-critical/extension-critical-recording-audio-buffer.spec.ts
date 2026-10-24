import { expect, test } from '@playwright/test';
import { build } from 'esbuild';
import http from 'node:http';
import { resolve } from 'node:path';
import type * as AudioProbe from '../support/recording-audio-buffer-probe';

for (const {
  packetFrames,
  channels,
  overload,
  nativeEncoder = false,
  packets = nativeEncoder ? 128 : 130,
} of [
  { packetFrames: 128, channels: 1, overload: false },
  { packetFrames: 480, channels: 1, overload: true },
  { packetFrames: 256, channels: 32, overload: true },
  { packetFrames: 480, channels: 1, overload: false, nativeEncoder: true },
  { packetFrames: 480, channels: 1, overload: false, packets: 129 },
])
  test(`native audio burst preserves bounded PCM frames=${packetFrames} channels=${channels} encoder=${nativeEncoder} packets=${packets}`, async ({
    page,
  }) => {
    const bundled = await build({
      entryPoints: [resolve('tooling/test/e2e/support/recording-audio-buffer-probe.ts')],
      bundle: true,
      format: 'iife',
      globalName: 'recordingAudioProbe',
      write: false,
      platform: 'browser',
    });
    const server = http.createServer((_request, response) => {
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><title>Native audio admission burst</title>');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string')
        throw new Error('Audio burst server has no port');
      await page.goto(`http://127.0.0.1:${address.port}/`);
      await page.addScriptTag({ content: bundled.outputFiles[0]!.text });
      const result = await page.evaluate(
        async ({ frames, channels, nativeEncoder, packets }) => {
          const host = window as typeof window & { recordingAudioProbe: typeof AudioProbe };
          return host.recordingAudioProbe.recordNativeAudioBurst(
            frames,
            channels,
            nativeEncoder ? 'native-opus' : 'held-pcm',
            packets
          );
        },
        { frames: packetFrames, channels, nativeEncoder, packets }
      );
      expect(result.error).toBe(
        overload ? 'Live audio buffer exceeded its bounded capacity.' : null
      );
      expect(result.borrowedTrackState).toBe('live');
      if (nativeEncoder) {
        expect(Math.abs(result.frames - packets * packetFrames)).toBeLessThanOrEqual(960);
        expect(result.rms).toBeGreaterThan(0.03);
      } else if (!overload) {
        expect(result.frames).toBe(packets * packetFrames);
        expect(result.changed).toBe(0);
      }
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });

for (const capture of ['live', 'microphone-track'] as const)
  for (const load of [false, true])
    for (const pause of capture === 'live' && load ? [false, true] : [false]) {
      test(`recording ${capture} keeps a continuous signal with document load=${load} pause=${pause}`, async ({
        page,
      }) => {
        const bundled = await build({
          entryPoints: [resolve('tooling/test/e2e/support/recording-audio-buffer-probe.ts')],
          bundle: true,
          format: 'iife',
          globalName: 'recordingAudioProbe',
          write: false,
          platform: 'browser',
        });
        const server = http.createServer((request, response) => {
          response.setHeader(
            'Content-Type',
            request.url === '/probe.js' ? 'text/javascript' : 'text/html'
          );
          response.end(
            request.url === '/probe.js'
              ? bundled.outputFiles[0]!.text
              : '<!doctype html><title>Native audio continuity</title><script src="/probe.js"></script>'
          );
        });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        try {
          const address = server.address();
          if (!address || typeof address === 'string')
            throw new Error('Audio probe server has no port');
          await page.goto(`http://127.0.0.1:${address.port}/`);
          const result = await page.evaluate(
            async ({ load, capture, pause }) => {
              const host = window as typeof window & { recordingAudioProbe: typeof AudioProbe };
              return capture === 'live'
                ? host.recordingAudioProbe.recordContinuousAudioUnderLoad(load, pause)
                : host.recordingAudioProbe.recordMicrophoneTrackUnderLoad(load);
            },
            { load, capture, pause }
          );
          expect(result.errors).toEqual([]);
          if ('released' in result) expect(result.released).toBe(true);
          expect(result.sampleRate).toBe(48000);
          expect(result.duration).toBeGreaterThan(3.5);
          expect(result.longestQuietSeconds).toBeLessThan(0.04);
        } finally {
          server.closeAllConnections();
          await new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve()))
          );
        }
      });
    }

for (const blockDuringPause of [false, true])
  test(`pause excludes buffered audio with document stall=${blockDuringPause}`, async ({
    page,
  }) => {
    const bundled = await build({
      entryPoints: [resolve('tooling/test/e2e/support/recording-audio-buffer-probe.ts')],
      bundle: true,
      format: 'iife',
      globalName: 'recordingAudioProbe',
      write: false,
      platform: 'browser',
    });
    const server = http.createServer((request, response) => {
      response.setHeader(
        'Content-Type',
        request.url === '/probe.js' ? 'text/javascript' : 'text/html'
      );
      response.end(
        request.url === '/probe.js'
          ? bundled.outputFiles[0]!.text
          : '<!doctype html><script src="/probe.js"></script>'
      );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string')
        throw new Error('Audio probe server has no port');
      await page.goto(`http://127.0.0.1:${address.port}/`);
      const result = await page.evaluate(async (blockDuringPause) => {
        const host = window as typeof window & { recordingAudioProbe: typeof AudioProbe };
        return host.recordingAudioProbe.recordPausedSignalWithWriterStall(blockDuringPause);
      }, blockDuringPause);
      expect(result.errors).toEqual([]);
      expect(result.counts.paused).toBe(0);
      expect(result.counts.accepted).toBeGreaterThanOrEqual(5);
      expect(result.counts.base).toBeGreaterThanOrEqual(10);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });

for (const overflow of [false, true])
  test(`held audio writer supports bounded failure=${overflow}`, async ({ page }) => {
    const bundled = await build({
      entryPoints: [resolve('tooling/test/e2e/support/recording-audio-buffer-probe.ts')],
      bundle: true,
      format: 'iife',
      globalName: 'recordingAudioProbe',
      write: false,
      platform: 'browser',
    });
    const server = http.createServer((request, response) => {
      response.setHeader(
        'Content-Type',
        request.url === '/probe.js' ? 'text/javascript' : 'text/html'
      );
      response.end(
        request.url === '/probe.js'
          ? bundled.outputFiles[0]!.text
          : '<!doctype html><script src="/probe.js"></script>'
      );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string')
        throw new Error('Audio probe server has no port');
      await page.goto(`http://127.0.0.1:${address.port}/`);
      const result = await page.evaluate(async (overflow) => {
        const host = window as typeof window & { recordingAudioProbe: typeof AudioProbe };
        return host.recordingAudioProbe.stopAudioWithWriterStall(overflow);
      }, overflow);
      expect(result.error).toBe(
        overflow ? 'Live audio buffer exceeded its bounded capacity.' : null
      );
      expect(result.borrowedTrackState).toBe('live');
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });

for (const codec of ['opus', 'aac'] as const)
  for (const genuineGap of [false, true])
    test(`audio timestamp replay preserves PCM codec=${codec} genuineGap=${genuineGap}`, async ({
      page,
    }) => {
      const bundled = await build({
        entryPoints: [resolve('tooling/test/e2e/support/recording-audio-buffer-probe.ts')],
        bundle: true,
        format: 'iife',
        globalName: 'recordingAudioProbe',
        write: false,
        platform: 'browser',
      });
      const server = http.createServer((_request, response) => {
        response.setHeader('Content-Type', 'text/html');
        response.end('<!doctype html><title>Audio timestamp replay</title>');
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      try {
        const address = server.address();
        if (!address || typeof address === 'string')
          throw new Error('Audio replay server has no port');
        await page.goto(`http://127.0.0.1:${address.port}/`);
        await page.addScriptTag({ content: bundled.outputFiles[0]!.text });
        const result = await page.evaluate(
          async ({ codec, genuineGap }) => {
            const host = window as typeof window & { recordingAudioProbe: typeof AudioProbe };
            return host.recordingAudioProbe.recordAudioTimestampJitter(codec, genuineGap);
          },
          { codec, genuineGap }
        );
        if (codec === 'opus') expect(result.supported).toBe(true);
        test.skip(!result.supported, `Native ${codec} encoder is unavailable`);
        if (!result.supported) return;
        expect(result.bytes).toBeGreaterThan(0);
        expect(result.blocks[0]!.timestamp).toBeCloseTo(0.37, 8);
        expect(result.blocks.reduce((sum, block) => sum + block.frames, 0)).toBe(
          288000 + (genuineGap ? 480 : 0)
        );
        expect(result.blocks.reduce((sum, block) => sum + block.zeros, 0)).toBe(
          genuineGap ? 480 : 0
        );
        expect(result.blocks.reduce((sum, block) => sum + block.changed, 0)).toBe(0);
      } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve()))
        );
      }
    });
