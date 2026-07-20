import type React from 'react';
import { translate } from '../../../platform/i18n';
import {
  AddRecordingAction,
  DeleteProjectAction,
  formatDimensions,
  LibraryItemMetadataLine,
  LibraryItemShell,
  LibraryItemTitle,
  LibraryPreviewSlot,
  OpenProjectAction,
} from '../items/cards';
import { formatDuration, formatSize } from '../../chrome/display';
import type { ProjectListItem, RecordingListItem } from '../contracts/items';

function formatOptionalDuration(duration: number | null): string | null {
  return duration === null ? null : formatDuration(duration);
}

function ProjectRowActions(props: {
  disabled: boolean;
  onDeleteProject: (projectId: string) => void | Promise<void>;
  onOpenProject: (projectId: string) => void | Promise<void>;
  projectId: string;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      <OpenProjectAction
        disabled={props.disabled}
        onOpenProject={props.onOpenProject}
        projectId={props.projectId}
        variant="row"
      />
      <DeleteProjectAction
        onDeleteProject={props.onDeleteProject}
        projectId={props.projectId}
        variant="row"
      />
    </div>
  );
}

export function LibraryProjectRow(props: {
  isActive: boolean;
  item: ProjectListItem;
  onDeleteProject: (projectId: string) => void | Promise<void>;
  onOpenProject: (projectId: string) => void | Promise<void>;
  thumbnailUrl: string | undefined;
}) {
  return (
    <LibraryItemShell active={props.isActive} variant="row" className="!gap-2 !px-2 !py-2">
      <LibraryPreviewSlot
        alt={props.item.name || translate('videoEditor.sidebar.untitledProject')}
        compact
        fallback="project"
        thumbnailUrl={props.thumbnailUrl}
      />
      <div className="min-w-0">
        <LibraryItemTitle>
          {props.item.name || translate('videoEditor.sidebar.untitledProject')}
        </LibraryItemTitle>
        <LibraryItemMetadataLine
          values={[
            formatDuration(props.item.duration),
            formatDimensions(props.item.width, props.item.height),
            `${props.item.clipCount} ${translate('videoEditor.sidebar.libraryClipCountSuffix')}`,
          ]}
        />
        <ProjectRowActions
          disabled={props.isActive}
          onDeleteProject={props.onDeleteProject}
          onOpenProject={props.onOpenProject}
          projectId={props.item.id}
        />
      </div>
    </LibraryItemShell>
  );
}

export function LibraryRecordingRow(props: {
  onAddRecording: (recordingId: string) => void;
  onSelectRecording?: (recordingId: string) => void;
  recording: RecordingListItem;
  selected?: boolean;
  thumbnailUrl: string | undefined;
}) {
  const interactionProps = createRecordingRowInteractionProps(props);

  return (
    <LibraryItemShell
      active={props.selected === true}
      variant="row"
      className="!gap-2 !px-2 !py-2"
      {...interactionProps}
    >
      <LibraryRecordingRowPreview recording={props.recording} thumbnailUrl={props.thumbnailUrl} />
      <LibraryRecordingRowBody recording={props.recording} onAddRecording={props.onAddRecording} />
    </LibraryItemShell>
  );
}

function createRecordingRowInteractionProps(props: {
  onSelectRecording?: (recordingId: string) => void;
  recording: RecordingListItem;
}) {
  const handleSelect = () => props.onSelectRecording?.(props.recording.id);
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleSelect();
    }
  };

  return {
    onClick: handleSelect,
    onKeyDown: handleKeyDown,
    role: 'button',
    tabIndex: 0,
  };
}

function LibraryRecordingRowPreview(props: {
  recording: RecordingListItem;
  thumbnailUrl: string | undefined;
}) {
  return (
    <LibraryPreviewSlot
      alt={props.recording.filename}
      compact
      fallback="recording"
      thumbnailUrl={props.thumbnailUrl}
    />
  );
}

function LibraryRecordingRowBody(props: {
  onAddRecording: (recordingId: string) => void;
  recording: RecordingListItem;
}) {
  return (
    <div className="min-w-0">
      <LibraryItemTitle>{props.recording.filename}</LibraryItemTitle>
      <LibraryItemMetadataLine
        values={[
          formatOptionalDuration(props.recording.duration),
          formatDimensions(props.recording.width, props.recording.height),
          formatSize(props.recording.size),
        ]}
      />
      <div className="mt-2">
        <AddRecordingAction
          onAddRecording={props.onAddRecording}
          recordingId={props.recording.id}
          variant="row"
        />
      </div>
    </div>
  );
}
