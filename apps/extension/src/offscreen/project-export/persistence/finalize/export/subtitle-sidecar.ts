import { resolveProjectExportRange } from '../../../../../features/video/project/export/range';
import { isSubtitleClip } from '../../../../../features/video/project/timeline/presentation';
import {
  type VideoProjectExportSettings,
  type VideoSubtitleSidecarFormat,
} from '../../../../../features/video/project/types/export';
import { type VideoProject } from '../../../../../features/video/project/types/model';

interface SubtitleCue {
  end: number;
  start: number;
  text: string;
}

interface SubtitleSidecarFile {
  blob: Blob;
  filename: string;
}

export function buildSubtitleSidecarFiles(
  project: VideoProject,
  settings: VideoProjectExportSettings,
  videoFilename: string
): SubtitleSidecarFile[] {
  const formats = Array.from(new Set(settings.subtitleSidecarFormats ?? []));
  if (formats.length === 0) {
    return [];
  }

  const cues = buildSubtitleCues(project, settings);
  if (cues.length === 0) {
    return [];
  }

  const basename = videoFilename.replace(/\.[^.]+$/u, '');
  return formats.map((format) => ({
    blob: new Blob([formatSubtitleSidecar(cues, format)], {
      type: format === 'vtt' ? 'text/vtt;charset=utf-8' : 'application/x-subrip;charset=utf-8',
    }),
    filename: `${basename}.${format}`,
  }));
}

function buildSubtitleCues(
  project: VideoProject,
  settings: VideoProjectExportSettings
): SubtitleCue[] {
  const range = resolveProjectExportRange(project, settings);
  const visibleSubtitleTrackIds = new Set(
    project.tracks
      .filter((track) => track.kind === 'SUBTITLE' && track.visible)
      .map((track) => track.id)
  );

  return project.clips
    .filter(isSubtitleClip)
    .filter((clip) => visibleSubtitleTrackIds.has(clip.trackId))
    .flatMap((clip) => {
      const cueStart = Math.max(clip.startTime, range.start);
      const cueEnd = Math.min(clip.startTime + clip.duration, range.end);
      const text = clip.text.trim();
      if (cueEnd <= cueStart || text.length === 0) {
        return [];
      }

      return [
        {
          end: cueEnd - range.start,
          start: cueStart - range.start,
          text,
        },
      ];
    })
    .sort((left, right) => left.start - right.start || left.end - right.end);
}

function formatSubtitleSidecar(cues: SubtitleCue[], format: VideoSubtitleSidecarFormat): string {
  if (format === 'vtt') {
    return ['WEBVTT', '', ...cues.map(formatVttCue)].join('\n');
  }

  return cues.map((cue, index) => formatSrtCue(cue, index + 1)).join('\n\n');
}

function formatSrtCue(cue: SubtitleCue, index: number): string {
  return [
    String(index),
    `${formatCueTime(cue.start, ',')} --> ${formatCueTime(cue.end, ',')}`,
    cue.text,
  ].join('\n');
}

function formatVttCue(cue: SubtitleCue): string {
  return `${formatCueTime(cue.start, '.')} --> ${formatCueTime(cue.end, '.')}\n${cue.text}\n`;
}

function formatCueTime(seconds: number, millisecondsSeparator: ',' | '.'): string {
  const totalMilliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const remainingSeconds = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;

  return (
    [
      String(hours).padStart(2, '0'),
      String(minutes).padStart(2, '0'),
      String(remainingSeconds).padStart(2, '0'),
    ].join(':') + `${millisecondsSeparator}${String(milliseconds).padStart(3, '0')}`
  );
}
