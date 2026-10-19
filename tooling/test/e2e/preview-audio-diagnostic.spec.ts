import { expect, test } from '@playwright/test';

import { startHostServer } from './support/host-server';

type PreviewAudioDiagnosticScenario = {
  counts: Record<string, number>;
  events: Array<{
    currentTime: number;
    graphState: string;
    paused: boolean;
    readyState: number;
    type: string;
  }>;
  label: string;
};

type PreviewAudioDiagnosticResult = {
  scenarios: PreviewAudioDiagnosticScenario[];
};

function readDiagnosticResult() {
  const diagnosticWindow = window as typeof window & {
    __sniptalePreviewAudioDiagnostic?: {
      getLastResult: () => PreviewAudioDiagnosticResult | null;
    };
  };
  return diagnosticWindow.__sniptalePreviewAudioDiagnostic?.getLastResult() ?? null;
}

function assertStableScenario(scenario: PreviewAudioDiagnosticScenario): void {
  const counts = scenario.counts;
  expect(counts.play ?? 0, `${scenario.label} should only start once`).toBeLessThanOrEqual(1);
  expect(counts.pause ?? 0, `${scenario.label} should not pause during steady playback`).toBe(0);
  expect(counts.seeking ?? 0, `${scenario.label} should not seek during steady playback`).toBe(0);
  expect(counts.seeked ?? 0, `${scenario.label} should not seek during steady playback`).toBe(0);
  expect(counts.stalled ?? 0, `${scenario.label} should not stall during steady playback`).toBe(0);
  expect(scenario.events.some((event) => event.graphState === 'running')).toBe(true);
  expect(scenario.events.some((event) => event.currentTime > 0)).toBe(true);
}

test('preview audio graph does not churn media drivers during browser playback', async ({
  page,
}) => {
  const { origin, server } = await startHostServer();

  try {
    await page.goto(`${origin}/tooling/test/harness/preview-audio-diagnostic.html`, {
      waitUntil: 'domcontentloaded',
    });
    await page.getByRole('button', { name: 'Run preview audio diagnostic' }).click();

    await expect
      .poll(async () => {
        const result = await page.evaluate(readDiagnosticResult);
        return result !== null;
      })
      .toBe(true);

    const result = await page.evaluate(readDiagnosticResult);
    if (!result) {
      throw new Error('Preview audio diagnostic did not return a result');
    }

    expect(result.scenarios.map((scenario) => scenario.label)).toEqual([
      'audio-only',
      'video-with-audio',
    ]);

    result.scenarios.forEach(assertStableScenario);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});

test('original audio attenuation agrees with preview and selected-range native PCM', async ({
  page,
}) => {
  const { origin, server } = await startHostServer();
  try {
    await page.goto(`${origin}/tooling/test/harness/preview-audio-diagnostic.html`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForFunction(
      () => typeof window.__sniptalePreviewAudioDiagnostic?.runOriginalAudio === 'function'
    );
    const result: unknown = await page.evaluate(async () => {
      const diagnostic = window.__sniptalePreviewAudioDiagnostic;
      if (!diagnostic) throw new Error('Diagnostic unavailable');
      return diagnostic.runOriginalAudio();
    });
    const isRecord = (value: unknown): value is Record<string, unknown> =>
      typeof value === 'object' && value !== null && !Array.isArray(value);
    if (!isRecord(result) || !Array.isArray(result.full) || !Array.isArray(result.partial))
      throw new Error('Invalid audio diagnostic result');
    expect(result.unchanged).toBe(true);
    expect(result.full).toHaveLength(6);
    expect(result.partial).toHaveLength(5);
    for (const row of [...result.full, ...result.partial]) {
      const sample: unknown = row;
      if (
        !isRecord(sample) ||
        typeof sample.rmsError !== 'number' ||
        typeof sample.actual !== 'number' ||
        typeof sample.expected !== 'number'
      )
        throw new Error('Invalid PCM sample');
      expect(sample.rmsError, `PCM at ${sample.time}`).toBeLessThan(1e-4);
      expect(Math.abs(sample.actual - sample.expected)).toBeLessThan(1e-4);
    }
    const silent: unknown = result.full.find((row: unknown) => isRecord(row) && row.time === 4.25);
    if (!isRecord(silent)) throw new Error('Missing full attenuation sample');
    expect(silent.previewGain).toBe(0);
    expect(silent.actual).toBeCloseTo(0.02, 4);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});
