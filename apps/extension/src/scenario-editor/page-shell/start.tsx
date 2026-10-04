import { getRecording } from '../../composition/persistence/recordings';
import {
  getScenarioAsset,
  getScenarioProjectEntry,
} from '../../composition/persistence/scenario/projects';
import { createProjectCoverService } from '../../workflows/project-covers';
import { subscribeToMediaHubEvents } from '../../features/media-hub/events';
import { getVideoProject, getProjectAsset } from '../../composition/persistence/projects';
import { ScenarioEditorIcon } from '@sniptale/ui/editor-chrome';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getMediaAssetBlob } from '../../composition/persistence/media-library';
import {
  listScenarioProjectSummaries,
  getScenarioAssetBlob,
} from '../../composition/persistence/scenario/store/public';
import { formatDateTime, useAppLocale, type AppLocale, type Translate } from '../../platform/i18n';
import { openGalleryPage } from '../../platform/navigation/extension-pages';
import {
  EditorStart,
  type EditorStartSourceItem,
  useEditorStartItems,
} from '../../ui/editor-start';
import type { useGuidePageState } from './runtime/use-state';

const covers = createProjectCoverService({
  getVideoProject,
  getProjectAsset,
  getMediaAssetBlob,
  getRecording,
  getScenarioAsset,
  getScenarioProjectEntry,
  getScenarioAssetBlob,
});

async function listStartProjects(locale: AppLocale): Promise<EditorStartSourceItem[]> {
  const projects = await listScenarioProjectSummaries();
  return projects
    .filter((item) => item.lifecycle?.trashedAt === undefined)
    .map((item) => ({
      id: item.id,
      title: item.name,
      detail: formatDateTime(item.updatedAt, undefined, locale),
      updatedAt: item.updatedAt,
      loadThumbnail: (signal: AbortSignal) =>
        covers.getCover(
          { kind: 'scenario', id: item.id, workspaceRevision: item.workspaceRevision ?? 0 },
          signal
        ),
      unavailable: item.availability !== 'available',
    }));
}

export function ScenarioEditorStart(props: {
  state: ReturnType<typeof useGuidePageState>;
  t: Translate;
}) {
  const locale = useAppLocale();
  const listProjects = useCallback(() => listStartProjects(locale), [locale]);
  const { items, status, refresh } = useEditorStartItems(listProjects);
  useEffect(
    () =>
      subscribeToMediaHubEvents((event) => {
        if (event.type === 'library-changed') void refresh();
      }),
    [refresh]
  );
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<unknown>, failure: string) => {
    if (pendingRef.current || pending) return;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await action();
      if (result === false) setError(failure);
    } catch {
      setError(failure);
      void refresh();
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };
  const loadError =
    props.state.status === 'missing'
      ? props.t('scenario.editor.guideMissing')
      : props.state.status === 'unavailable'
        ? props.t('scenario.editor.guideUnavailable')
        : null;
  return (
    <EditorStart
      title={props.t('scenario.editor.documentTitle')}
      description={props.t('scenario.editor.guideEmpty')}
      createLabel={props.t('scenario.editor.createProject')}
      openLabel={props.t('shared.editorStart.open')}
      recentLabel={props.t('scenario.editor.recentProjects')}
      emptyLabel={props.t('shared.editorStart.empty')}
      loadingLabel={props.t('shared.editorStart.loading')}
      errorLabel={props.t('shared.editorStart.error')}
      retryLabel={props.t('shared.editorStart.retry')}
      searchLabel={props.t('scenario.editor.searchProjects')}
      unavailableLabel={props.t('shared.editorStart.unavailable')}
      items={items}
      status={props.state.status === 'loading' ? 'loading' : status}
      actionError={error ?? loadError}
      pending={pending || props.state.status === 'loading' || props.state.status === 'saving'}
      icon={<ScenarioEditorIcon className="size-6" />}
      browseOnOpen={status !== 'error'}
      onCreate={() =>
        void run(
          () => props.state.create(props.t('scenario.common.defaultProjectName')),
          props.t('shared.editorStart.createFailed')
        )
      }
      onOpen={() => void openGalleryPage()}
      onSelect={(id) =>
        void run(() => props.state.openExisting(id), props.t('shared.editorStart.openFailed'))
      }
      onRetry={() => {
        void props.state.reload();
        void refresh();
      }}
      {...(loadError ? { onRecover: () => void props.state.reload() } : {})}
    />
  );
}
