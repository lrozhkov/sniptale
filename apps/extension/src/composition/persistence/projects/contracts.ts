import type { VideoExportFormat, VideoProject } from '../../../features/video/project/types';

export interface VideoProjectEntry {
  id: string;
  project: VideoProject;
  createdAt: number;
  updatedAt: number;
}

export interface UnsupportedVideoProjectMetadata {
  createdAt: number;
  duration: number;
  height: number;
  id: string;
  name: string;
  updatedAt: number;
  width: number;
}

export class UnsupportedEngine1VideoProjectError extends Error {
  readonly code = 'unsupported-engine1';

  constructor(readonly metadata: UnsupportedVideoProjectMetadata) {
    super('Engine1 video projects are unsupported');
    this.name = 'UnsupportedEngine1VideoProjectError';
  }
}

export class InvalidVideoProjectError extends Error {
  readonly code = 'invalid-video-project';

  constructor() {
    super('Stored video project is invalid');
    this.name = 'InvalidVideoProjectError';
  }
}

export type VideoProjectEntryReadResult =
  | { entry: VideoProjectEntry; status: 'ready' }
  | { status: 'notFound' }
  | {
      metadata: UnsupportedVideoProjectMetadata;
      reason: 'engine1-template-instances';
      status: 'unsupported';
    }
  | {
      diagnostics: readonly ['invalid-video-project-entry'];
      opaqueId?: string;
      status: 'invalid';
    };

export type VideoProjectReadResult =
  | { project: VideoProject; status: 'ready' }
  | Exclude<VideoProjectEntryReadResult, { status: 'ready' }>;

export function resolveVideoProjectReadResult(result: VideoProjectReadResult): VideoProject | null {
  if (result.status === 'ready') return result.project;
  if (result.status === 'notFound') return null;
  if (result.status === 'unsupported') {
    throw new UnsupportedEngine1VideoProjectError(result.metadata);
  }
  throw new InvalidVideoProjectError();
}

export interface ProjectAssetEntry {
  id: string;
  blob: Blob;
  mimeType: string;
  createdAt: number;
  size: number;
}

export interface ProjectExportEntry {
  id: string;
  projectId: string;
  recordingId: string;
  filename: string;
  createdAt: number;
  size: number;
  duration: number;
  width: number;
  height: number;
  fps: number;
  format?: VideoExportFormat;
  mimeType?: string;
}
