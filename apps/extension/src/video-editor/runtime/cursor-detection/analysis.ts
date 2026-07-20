import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import type { VideoObjectTrack } from '../../../features/video/project/object-tracks';
import {
  VideoProjectClipType,
  type VideoProject,
} from '../../../features/video/project/types/index';
import type { VideoProjectVideoClip } from '../../../features/video/project/types/index';
import { loadVideoEditorAssetUrl, revokeVideoEditorAssetUrl } from '../session/asset-urls';
import { runCursorDetectionJob } from './job';
import type { CursorDetectionJobState } from './state';

export interface VideoEditorCursorDetectionController {
  cancel: () => void;
  runForClip: (clipId: string, range?: { end: number; start: number }) => Promise<void>;
  runForSelectedClip: () => Promise<void>;
  runLocalRecalculation: (trackId: string) => Promise<void>;
  selectedClipAvailability: {
    canRun: boolean;
    reason: 'missing-url' | 'not-video' | null;
  };
  state: CursorDetectionJobState;
}

const IDLE_STATE: CursorDetectionJobState = {
  clipId: null,
  error: null,
  processedFrames: 0,
  progress: 0,
  status: 'idle',
  totalFrames: 0,
  trackId: null,
};

export function useCursorDetectionAnalysis(params: {
  assetUrls: Record<string, string>;
  currentTime: number;
  onSelectObjectTrack: (trackId: string) => void;
  onUpsertObjectTrack: (track: VideoObjectTrack) => void;
  project: VideoProject | null;
  selectedClipId: string | null;
}): VideoEditorCursorDetectionController {
  const abortRef = useRef<AbortController | null>(null);
  const [state, setState] = useState<CursorDetectionJobState>(IDLE_STATE);
  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);
  const runForClip = useCursorDetectionRunner({ abortRef, params, setState });
  const runForSelectedClip = useCallback(async () => {
    if (params.selectedClipId) {
      await runForClip(params.selectedClipId);
    }
  }, [params.selectedClipId, runForClip]);

  const runLocalRecalculation = useCallback(
    async (trackId: string) => {
      const track = params.project?.objectTracks?.find((candidate) => candidate.id === trackId);
      const sourceClipId = track?.analysis?.sourceClipId;
      if (!sourceClipId) {
        return;
      }
      await runForClip(sourceClipId, {
        end: params.currentTime + 1.5,
        start: params.currentTime - 1.5,
      });
    },
    [params.currentTime, params.project?.objectTracks, runForClip]
  );

  return {
    cancel,
    runForClip,
    runForSelectedClip,
    runLocalRecalculation,
    selectedClipAvailability: resolveSelectedClipAvailability(params),
    state,
  };
}

function useCursorDetectionRunner(args: {
  abortRef: RefObject<AbortController | null>;
  params: Parameters<typeof useCursorDetectionAnalysis>[0];
  setState: Dispatch<SetStateAction<CursorDetectionJobState>>;
}) {
  return useCallback(
    async (clipId: string, range?: { end: number; start: number }) => {
      const project = args.params.project;
      if (!project) {
        return;
      }

      const abortController = createNextAbortController(args.abortRef);
      let disposableAssetUrl: string | null = null;
      try {
        const assetUrlResolution = await resolveCursorDetectionAssetUrls({
          assetUrls: args.params.assetUrls,
          clipId,
          project,
        });
        disposableAssetUrl = assetUrlResolution.disposableUrl;
        const track = await runCursorDetectionJob({
          assetUrls: assetUrlResolution.assetUrls,
          clipId,
          onProgress: args.setState,
          project,
          signal: abortController.signal,
          ...(range ? { range } : {}),
        });
        completeDetectionRun(track, args.params, args.setState);
      } catch (error) {
        failDetectionRun(error, abortController, args.setState);
      } finally {
        if (disposableAssetUrl) {
          revokeVideoEditorAssetUrl(disposableAssetUrl);
        }
        clearAbortController(args.abortRef, abortController);
      }
    },
    [args]
  );
}

async function resolveCursorDetectionAssetUrls(params: {
  assetUrls: Record<string, string>;
  clipId: string;
  project: VideoProject;
}): Promise<{ assetUrls: Record<string, string>; disposableUrl: string | null }> {
  const clip = findCursorDetectionVideoClip(params.project, params.clipId);
  if (!clip || params.assetUrls[clip.assetId]) {
    return { assetUrls: params.assetUrls, disposableUrl: null };
  }

  const asset = params.project.assets.find((candidate) => candidate.id === clip.assetId);
  if (!asset) {
    return { assetUrls: params.assetUrls, disposableUrl: null };
  }

  const loadedPair = await loadVideoEditorAssetUrl(asset);
  if (!loadedPair) {
    return { assetUrls: params.assetUrls, disposableUrl: null };
  }

  return {
    assetUrls: { ...params.assetUrls, [loadedPair[0]]: loadedPair[1] },
    disposableUrl: loadedPair[1],
  };
}

function findCursorDetectionVideoClip(
  project: VideoProject,
  clipId: string
): VideoProjectVideoClip | null {
  return (
    project.clips.find(
      (candidate): candidate is VideoProjectVideoClip =>
        candidate.id === clipId && candidate.type === VideoProjectClipType.VIDEO
    ) ?? null
  );
}

function createNextAbortController(ref: RefObject<AbortController | null>) {
  ref.current?.abort();
  const abortController = new AbortController();
  ref.current = abortController;
  return abortController;
}

function completeDetectionRun(
  track: VideoObjectTrack,
  params: Parameters<typeof useCursorDetectionAnalysis>[0],
  setState: Dispatch<SetStateAction<CursorDetectionJobState>>
) {
  params.onUpsertObjectTrack(track);
  if (!track.hidden) {
    params.onSelectObjectTrack(track.id);
  }
  setState((current) => ({
    ...current,
    error: null,
    progress: 1,
    status: 'succeeded',
    trackId: track.id,
  }));
}

function failDetectionRun(
  error: unknown,
  abortController: AbortController,
  setState: Dispatch<SetStateAction<CursorDetectionJobState>>
) {
  if (abortController.signal.aborted) {
    setState((current) => ({ ...current, status: 'cancelled' }));
    return;
  }
  setState((current) => ({
    ...current,
    error: error instanceof Error ? error.message : String(error),
    status: 'failed',
  }));
}

function clearAbortController(
  ref: RefObject<AbortController | null>,
  abortController: AbortController
) {
  if (ref.current === abortController) {
    ref.current = null;
  }
}

function resolveSelectedClipAvailability(params: {
  assetUrls: Record<string, string>;
  project: VideoProject | null;
  selectedClipId: string | null;
}): VideoEditorCursorDetectionController['selectedClipAvailability'] {
  const clip = params.project?.clips.find((candidate) => candidate.id === params.selectedClipId);
  if (!clip || clip.type !== VideoProjectClipType.VIDEO) {
    return { canRun: false, reason: 'not-video' };
  }
  const assetAvailable =
    Boolean(params.assetUrls[clip.assetId]) ||
    Boolean(params.project?.assets.some((asset) => asset.id === clip.assetId));
  return assetAvailable ? { canRun: true, reason: null } : { canRun: false, reason: 'missing-url' };
}
