import { getRecording } from '../../../composition/persistence/recordings';
import {
  getScenarioAsset,
  getScenarioProjectEntry,
} from '../../../composition/persistence/scenario/projects';
import { createProjectCoverService } from '../../../workflows/project-covers';
import { subscribeToMediaHubEvents } from '../../../features/media-hub/events';
import { getScenarioAssetBlob } from '../../../composition/persistence/scenario/store/public';
import { Clapperboard } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getMediaAssetBlob } from '../../../composition/persistence/media-library';
import {
  listVideoProjects,
  getVideoProject,
  getProjectAsset,
} from '../../../composition/persistence/projects';
import { translate } from '../../../platform/i18n';
import { openGalleryPage } from '../../../platform/navigation/extension-pages';
import {
  EditorStart,
  type EditorStartSourceItem,
  useEditorStartItems,
} from '../../../ui/editor-start';
import { useVideoEditorStartActions } from '../../runtime/controller/composition/hooks';
import { useProjectTransitionPending } from '../../runtime/commands/project-transition';

const covers = createProjectCoverService({
  getVideoProject,
  getProjectAsset,
  getMediaAssetBlob,
  getRecording,
  getScenarioAsset,
  getScenarioProjectEntry,
  getScenarioAssetBlob,
});

async function listStartProjects(): Promise<EditorStartSourceItem[]> {
  const projects = await listVideoProjects();
  return projects
    .filter((item) => item.lifecycle?.trashedAt === undefined && !item.unavailableReason)
    .map((item) => ({
      id: item.id,
      title: item.name,
      detail: `${item.width} × ${item.height}`,
      updatedAt: item.updatedAt,
      loadThumbnail: (signal: AbortSignal) =>
        covers.getCover(
          { kind: 'video-project', id: item.id, workspaceRevision: item.workspaceRevision ?? 0 },
          signal
        ),
    }));
}

export function VideoEditorStart() {
  const { items, status, refresh } = useEditorStartItems(listStartProjects);
  useEffect(
    () =>
      subscribeToMediaHubEvents((event) => {
        if (event.type === 'library-changed') void refresh();
      }),
    [refresh]
  );
  const { onCreate, onOpen } = useVideoEditorStartActions();
  const transitionPending = useProjectTransitionPending();
  const [actionPending, setActionPending] = useState(false);
  const pendingRef = useRef(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const pending = actionPending || transitionPending;
  const run = async (action: () => Promise<void>) => {
    if (pendingRef.current || pending) return;
    pendingRef.current = true;
    setActionPending(true);
    setActionError(null);
    try {
      await action();
    } catch {
      setActionError(translate('shared.editorStart.openFailed'));
      void refresh();
    } finally {
      pendingRef.current = false;
      setActionPending(false);
    }
  };
  return (
    <EditorStart
      title={translate('videoEditor.app.documentTitle')}
      description={translate('videoEditor.app.startDescription')}
      createLabel={translate('videoEditor.app.newProjectAction')}
      openLabel={translate('shared.editorStart.open')}
      recentLabel={translate('videoEditor.app.startRecent')}
      emptyLabel={translate('shared.editorStart.empty')}
      loadingLabel={translate('shared.editorStart.loading')}
      errorLabel={translate('shared.editorStart.error')}
      retryLabel={translate('shared.editorStart.retry')}
      searchLabel={translate('shared.editorStart.search')}
      unavailableLabel={translate('shared.editorStart.unavailable')}
      items={items}
      status={status}
      actionError={actionError}
      pending={pending}
      icon={<Clapperboard size={28} />}
      browseOnOpen={status !== 'error'}
      onCreate={() => void run(() => onCreate())}
      onOpen={() => void openGalleryPage()}
      onSelect={(id) => void run(() => onOpen(id))}
      onRetry={() => void refresh()}
    />
  );
}
