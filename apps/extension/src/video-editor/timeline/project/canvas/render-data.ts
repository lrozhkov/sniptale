import { clampTimelineScale } from '../../../contracts/timeline-scale';
import { formatTimelineRulerLabel } from '../interaction-state/helpers';

interface ProjectTimelineRulerMarker {
  id: string;
  isMajor: boolean;
  label: string | null;
  second: number;
  spanSeconds: number;
}

const WAVEFORM_CENTER_Y = 50;
const WAVEFORM_VERTICAL_PADDING = 8;
const WAVEFORM_MIN_AMPLITUDE = 4;
const WAVEFORM_BAR_GAP_PERCENT = 0.8;

export function buildProjectTimelineRulerMarkers(
  timelineWidth: number,
  pixelsPerSecond: number,
  viewport: { startTime: number; endTime: number }
): ProjectTimelineRulerMarker[] {
  const spanSeconds = resolveTimelineRulerSpanSeconds(pixelsPerSecond);
  const overscanSeconds = 120 / clampTimelineScale(pixelsPerSecond);
  const firstIndex = Math.floor(Math.max(0, viewport.startTime - overscanSeconds) / spanSeconds);
  const lastIndex = Math.ceil(
    (Math.min(timelineWidth / clampTimelineScale(pixelsPerSecond), viewport.endTime) +
      overscanSeconds) /
      spanSeconds
  );
  return Array.from({ length: Math.max(0, lastIndex - firstIndex + 1) }, (_, index) => {
    const second = roundTimelineMarkerSecond((firstIndex + index) * spanSeconds);
    const isMajor = Number.isInteger(second);

    return {
      id: `marker-${second.toFixed(2)}`,
      isMajor,
      label: isMajor ? formatTimelineRulerLabel(second) : null,
      second,
      spanSeconds,
    };
  });
}

export function buildAudioClipWaveformPath(peaks: number[]): string {
  if (peaks.length === 0) {
    return '';
  }

  return peaks
    .map((peak, index) => {
      const { left, right } = getWaveformBarXRange(index, peaks.length);
      const amplitude = getWaveformAmplitude(peak);
      const top = roundWaveformPoint(WAVEFORM_CENTER_Y - amplitude);
      const bottom = roundWaveformPoint(WAVEFORM_CENTER_Y + amplitude);
      return `M ${left} ${top} L ${right} ${top} L ${right} ${bottom} L ${left} ${bottom} Z`;
    })
    .join(' ');
}

function getWaveformBarXRange(index: number, peaksLength: number): { left: number; right: number } {
  const bucketWidth = 100 / peaksLength;
  const gap = Math.min(WAVEFORM_BAR_GAP_PERCENT, bucketWidth * 0.3);
  return {
    left: roundWaveformPoint(index * bucketWidth + gap / 2),
    right: roundWaveformPoint((index + 1) * bucketWidth - gap / 2),
  };
}

function getWaveformAmplitude(peak: number): number {
  const clampedPeak = Math.max(0, Math.min(1, Number.isFinite(peak) ? peak : 0));
  const maxAmplitude = WAVEFORM_CENTER_Y - WAVEFORM_VERTICAL_PADDING;
  if (clampedPeak === 0) {
    return WAVEFORM_MIN_AMPLITUDE;
  }

  return Math.max(WAVEFORM_MIN_AMPLITUDE, roundWaveformPoint(clampedPeak * maxAmplitude));
}

function roundWaveformPoint(value: number): number {
  return Math.round(value * 100) / 100;
}

function resolveTimelineRulerSpanSeconds(pixelsPerSecond: number): number {
  const candidateSteps = [1, 5, 10, 20, 30, 60, 120, 300, 600, 1800, 3600, 7200, 14400, 28800];
  const minimumStepWidth = 88;

  for (const step of candidateSteps) {
    if (step * pixelsPerSecond >= minimumStepWidth) {
      return step;
    }
  }

  return candidateSteps.at(-1) ?? 60;
}

function roundTimelineMarkerSecond(value: number): number {
  return Math.round(value * 1000) / 1000;
}
