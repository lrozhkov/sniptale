import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ProductModalHeader } from '@sniptale/ui/product-modal';
import { VideoEditorFileInputNodes } from '../../chrome/file-inputs';
import { LibraryPanelDrawerContent } from './content';
import { buildLibraryPanelState } from './state';
import { LibraryPanelTitle, type LibraryPanelTab } from './sections';
import { useLibraryThumbnails } from './thumbnails/use-thumbnails';
import type { LibraryThumbnailItem } from './thumbnails/types';
import type { VideoEditorLibraryPanelBodyProps } from '../contracts/panel';

function createImportHandler(onImport: (file: File) => void, onClose: () => void) {
  return (file: File) => {
    onImport(file);
    onClose();
  };
}

function LibraryPanelInputs(props: VideoEditorLibraryPanelBodyProps) {
  const handleImportImage = createImportHandler(props.onImportImage, props.onClose);
  const handleImportVideo = createImportHandler(props.onImportVideo, props.onClose);
  const handleImportAudio = createImportHandler(props.onImportAudio, props.onClose);

  return (
    <VideoEditorFileInputNodes
      {...props.inputRefs}
      onImportAudio={handleImportAudio}
      onImportImage={handleImportImage}
      onImportVideo={handleImportVideo}
    />
  );
}

function createThumbnailItems(
  libraryState: ReturnType<typeof buildLibraryPanelState>
): LibraryThumbnailItem[] {
  const projectItems = libraryState.visibleProjects.map((project) => ({
    createdAt: project.updatedAt,
    id: project.id,
    mimeType: null,
    sourceMediaId: project.thumbnailSourceMediaId,
    thumbnailId: project.thumbnailId,
  }));
  const recordingItems = libraryState.visibleRecordings.map((recording) => ({
    createdAt: recording.createdAt,
    id: recording.id,
    mimeType: recording.mimeType,
    sourceMediaId: recording.thumbnailId,
    thumbnailId: recording.thumbnailId,
  }));

  return [...projectItems, ...recordingItems];
}

export function VideoEditorLibraryPanelBody(props: VideoEditorLibraryPanelBodyProps) {
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<LibraryPanelTab>('media');
  const deferredQuery = useDeferredValue(query);
  const diagnosticsAvailable = props.recordingId !== null;
  const libraryState = useMemo(
    () =>
      buildLibraryPanelState({
        activeProjectId: props.activeProjectId,
        projects: props.projects,
        query: deferredQuery,
        recordings: props.recordings,
      }),
    [deferredQuery, props.activeProjectId, props.projects, props.recordings]
  );
  const thumbnailItems = useMemo(() => createThumbnailItems(libraryState), [libraryState]);
  const thumbnails = useLibraryThumbnails(thumbnailItems);

  useEffect(() => {
    if (!diagnosticsAvailable && activeTab === 'diagnostics') {
      setActiveTab('media');
    }
  }, [activeTab, diagnosticsAvailable]);

  return (
    <>
      <LibraryPanelInputs {...props} />
      <ProductModalHeader
        title={
          <LibraryPanelTitle
            projectsCount={props.projects.length}
            recordingsCount={props.recordings.length}
          />
        }
        onClose={props.onClose}
        compact
      />
      <LibraryPanelDrawerContent
        {...props}
        {...libraryState}
        activeTab={activeTab}
        diagnosticsAvailable={diagnosticsAvailable}
        onQueryChange={setQuery}
        onTabChange={setActiveTab}
        query={query}
        thumbnails={thumbnails}
      />
    </>
  );
}
