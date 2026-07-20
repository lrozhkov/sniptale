import type { Mp4BoxSample } from '@webav/mp4box.js';

import type { Mp4CleanSourceRenderSpan } from './types';

export function collectSpanSamples(
  samples: Mp4BoxSample[],
  span: Mp4CleanSourceRenderSpan
): Mp4BoxSample[] {
  const spanSamples: Mp4BoxSample[] = [];
  for (const sample of samples) {
    const sampleStart = sample.cts / sample.timescale;
    const sampleEnd = sampleStart + sample.duration / sample.timescale;
    if (sampleEnd > span.sourceStart && sampleStart < span.sourceEnd) {
      spanSamples.push(sample);
    }
  }
  return spanSamples;
}
