import type { ExportAudioSettings } from './codecs/types';
import { type ClipAudioNode } from './media';

export interface ProjectExportRuntimeState {
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
}
