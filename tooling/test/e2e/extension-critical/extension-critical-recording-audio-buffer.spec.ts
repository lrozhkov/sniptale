import { expect, test } from '@playwright/test';
import { build } from 'esbuild';
import http from 'node:http';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type * as AudioProbe from '../support/recording-audio-buffer-probe';

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

for (const gain of [1, 1.5])
  test(`live microphone suppresses subbass bursts and preserves voice and system audio at gain=${gain}`, async ({
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
      const result = await page.evaluate(async (gain) => {
        const host = window as typeof window & { recordingAudioProbe: typeof AudioProbe };
        return host.recordingAudioProbe.recordConditionedMicrophone(gain);
      }, gain);
      expect(result.errors).toEqual([]);
      expect(result.duration).toBeGreaterThan(2);
      expect(result.borrowedTracksLive).toBe(true);
      const { encoded, ...metrics } = result;
      const metricsPath = test.info().outputPath('microphone-metrics.json');
      const audioPath = test.info().outputPath('microphone-burst.webm');
      await writeFile(metricsPath, JSON.stringify(metrics));
      await writeFile(audioPath, Buffer.from(encoded));
      await test
        .info()
        .attach('microphone-metrics', { path: metricsPath, contentType: 'application/json' });
      await test.info().attach('microphone-burst', { path: audioPath, contentType: 'audio/webm' });
      expect(result.peak).toBeLessThan(0.3);
      expect(result.low).toBeLessThan(0.065 * gain);
      expect(result.voice).toBeGreaterThan(0.07 * gain);
      expect(result.voice).toBeLessThan(0.09 * gain);
      expect(result.tab).toBeGreaterThan(0.05);
      expect(result.tab).toBeLessThan(0.07);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });

test('microphone filter attenuates a deterministic subbass burst and preserves clean voice', async ({
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
  await page.goto('about:blank');
  await page.addScriptTag({ content: bundled.outputFiles[0]!.text });
  const result = await page.evaluate(async () => {
    const host = window as typeof window & { recordingAudioProbe: typeof AudioProbe };
    return host.recordingAudioProbe.renderMicrophoneConditioning();
  });
  expect(result.peak).toBeLessThan(0.3);
  expect(result.low).toBeLessThan(0.055);
  expect(result.voiceClean).toBeGreaterThan(0.075);
  expect(result.voiceClean).toBeLessThan(0.085);
  expect(result.voiceDuringBurst).toBeGreaterThan(0.075);
  expect(result.voiceDuringBurst).toBeLessThan(0.085);
  expect(result.tab).toBeGreaterThan(0.055);
  expect(result.tab).toBeLessThan(0.065);
});
