import { translate } from '../../../../platform/i18n';
import { formatDate, formatDuration, formatSize } from '../../../chrome/display';
import type { ProjectListItem, RecordingListItem } from '../../../library/contracts/items';
import {
  AddRecordingAction,
  DeleteProjectAction,
  EmptyLibrarySection,
  LibraryItemMetadataLine,
  LibraryItemShell,
  LibraryItemTitle,
  OpenProjectAction,
} from '../../../library/items/cards';

export { EmptyLibrarySection };

export function WorkspaceSidebarProjectCard({
  item,
  isActive,
  onOpenProject,
  onDeleteProject,
}: {
  item: ProjectListItem;
  isActive: boolean;
  onOpenProject: (projectId: string) => void | Promise<void>;
  onDeleteProject: (projectId: string) => void | Promise<void>;
}) {
  return (
    <LibraryItemShell active={isActive} variant="card">
      <WorkspaceSidebarProjectCardHeader item={item} />
      <WorkspaceSidebarProjectCardActions
        isActive={isActive}
        projectId={item.id}
        onOpenProject={onOpenProject}
        onDeleteProject={onDeleteProject}
      />
    </LibraryItemShell>
  );
}

function WorkspaceSidebarProjectCardHeader({ item }: { item: ProjectListItem }) {
  return (
    <div className="mb-2 min-w-0">
      <LibraryItemTitle>
        {item.name || translate('videoEditor.sidebar.untitledProject')}
      </LibraryItemTitle>
      <LibraryItemMetadataLine
        values={[formatDate(item.updatedAt), formatDuration(item.duration)]}
      />
    </div>
  );
}

function WorkspaceSidebarProjectCardActions({
  isActive,
  projectId,
  onOpenProject,
  onDeleteProject,
}: {
  isActive: boolean;
  projectId: string;
  onOpenProject: (projectId: string) => void | Promise<void>;
  onDeleteProject: (projectId: string) => void | Promise<void>;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <OpenProjectAction
        disabled={isActive}
        onOpenProject={onOpenProject}
        projectId={projectId}
        variant="card"
      />
      <DeleteProjectAction onDeleteProject={onDeleteProject} projectId={projectId} variant="card" />
    </div>
  );
}

export function WorkspaceSidebarRecordingCard({
  recording,
  onAddRecording,
}: {
  recording: RecordingListItem;
  onAddRecording: (recordingId: string) => void;
}) {
  return (
    <LibraryItemShell variant="card">
      <div className="mb-2 min-w-0">
        <LibraryItemTitle>{recording.filename}</LibraryItemTitle>
        <LibraryItemMetadataLine
          values={[formatDate(recording.createdAt), formatSize(recording.size)]}
        />
      </div>
      <AddRecordingAction
        fullWidth
        onAddRecording={onAddRecording}
        recordingId={recording.id}
        variant="card"
      />
    </LibraryItemShell>
  );
}
