import type { LoadedImagesMap } from '../../renderer';
import { type VideoProjectExportSettings } from '../../../../features/video/project/types/export';
import {
  type VideoProject,
  type VideoProjectAsset,
  type VideoProjectVideoClip,
} from '../../../../features/video/project/types/model';
import type { ExportJobState } from '../../types';
import type { createMp4Pipeline } from '../pipeline/index';

interface BaseMp4VideoRenderSpan {
  end: number;
  start: number;
}

interface Mp4CompositeRenderSpan extends BaseMp4VideoRenderSpan {
  kind: 'composite';
  reason: Mp4CompositeRenderReason;
}

export interface Mp4AcceleratedCompositeRenderSpan extends BaseMp4VideoRenderSpan {
  kind: 'accelerated-composite';
  reason: Mp4AcceleratedCompositeReason;
}

export interface Mp4CleanSourceRenderSpan extends BaseMp4VideoRenderSpan {
  asset: VideoProjectAsset;
  clip: VideoProjectVideoClip;
  kind: 'clean-source';
  sourceEnd: number;
  sourceStart: number;
}

export type Mp4VideoRenderSpan =
  | Mp4AcceleratedCompositeRenderSpan
  | Mp4CleanSourceRenderSpan
  | Mp4CompositeRenderSpan;

type Mp4AcceleratedCompositeReason = 'webm-frame-provider';

export type Mp4CompositeRenderReason =
  | 'asset-missing'
  | 'camera-motion'
  | 'cursor-overlay'
  | 'export-size'
  | 'mixed'
  | 'non-mp4-asset'
  | 'playback-rate'
  | 'shadow'
  | 'source-size'
  | 'subtitles'
  | 'transform'
  | 'transition'
  | 'visual-effect'
  | 'visual-layer'
  | 'visible-clips';

export interface Mp4HybridVideoPipelineArgs {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  job: ExportJobState;
  loadedImages: LoadedImagesMap;
  pipeline: Awaited<ReturnType<typeof createMp4Pipeline>>;
  project: VideoProject;
  settings: VideoProjectExportSettings;
  signal?: AbortSignal;
  throwIfPipelineFailed: () => void;
  videoEncoder: VideoEncoder;
}
