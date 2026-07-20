import { resolveProjectExportRange } from '../../../../features/video/project/export/range';
import { createVideoCompositionTimelineIndex } from '../../../../features/video/composition/timeline/frame/index';
import {
  VideoExportFormat,
  type VideoProjectExportSettings,
} from '../../../../features/video/project/types/export';
import { type VideoProject } from '../../../../features/video/project/types/model';
import { collectTimelineBoundaries } from './boundaries';
import { createAcceleratedCompositeSpan } from './accelerated';
import { createCleanSourceSpan, nearlyEqual } from './eligibility';
import type { Mp4VideoRenderSpan } from './types';

function mergeAdjacentSpans(spans: Mp4VideoRenderSpan[]): Mp4VideoRenderSpan[] {
  const merged: Mp4VideoRenderSpan[] = [];
  for (const span of spans) {
    const previous = merged.at(-1);
    if (
      !previous ||
      previous.kind !== span.kind ||
      !nearlyEqual(previous.end, span.start, 0.000_001)
    ) {
      merged.push(span);
      continue;
    }

    if (previous.kind === 'composite' && span.kind === 'composite') {
      previous.end = span.end;
      previous.reason = previous.reason === span.reason ? previous.reason : 'mixed';
      continue;
    }

    if (previous.kind === 'accelerated-composite' && span.kind === 'accelerated-composite') {
      previous.end = span.end;
      continue;
    }

    if (
      previous.kind === 'clean-source' &&
      span.kind === 'clean-source' &&
      previous.clip.id === span.clip.id &&
      previous.asset.id === span.asset.id &&
      nearlyEqual(previous.sourceEnd, span.sourceStart, 0.000_001)
    ) {
      previous.end = span.end;
      previous.sourceEnd = span.sourceEnd;
      continue;
    }

    merged.push(span);
  }

  return merged;
}

export function canUseHybridMp4VideoPipeline(settings: VideoProjectExportSettings): boolean {
  return settings.format === VideoExportFormat.MP4;
}

export function planMp4VideoRenderSpans(
  project: VideoProject,
  settings: VideoProjectExportSettings
): Mp4VideoRenderSpan[] {
  if (!canUseHybridMp4VideoPipeline(settings)) {
    const range = resolveProjectExportRange(project, settings);
    return [{ kind: 'composite', reason: 'non-mp4-asset', start: range.start, end: range.end }];
  }

  const boundaries = collectTimelineBoundaries(project, settings);
  const timelineIndex = createVideoCompositionTimelineIndex(project);
  const spans: Mp4VideoRenderSpan[] = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index]!;
    const end = boundaries[index + 1]!;
    if (end - start <= 0) {
      continue;
    }

    const cleanSourceSpan = createCleanSourceSpan(project, settings, start, end, timelineIndex);
    if (cleanSourceSpan.kind === 'clean-source') {
      spans.push(cleanSourceSpan);
      continue;
    }

    spans.push(createAcceleratedCompositeSpan(project, settings, start, end) ?? cleanSourceSpan);
  }

  return mergeAdjacentSpans(spans);
}
