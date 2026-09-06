import { WandSparkles } from 'lucide-react';
import { useState } from 'react';
import { translate } from '../../../../../platform/i18n';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { DEFAULT_VIDEO_AUTO_PROCESSING_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { VideoAutoProcessingAction } from '@sniptale/runtime-contracts/video/types/types';
import type { VideoAutoProcessingSettings } from '@sniptale/runtime-contracts/video/types/types';
import type { ProjectTimelineToolbarProps } from '../types';
import { toolbarButtonClassName } from './constants/button';
import { AutoTransformWizard } from './auto-transform-wizard';
import { ProjectTimelineAddControls } from './add-controls';
import { ProjectTimelineClipActions } from './clip-actions';

function ProjectTimelineAutoTransformButton(props: {
  onAutoTransformRecording: (settings: VideoAutoProcessingSettings) => void;
}): React.JSX.Element {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [draft, setDraft] = useState(DEFAULT_VIDEO_AUTO_PROCESSING_SETTINGS);
  const openWizard = () => {
    setDraft(DEFAULT_VIDEO_AUTO_PROCESSING_SETTINGS);
    setWizardOpen(true);
  };
  const applyDraft = () => {
    setWizardOpen(false);
    if (draft.stableSegments.action === VideoAutoProcessingAction.SKIP) {
      return;
    }

    props.onAutoTransformRecording({ ...draft, enabled: true });
  };

  return (
    <>
      <ContentToolbarButton
        type="button"
        onClick={openWizard}
        className={toolbarButtonClassName}
        title={translate('videoEditor.timeline.autoTransform')}
      >
        <WandSparkles size={14} aria-hidden="true" />
        <span className="@max-[1100px]/timeline:sr-only">
          {translate('videoEditor.timeline.autoTransform')}
        </span>
      </ContentToolbarButton>
      {wizardOpen ? (
        <AutoTransformWizard
          draft={draft}
          onApply={applyDraft}
          onClose={() => setWizardOpen(false)}
          onDraftChange={setDraft}
        />
      ) : null}
    </>
  );
}

export function ProjectTimelineToolbarLeadingControls({
  canAutoTransformRecording,
  canAddMotionRegion,
  hasMotionRegions,
  canEditSelectedClip,
  canSplitSelectedClip,
  insertion,
  selectedClip,
  onAutoTransformRecording,
  onDeleteSelectedClip,
  onDuplicateSelectedClip,
  onSplitSelectedClip,
}: Pick<
  ProjectTimelineToolbarProps,
  | 'canAutoTransformRecording'
  | 'canAddMotionRegion'
  | 'hasMotionRegions'
  | 'canEditSelectedClip'
  | 'canSplitSelectedClip'
  | 'insertion'
  | 'selectedClip'
  | 'onAutoTransformRecording'
  | 'onDeleteSelectedClip'
  | 'onDuplicateSelectedClip'
  | 'onSplitSelectedClip'
>) {
  return (
    <div className="flex min-w-0 flex-nowrap items-center gap-1">
      {!hasMotionRegions && (
        <ProjectTimelineAddControls insertion={insertion} canAddMotionRegion={canAddMotionRegion} />
      )}
      {canAutoTransformRecording && onAutoTransformRecording ? (
        <ProjectTimelineAutoTransformButton onAutoTransformRecording={onAutoTransformRecording} />
      ) : null}
      <div
        className={[
          'flex shrink-0 items-center gap-[var(--timeline-control-gap)] border-l',
          'border-[color:var(--sniptale-color-border-soft)] pl-1',
        ].join(' ')}
      >
        <ProjectTimelineClipActions
          canEditSelectedClip={canEditSelectedClip}
          canSplitSelectedClip={canSplitSelectedClip}
          selectedClip={selectedClip}
          onDeleteSelectedClip={onDeleteSelectedClip}
          onDuplicateSelectedClip={onDuplicateSelectedClip}
          onSplitSelectedClip={onSplitSelectedClip}
        />
      </div>
    </div>
  );
}
