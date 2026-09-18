import type { ReviewExportReceipt } from './export-lifecycle';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import type { RecordingTelemetryEntry } from '../../composition/persistence/recordings/contracts';
import { replayReviewHistory } from '../../features/video/review/document';
import { buildReviewTimeMap, mapReviewAnchor } from '../../features/video/review/timeline';
import { projectReviewTelemetry } from '../../features/video/review/telemetry';
import { projectVideoRegion } from '../../features/video/review/geometry';
import type { ReviewAnchor } from '../../features/video/review/types';
import type { ReviewExportProvenance } from '../../features/video/review/provenance';

interface ReviewReportLabels {
  title: string;
  source: string;
  timeline: string;
  machineData: string;
  comment: string;
  cut: string;
  speed: string;
  telemetry: string;
  excluded: string;
  empty: string;
}

function microseconds(value: number): number {
  const result = Math.round(value * 1_000_000);
  if (!Number.isSafeInteger(result))
    throw new Error('Report timestamp is outside the supported range.');
  return result;
}

function anchorData(anchor: ReviewAnchor) {
  return anchor.kind === 'point'
    ? { kind: anchor.kind, timeUs: microseconds(anchor.time) }
    : { kind: anchor.kind, startUs: microseconds(anchor.start), endUs: microseconds(anchor.end) };
}

function fenced(value: string, language = '') {
  let length = 3;
  for (const match of value.matchAll(/`+/g)) length = Math.max(length, match[0].length + 1);
  const fence = '`'.repeat(length);
  return `${fence}${language}\n${value}\n${fence}`;
}

function telemetryData(telemetry: RecordingTelemetryEntry | null) {
  if (!telemetry) return { availability: 'unavailable' };
  return {
    availability: 'present',
    timeUnit: 'us',
    provenance: telemetry.provenance ?? null,
    captureMode: telemetry.captureMode,
    displaySurface: telemetry.displaySurface ?? null,
    viewport: telemetry.viewport,
    actionEvents: telemetry.actionEvents.map(
      ({ time, duration, animation, sourceAnchor, ...event }) => ({
        ...event,
        timeUs: microseconds(time),
        durationUs: microseconds(duration),
        ...(animation
          ? {
              animation: {
                startUs: microseconds(animation.start),
                endUs: microseconds(animation.end),
                durationUs: microseconds(animation.duration),
              },
            }
          : {}),
        ...(sourceAnchor
          ? {
              sourceAnchor: {
                ...sourceAnchor,
                sourceTime: undefined,
                sourceTimeUs: microseconds(sourceAnchor.sourceTime),
              },
            }
          : {}),
      })
    ),
    signals: telemetry.signals.map(({ startTime, endTime, ...signal }) => ({
      ...signal,
      startUs: microseconds(startTime),
      endUs: microseconds(endTime),
    })),
    cursorTrack: telemetry.cursorTrack
      ? {
          ...telemetry.cursorTrack,
          samples: telemetry.cursorTrack.samples.map(({ time, sourceAnchor, ...sample }) => ({
            ...sample,
            timeUs: microseconds(time),
            ...(sourceAnchor
              ? {
                  sourceAnchor: {
                    ...sourceAnchor,
                    sourceTime: undefined,
                    sourceTimeUs: microseconds(sourceAnchor.sourceTime),
                  },
                }
              : {}),
          })),
        }
      : null,
  };
}

/** One revision, one serializer for copy/download; field recovery and undo versions are never exported. */
export function createVideoReviewReport(args: {
  snapshot: VideoWorkspaceSnapshot;
  filename: string;
  telemetry: RecordingTelemetryEntry | null;
  labels: ReviewReportLabels;
  exportReceipt?: ReviewExportReceipt;
  provenance?: ReviewExportProvenance;
}): string {
  const { workspace } = args.snapshot;
  const document = replayReviewHistory(workspace.history, workspace.cursor, workspace.source);
  const map = buildReviewTimeMap(workspace.source.duration, document.edits);
  const annotations = document.annotations.map((annotation) => {
    const mapped = mapReviewAnchor(annotation.anchor, map);
    return {
      ...annotation,
      anchor: anchorData(annotation.anchor),
      ...(annotation.region
        ? {
            regionPixels: projectVideoRegion(annotation.region, {
              x: 0,
              y: 0,
              width: workspace.source.width,
              height: workspace.source.height,
            }),
          }
        : {}),
      excludedFromResult: mapped.excludedFromResult,
      partiallyExcluded: mapped.partiallyExcluded,
      resultRanges: mapped.ranges.map(({ start, end }) => ({
        startUs: microseconds(start),
        endUs: microseconds(end),
      })),
    };
  });
  const payload = {
    schemaVersion: 'sniptale.video-review.v1',
    timeUnit: 'us',
    revision: workspace.revision,
    editsState: args.exportReceipt?.revision === workspace.revision ? 'exported' : 'intent',
    exported: args.exportReceipt?.revision === workspace.revision,
    ...(args.exportReceipt
      ? {
          export: {
            revision: args.exportReceipt.revision,
            matchesCurrentRevision: args.exportReceipt.revision === workspace.revision,
            mediaId: args.exportReceipt.mediaId,
            filename: args.exportReceipt.filename,
            createdAt: new Date(args.exportReceipt.createdAt).toISOString(),
            resultDurationUs: microseconds(args.exportReceipt.resultDuration),
            videoReencoded: args.exportReceipt.videoReencoded ?? false,
            audioReencoded: args.exportReceipt.audioReencoded ?? false,
            outputAudioCodec: args.exportReceipt.outputAudioCodec ?? null,
            videoPackets: args.exportReceipt.videoPackets,
            audioPackets: args.exportReceipt.audioPackets,
            audioRanges: args.exportReceipt.audioRanges.map((range) => ({
              sourceStartUs: microseconds(range.sourceStart),
              sourceEndUs: microseconds(range.sourceEnd),
              resultStartUs: microseconds(range.resultStart),
              resultEndUs: microseconds(range.resultEnd),
            })),
          },
        }
      : {}),
    ...(args.provenance ? { sourceProvenance: args.provenance } : {}),
    source: {
      mediaId: workspace.aggregateId,
      filename: args.filename,
      durationUs: microseconds(workspace.source.duration),
      width: workspace.source.width,
      height: workspace.source.height,
      mimeType: workspace.source.mimeType,
      size: workspace.source.size,
    },
    annotations,
    edits: document.edits.map(({ start, end, requestedStart, requestedEnd, ...edit }) => ({
      ...edit,
      startUs: microseconds(start),
      endUs: microseconds(end),
      requestedStartUs: microseconds(requestedStart),
      requestedEndUs: microseconds(requestedEnd),
    })),
    timeMap: map.map(({ sourceStart, sourceEnd, resultStart, resultEnd, ...segment }) => ({
      ...segment,
      sourceStartUs: microseconds(sourceStart),
      sourceEndUs: microseconds(sourceEnd),
      resultStartUs: microseconds(resultStart),
      resultEndUs: microseconds(resultEnd),
    })),
    telemetry: telemetryData(args.telemetry),
  };
  const entries = document.annotations.map((annotation, index) => ({
    time: annotation.anchor.kind === 'point' ? annotation.anchor.time : annotation.anchor.start,
    label: args.labels.comment,
    text: `${annotations[index]?.excludedFromResult ? `${args.labels.excluded}\n` : ''}${annotation.text}`,
  }));
  for (const edit of document.edits)
    entries.push({
      time: edit.start,
      label: edit.kind === 'cut' ? args.labels.cut : args.labels.speed,
      text: [
        `${edit.start.toFixed(3)}–${edit.end.toFixed(3)} s`,
        edit.kind === 'speed' ? ` · ${edit.rate}× · ${edit.audio}` : '',
      ].join(''),
    });
  if (args.telemetry)
    for (const marker of projectReviewTelemetry(args.telemetry, workspace.source.duration).markers)
      entries.push({ time: marker.start, label: args.labels.telemetry, text: marker.eventType });
  entries.sort((a, b) => a.time - b.time);
  return [
    `# ${args.labels.title}`,
    `## ${args.labels.source}`,
    fenced(args.filename),
    `## ${args.labels.timeline}`,
    entries.length
      ? entries
          .map(
            (entry) => `### ${entry.time.toFixed(3)} s · ${entry.label}\n\n${fenced(entry.text)}`
          )
          .join('\n\n')
      : args.labels.empty,
    `## ${args.labels.machineData}`,
    fenced(JSON.stringify(payload, null, 2), 'json'),
    '',
  ].join('\n\n');
}
