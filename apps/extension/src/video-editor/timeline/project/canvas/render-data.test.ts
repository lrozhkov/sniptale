import { describe, expect, it } from 'vitest';
import { buildAudioClipWaveformPath, buildProjectTimelineRulerMarkers } from './render-data';

describe('project timeline render data', () => {
  it('builds stable ruler marker ids from the visible timeline width', () => {
    expect(buildProjectTimelineRulerMarkers(180, 120, { startTime: 0, endTime: 1.5 })).toEqual([
      { id: 'marker-0.00', isMajor: true, label: '0:00', second: 0, spanSeconds: 1 },
      { id: 'marker-1.00', isMajor: true, label: '0:01', second: 1, spanSeconds: 1 },
      { id: 'marker-2.00', isMajor: true, label: '0:02', second: 2, spanSeconds: 1 },
      { id: 'marker-3.00', isMajor: true, label: '0:03', second: 3, spanSeconds: 1 },
    ]);
  });

  it('switches to larger ruler steps as the visible timeline range expands', () => {
    expect(buildProjectTimelineRulerMarkers(600, 30, { startTime: 0, endTime: 20 })).toEqual([
      { id: 'marker-0.00', isMajor: true, label: '0:00', second: 0, spanSeconds: 5 },
      { id: 'marker-5.00', isMajor: true, label: '0:05', second: 5, spanSeconds: 5 },
      { id: 'marker-10.00', isMajor: true, label: '0:10', second: 10, spanSeconds: 5 },
      { id: 'marker-15.00', isMajor: true, label: '0:15', second: 15, spanSeconds: 5 },
      { id: 'marker-20.00', isMajor: true, label: '0:20', second: 20, spanSeconds: 5 },
      { id: 'marker-25.00', isMajor: true, label: '0:25', second: 25, spanSeconds: 5 },
    ]);
  });

  it('builds a deterministic normalized sharp waveform path', () => {
    expect(buildAudioClipWaveformPath([0.2, 0.75])).toBe(
      'M 0.4 41.6 L 49.6 41.6 L 49.6 58.4 L 0.4 58.4 Z ' +
        'M 50.4 18.5 L 99.6 18.5 L 99.6 81.5 L 50.4 81.5 Z'
    );
  });

  it('clamps waveform samples into the normalized path bounds', () => {
    expect(buildAudioClipWaveformPath([-1, 2])).toBe(
      'M 0.4 46 L 49.6 46 L 49.6 54 L 0.4 54 Z ' + 'M 50.4 8 L 99.6 8 L 99.6 92 L 50.4 92 Z'
    );
  });

  it('returns an empty waveform path for empty samples', () => {
    expect(buildAudioClipWaveformPath([])).toBe('');
  });
});

it('bounds markers to the viewport of a 24-hour timeline without losing absolute time', () => {
  const markers = buildProjectTimelineRulerMarkers(86400 * 280, 280, {
    startTime: 43200,
    endTime: 43204,
  });
  expect(markers.length).toBeLessThan(20);
  expect(markers[0]?.second).toBeLessThanOrEqual(43200);
  expect(markers.at(-1)?.second).toBeGreaterThanOrEqual(43204);
  expect(markers.find((m) => m.second === 43200)?.label).toBe('12:00:00.000');
});

it('retains bounded coverage at the last viewport and after returning to the start', () => {
  const end = buildProjectTimelineRulerMarkers(86400 * 280, 280, {
    startTime: 86396,
    endTime: 86400,
  });
  expect(end.length).toBeLessThan(20);
  expect(end.some((marker) => marker.second === 86400)).toBe(true);
  const start = buildProjectTimelineRulerMarkers(86400 * 280, 280, { startTime: 0, endTime: 4 });
  expect(start.length).toBeLessThan(20);
  expect(start[0]?.second).toBe(0);
});

it('keeps readable bounded ruler steps for a 24-hour overview', () => {
  const scale = 1000 / 86400;
  const markers = buildProjectTimelineRulerMarkers(1000, scale, { startTime: 0, endTime: 86400 });
  expect(markers.length).toBeLessThan(16);
  expect(markers.every((marker) => marker.spanSeconds * scale >= 88)).toBe(true);
  expect(markers.at(-1)!.second).toBeGreaterThanOrEqual(86400);
});

it.each([29.97, 30, 60, 240])(
  'aligns detail ticks to %s fps without losing elapsed time',
  (fps) => {
    const markers = buildProjectTimelineRulerMarkers(
      86400 * 280,
      280,
      {
        startTime: 43200,
        endTime: 43204,
      },
      fps
    );
    expect(markers.some((marker) => marker.spanSeconds < 1)).toBe(true);
    expect(markers.every((marker) => marker.spanSeconds * 280 >= 88)).toBe(true);
    expect(markers.length).toBeLessThan(20);
    expect(new Set(markers.map((marker) => marker.id)).size).toBe(markers.length);
    for (const marker of markers) {
      expect(marker.second * fps).toBeCloseTo(Math.round(marker.second * fps), 5);
      expect(marker.label).toMatch(/^\d+:\d{2}:\d{2}\.\d{3}$/);
    }
  }
);

it('uses hours in long overview labels', () => {
  const markers = buildProjectTimelineRulerMarkers(1000, 1000 / 86400, {
    startTime: 0,
    endTime: 86400,
  });
  expect(markers.find((marker) => marker.second === 43200)?.label).toBe('12:00:00');
});

it.each([24000 / 1001, 30000 / 1001, 60000 / 1001, 240])(
  'keeps distinct frame-aligned labels at maximum scale for %s fps',
  (fps) => {
    const scale = 23040;
    const startTime = 43200;
    const endTime = startTime + 1920 / scale;
    const markers = buildProjectTimelineRulerMarkers(
      86400 * scale,
      scale,
      { startTime, endTime },
      fps
    );
    expect(markers.length).toBeLessThan(26);
    expect(new Set(markers.map((marker) => marker.id)).size).toBe(markers.length);
    expect(new Set(markers.map((marker) => marker.label)).size).toBe(markers.length);
    expect(markers[0]!.second).toBeLessThanOrEqual(startTime);
    expect(markers.at(-1)!.second).toBeGreaterThanOrEqual(endTime);
    for (const marker of markers) {
      expect(marker.second * fps).toBeCloseTo(Math.round(marker.second * fps), 5);
      expect(marker.spanSeconds * scale).toBeGreaterThanOrEqual(88);
    }
  }
);
