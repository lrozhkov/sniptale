import type { VideoSample } from 'mediabunny';
import type { SeekableAssetObjectWriter } from '../../composition/persistence/assets';
import type { VideoProjectExportTimeEstimate } from '../../features/video/project/types/export';
import type { ReviewEdit } from '../../features/video/review/types';
import type { ReviewTimeSegment } from '../../features/video/review/time-segment';
import type { QuickEditAdvancedState } from '../../features/video/review/advanced/types';
import type { CanvasCommentExport } from '../../features/video/review/comments';
import type { ReviewClickCue } from '../../features/video/review/click-animation';
import type { ReviewKeyCue } from '../../features/video/review/key-animation';
import type { ReviewMediaIndex, ReviewRenderSettings } from './media-index';
import type { ReviewExportClipPlan } from './audio-render';

/** Caller-owned inputs shared by ordinary and presentation frame export. */
export interface ReviewFrameExportInput {
  keyCues?: readonly ReviewKeyCue[] | undefined;
  clickCues?: readonly ReviewClickCue[];
  renderSettings?: ReviewRenderSettings | undefined;
  /** Read-only bounded probe sink; bypasses muxing, audio rendering and writer use. */
  frameProbe?: { add(sample: VideoSample): Promise<void> };
  file: Blob;
  index: ReviewMediaIndex;
  /** Fragment-local edits; `fragmentOffset` maps local time back to global output time. */
  edits: readonly ReviewEdit[];
  /** Full document clocks preserve global caption slots in a fragment render. */
  captionTimeMap?: readonly ReviewTimeSegment[];
  advanced: QuickEditAdvancedState;
  /** Text-resolved overlays; burning follows each comment's own renderToVideo flag. */
  comments?: readonly CanvasCommentExport[];
  fragmentOffset: number;
  /** Fragment exports may explicitly omit remembered intro/outro slots. */
  includeBookends?: boolean;
  writer: Pick<SeekableAssetObjectWriter, 'writeAt'>;
  signal: AbortSignal;
  provenance?: string;
  exportAudio?: ReviewExportClipPlan;
  readProjectAsset(assetId: string): Promise<Blob | null>;
  onProgress?(fraction: number): void;
  onTimeEstimate?(estimate: VideoProjectExportTimeEstimate | null): void;
}
