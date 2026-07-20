import React from 'react';
import { translate, type TranslationKey } from '../../../platform/i18n';
import { EmptyLibrarySection } from '../items/cards';
import type { ProjectListItem, RecordingListItem } from '../contracts/items';
import { LibraryTabHeading } from './sections';
import { LibraryProjectRow, LibraryRecordingRow } from './rows';
import type { LibraryThumbnailViewState } from './thumbnails/types';
import { MediaPreviewPane } from './media-preview';

type ProjectsSectionProps = {
  activeProjectId: string | null;
  hasQuery: boolean;
  onDeleteProject: (projectId: string) => void | Promise<void>;
  onOpenProject: (projectId: string) => void | Promise<void>;
  projects: ProjectListItem[];
  projectRemainder: ProjectListItem[];
  recentProjects: ProjectListItem[];
  thumbnails: Record<string, LibraryThumbnailViewState>;
};

type RecordingsSectionProps = {
  hasQuery: boolean;
  onAddRecording: (recordingId: string) => void;
  recordingRemainder: RecordingListItem[];
  recordings: RecordingListItem[];
  recentRecordings: RecordingListItem[];
  thumbnails: Record<string, LibraryThumbnailViewState>;
};

type RecordingListContentProps = RecordingsSectionProps & {
  onSelectRecording: (recordingId: string) => void;
  selectedRecordingId: string | null;
};

function LibrarySectionGroup<T extends { id: string }>(props: {
  items: T[];
  title?: string;
  children: (item: T) => React.ReactNode;
}) {
  if (props.items.length === 0) {
    return null;
  }

  return (
    <div className="space-y-1.5">
      {props.title ? (
        <div className="px-0.5 text-[11px] font-semibold text-[var(--sniptale-color-text-muted)]">
          {props.title}
        </div>
      ) : null}
      {props.items.map((item) => props.children(item))}
    </div>
  );
}

function LibraryListContent<T extends { id: string }>(props: {
  allTitleKey: TranslationKey;
  children: (item: T) => React.ReactNode;
  dataUi: string;
  emptyKey: TranslationKey;
  hasQuery: boolean;
  items: T[];
  maxHeightClassName: string;
  recentItems: T[];
  recentTitleKey: TranslationKey;
  remainderItems: T[];
}) {
  return (
    <LibraryScrollRegion
      dataUi={props.dataUi}
      emptyKey={props.emptyKey}
      hasItems={props.items.length > 0}
      hasQuery={props.hasQuery}
      maxHeightClassName={props.maxHeightClassName}
    >
      <LibrarySectionGroup items={props.recentItems} title={translate(props.recentTitleKey)}>
        {props.children}
      </LibrarySectionGroup>
      <LibrarySectionGroup
        items={props.remainderItems}
        {...optionalTitle(props.recentItems.length > 0 ? translate(props.allTitleKey) : undefined)}
      >
        {props.children}
      </LibrarySectionGroup>
    </LibraryScrollRegion>
  );
}

function noResultsMessage(hasQuery: boolean, emptyKey: TranslationKey): string {
  return hasQuery ? translate('videoEditor.sidebar.libraryNoSearchResults') : translate(emptyKey);
}

function optionalTitle(title: string | undefined) {
  return title === undefined ? {} : { title };
}

function LibraryScrollRegion(props: {
  children: React.ReactNode;
  dataUi: string;
  emptyKey: TranslationKey;
  hasItems: boolean;
  hasQuery: boolean;
  maxHeightClassName: string;
}) {
  return (
    <div
      className={`${props.maxHeightClassName} space-y-2 overflow-y-auto pr-1`}
      data-ui={props.dataUi}
    >
      {props.hasItems ? (
        props.children
      ) : (
        <EmptyLibrarySection message={noResultsMessage(props.hasQuery, props.emptyKey)} />
      )}
    </div>
  );
}

export function ProjectsSection(props: ProjectsSectionProps) {
  return (
    <div className="grid min-h-0 gap-3" data-ui="video-editor.library.projects-tab">
      <LibraryTabHeading
        title={translate('videoEditor.sidebar.projectsTitle')}
        meta={`${props.projects.length} ${translate('videoEditor.sidebar.projectsSavedSuffix')}`}
      />
      <ProjectListContent {...props} />
    </div>
  );
}

export function RecordingsSection(props: RecordingsSectionProps) {
  const [selectedRecordingId, setSelectedRecordingId] = React.useState<string | null>(null);
  const selectedRecording = resolveSelectedRecording(props.recordings, selectedRecordingId);

  return (
    <div className="grid min-h-0 gap-3" data-ui="video-editor.library.media-tab">
      <LibraryTabHeading
        title={translate('videoEditor.sidebar.recordingsTitle')}
        meta={`${props.recordings.length} ${translate('videoEditor.sidebar.recordingsInDbSuffix')}`}
      />
      <div className="grid min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <RecordingListContent
          {...props}
          selectedRecordingId={selectedRecording?.id ?? null}
          onSelectRecording={setSelectedRecordingId}
        />
        <MediaPreviewPane
          recording={selectedRecording}
          thumbnailUrl={
            selectedRecording ? props.thumbnails[selectedRecording.thumbnailId]?.url : undefined
          }
          onAddRecording={props.onAddRecording}
        />
      </div>
    </div>
  );
}

function resolveSelectedRecording(
  recordings: RecordingListItem[],
  selectedRecordingId: string | null
) {
  return (
    recordings.find((recording) => recording.id === selectedRecordingId) ?? recordings[0] ?? null
  );
}

function ProjectListContent(props: ProjectsSectionProps) {
  return (
    <LibraryListContent
      allTitleKey="videoEditor.sidebar.libraryAllProjectsTitle"
      dataUi="projects-scroll"
      emptyKey="videoEditor.sidebar.projectsEmpty"
      hasQuery={props.hasQuery}
      items={props.projects}
      maxHeightClassName="max-h-[calc(100vh-190px)]"
      recentItems={props.recentProjects}
      recentTitleKey="videoEditor.sidebar.libraryRecentProjectsTitle"
      remainderItems={props.projectRemainder}
    >
      {(item) => (
        <LibraryProjectRow
          key={item.id}
          item={item}
          isActive={item.id === props.activeProjectId}
          onOpenProject={props.onOpenProject}
          onDeleteProject={props.onDeleteProject}
          thumbnailUrl={props.thumbnails[item.thumbnailId]?.url}
        />
      )}
    </LibraryListContent>
  );
}

function RecordingListContent(props: RecordingListContentProps) {
  return (
    <LibraryListContent
      allTitleKey="videoEditor.sidebar.libraryAllRecordingsTitle"
      dataUi="recordings-scroll"
      emptyKey="videoEditor.sidebar.recordingsEmpty"
      hasQuery={props.hasQuery}
      items={props.recordings}
      maxHeightClassName="max-h-[calc(100vh-190px)]"
      recentItems={props.recentRecordings}
      recentTitleKey="videoEditor.sidebar.libraryRecentRecordingsTitle"
      remainderItems={props.recordingRemainder}
    >
      {(item) => (
        <LibraryRecordingRow
          key={item.id}
          recording={item}
          onAddRecording={props.onAddRecording}
          onSelectRecording={props.onSelectRecording}
          selected={item.id === props.selectedRecordingId}
          thumbnailUrl={props.thumbnails[item.thumbnailId]?.url}
        />
      )}
    </LibraryListContent>
  );
}
