import { VideoProjectDurationMode } from '../../../../../features/video/project/types/layout';
import type {
  VideoProject,
  VideoProjectAudioClip,
} from '../../../../../features/video/project/types/model';
import { updateProjectAudioDurationMode } from '../../../../../features/video/project/timeline/basics';
import { areProjectClipsEditable } from '../../../../../features/video/project/timeline/clip-editability';
import { translate, useAppLocale } from '../../../../../platform/i18n';
import { SegmentedRow } from '../../../../../ui/compact-inspector-controls';
import { useVideoEditorTimelineEditingPort } from '../../../../runtime/controller/store';

/** A shared policy choice keeps retained audio and text on the same montage clock. */
export function ProjectDurationModeField(props: {
  value: VideoProjectDurationMode;
  contentKind: 'audio' | 'text';
  disabled?: boolean;
  onChange(value: VideoProjectDurationMode): void;
}) {
  useAppLocale();
  return (
    <SegmentedRow<VideoProjectDurationMode>
      label={translate('videoEditor.sidebar.contentDuration')}
      ariaLabel={translate('videoEditor.sidebar.contentDuration')}
      layout="stacked"
      columns={2}
      value={props.value}
      options={[
        {
          value: 'project',
          label: translate('videoEditor.sidebar.contentDurationProject'),
          disabled: props.disabled ?? false,
        },
        {
          value: 'content',
          label: translate(
            props.contentKind === 'audio'
              ? 'videoEditor.sidebar.audioDurationContent'
              : 'videoEditor.sidebar.textDurationContent'
          ),
          disabled: props.disabled ?? false,
        },
      ]}
      onChange={(value) => {
        if (value !== props.value) props.onChange(value);
      }}
    />
  );
}

/** Existing audio selections use the sole timeline history writer. */
export function ProjectAudioDurationModeField({
  project,
  clip,
}: {
  project: VideoProject;
  clip: VideoProjectAudioClip;
}) {
  const updateProject = useVideoEditorTimelineEditingPort((port) => port.updateProject);
  return (
    <ProjectDurationModeField
      value={clip.durationMode ?? VideoProjectDurationMode.CONTENT}
      contentKind="audio"
      disabled={!areProjectClipsEditable(project, [clip.id])}
      onChange={(mode) =>
        updateProject((current) =>
          current === project ? updateProjectAudioDurationMode(current, clip, mode) : current
        )
      }
    />
  );
}
