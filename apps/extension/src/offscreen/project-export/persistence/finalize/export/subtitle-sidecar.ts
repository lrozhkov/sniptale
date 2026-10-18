import { resolveProjectExportRange } from '../../../../../features/video/project/export/range';
import { exportVideoProjectSubtitles } from '../../../../../features/video/project/text/subtitle-export';
import { type VideoProjectExportSettings } from '../../../../../features/video/project/types/export';
import { type VideoProject } from '../../../../../features/video/project/types/model';

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
  const range = resolveProjectExportRange(project, settings);
  const basename = videoFilename.replace(/\.[^.]+$/u, '');
  return formats.flatMap((format) => {
    const result = exportVideoProjectSubtitles(project, { format, range, onlyShown: true });
    if (!result.ok) throw new Error(`Subtitle sidecar export failed: ${result.reason}`);
    if (result.count === 0) return [];
    return [
      {
        blob: new Blob([result.text], {
          type: format === 'vtt' ? 'text/vtt;charset=utf-8' : 'application/x-subrip;charset=utf-8',
        }),
        filename: `${basename}.${format}`,
      },
    ];
  });
}
