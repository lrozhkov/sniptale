type CursorDetectionJobStatus = 'idle' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface CursorDetectionJobState {
  clipId: string | null;
  error: string | null;
  processedFrames: number;
  progress: number;
  status: CursorDetectionJobStatus;
  totalFrames: number;
  trackId: string | null;
}
