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
      <ContentToolbarButton type="button" onClick={openWizard} className={toolbarButtonClassName}>
        {translate('videoEditor.timeline.autoTransform')}
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
  insertion,
  selectedClip,
  onAutoTransformRecording,
  onDeleteSelectedClip,
  onDuplicateSelectedClip,
  onSplitSelectedClip,
}: Pick<
  ProjectTimelineToolbarProps,
  | 'canAutoTransformRecording'
  | 'insertion'
  | 'selectedClip'
  | 'onAutoTransformRecording'
  | 'onDeleteSelectedClip'
  | 'onDuplicateSelectedClip'
  | 'onSplitSelectedClip'
>) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 max-[720px]:gap-1">
      <ProjectTimelineAddControls insertion={insertion} />
      {canAutoTransformRecording && onAutoTransformRecording ? (
        <ProjectTimelineAutoTransformButton onAutoTransformRecording={onAutoTransformRecording} />
      ) : null}
      <ProjectTimelineClipActions
        selectedClip={selectedClip}
        onDeleteSelectedClip={onDeleteSelectedClip}
        onDuplicateSelectedClip={onDuplicateSelectedClip}
        onSplitSelectedClip={onSplitSelectedClip}
      />
    </div>
  );
}
