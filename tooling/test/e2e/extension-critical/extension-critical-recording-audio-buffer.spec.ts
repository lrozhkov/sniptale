import { expect, test } from '@playwright/test';
import { build } from 'esbuild';
import http from 'node:http';
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
