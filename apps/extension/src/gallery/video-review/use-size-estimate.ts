import { useVideoExportSizeEstimate } from '../../ui/video-export/use-size-estimate';
import { estimateReviewExportSize } from '../../workflows/video-review/estimate-size';
import { resolveReviewAssetBytes } from '../../workflows/video-review/asset-bytes';
import { resolveOverlayComments } from '../../features/video/review/comments';
import { resolveQuickEditEffectiveFeatures } from '../../features/video/review/advanced/effective';
import { useState } from 'react';
import type { LoadedReview } from './use-session';
import type {
  ReviewMediaIndex,
  ReviewRenderSettings,
} from '../../workflows/video-review/media-index';

/** Gallery input projection and visibility; the shared hook owns the serial probe lifetime. */
export function useReviewSizeEstimate({
  resource,
  index,
  renderSettings,
  context,
  enabled,
}: {
  resource: LoadedReview;
  index: ReviewMediaIndex | null;
  renderSettings: ReviewRenderSettings;
  context: string;
  enabled: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const state = resource.session.getSnapshot();
  const estimateAdvanced = {
    ui: state.snapshot.workspace.advanced.ui,
    ...state.document.advancedContent,
  };
  const sizeEstimate = useVideoExportSizeEstimate(
    visible && index && enabled && estimateAdvanced.ui.mode === 'advanced'
      ? JSON.stringify([context, state.document, estimateAdvanced.ui, renderSettings])
      : null,
    (signal) => {
      if (!index) return Promise.reject(new Error('No export source'));
      return estimateReviewExportSize({
        file: resource.file,
        index,
        edits: state.document.edits,
        advanced: estimateAdvanced,
        comments: resolveQuickEditEffectiveFeatures(estimateAdvanced).overlaysVisible
          ? resolveOverlayComments(state.document)
          : [],
        fragmentOffset: 0,
        renderSettings,
        signal,
        readProjectAsset: resolveReviewAssetBytes,
      });
    }
  );
  return { ...sizeEstimate, setVisible };
}
