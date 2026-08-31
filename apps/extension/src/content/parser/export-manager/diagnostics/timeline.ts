import type { ArchiveAsset } from '../archive';
import type { ExportManagerState } from '../service/state';

export function buildCaptureTimelineAsset(state: ExportManagerState): ArchiveAsset {
  return {
    path: 'logs/capture-timeline.json',
    content: JSON.stringify(
      {
        scope: 'Export Manager stages observable before Page Package assembly.',
        totalElapsedMs: Math.max(0, Date.now() - state.diagnosticTimelineStartedAt),
        events: state.diagnosticTimeline,
        packageAssembly: 'The package exists only if manifest validation and assembly completed.',
      },
      null,
      2
    ),
  };
}
