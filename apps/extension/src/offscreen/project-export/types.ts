import type { ExportTimeEstimator } from '../../features/video/project/export/time-estimate';
import type { ExportAudioSettings } from './codecs/types';
import { type ClipAudioNode } from './media';
import type { VideoProjectCaptionRenderer } from '../../workflows/video-review/project-captions';

export interface ProjectExportRuntimeState {
  captionRenderer?: VideoProjectCaptionRenderer;
  mediaRecorder: MediaRecorder | null;
  clipMediaElements: Map<string, HTMLMediaElement>;
  clipAudioNodes: Map<string, ClipAudioNode>;
  audioContext: AudioContext | null;
  audioDestination: MediaStreamAudioDestinationNode | null;
  exportAudioSettings: ExportAudioSettings | null;
  assetUrls: string[];
  cleanupNode: HTMLDivElement | null;
  exportAbortController: AbortController | null;
  exportStream: MediaStream | null;
}

export interface ExportJobState extends ProjectExportRuntimeState {
  jobId: string;
  cancelled: boolean;
  timeEstimator?: ExportTimeEstimator;
  renderProgressRange?: { start: number; end: number };
}
