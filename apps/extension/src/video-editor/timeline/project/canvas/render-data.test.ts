import { describe, expect, it } from 'vitest';
import { buildAudioClipWaveformPath, buildProjectTimelineRulerMarkers } from './render-data';

describe('project timeline render data', () => {
  it('builds stable ruler marker ids from the visible timeline width', () => {
    expect(buildProjectTimelineRulerMarkers(180, 120)).toEqual([
      { id: 'marker-0.00', isMajor: true, label: '0:00', second: 0, spanSeconds: 1 },
      { id: 'marker-1.00', isMajor: true, label: '0:01', second: 1, spanSeconds: 1 },
      { id: 'marker-2.00', isMajor: true, label: '0:02', second: 2, spanSeconds: 1 },
      { id: 'marker-3.00', isMajor: true, label: '0:03', second: 3, spanSeconds: 1 },
    ]);
  });

  it('switches to larger ruler steps as the visible timeline range expands', () => {
    expect(buildProjectTimelineRulerMarkers(600, 30)).toEqual([
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
