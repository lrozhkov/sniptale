import { getRecordingTelemetry } from '../../../composition/persistence/recordings/telemetry';
import type { VideoProject } from '../../../features/video/project/types';
import type { VideoEditorProjectActions } from '../../contracts/commands/project';
import type {
  VideoEditorMaterialPlacementResult,
  VideoEditorMaterialSourceRange,
} from '../../contracts/insertion';

/** Reads captured history before one synchronous placement; cancelled or stale reads never commit. */
export async function placeMaterialWithTelemetry(args: {
  assetId: string;
  range?: VideoEditorMaterialSourceRange | undefined;
  signal?: AbortSignal | undefined;
  getProject: () => VideoProject | null;
  getCurrentTime: () => number;
  place: VideoEditorProjectActions['appendMaterial'];
}): Promise<VideoEditorMaterialPlacementResult> {
  const project = args.getProject();
  const time = args.getCurrentTime();
  const asset = project?.assets.find((item) => item.id === args.assetId);
  if (!project || !asset || args.signal?.aborted)
    return { status: 'rejected', reason: 'missing-material' };
  const recordingId =
    asset.source.kind === 'recording'
      ? asset.source.recordingId
      : asset.source.kind === 'project-asset'
        ? asset.source.originRecordingId
        : null;
  const telemetry = recordingId ? await getRecordingTelemetry(recordingId) : undefined;
  const current = args.getProject();
  if (
    args.signal?.aborted ||
    !current ||
    current.id !== project.id ||
    current.assets !== project.assets ||
    current.clips !== project.clips ||
    args.getCurrentTime() !== time
  )
    return { status: 'rejected', reason: 'missing-material' };
  if (telemetry && telemetry.recordingId !== recordingId)
    return { status: 'rejected', reason: 'missing-material' };
  return args.place(args.assetId, args.range, telemetry);
}
