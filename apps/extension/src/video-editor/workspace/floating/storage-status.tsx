import { useCallback, useEffect, useState } from 'react';
import { Check, CloudUpload } from 'lucide-react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { getVideoProject } from '../../../composition/persistence/projects';
import { translate } from '../../../platform/i18n';
import { connectAggregateEditorPresence } from '../../../workflows/aggregate-editor-presence/client';
import { useVideoEditorStore } from '../../state/store';
import { promoteOpenVideoProject, refreshSavedVideoProjectPresentation } from './storage-promotion';

export function VideoProjectStorageStatus() {
  const projectId =
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get('project');
  const [temporary, setTemporary] = useState<boolean | null>(null);
  const [promotionState, setPromotionState] = useState<'idle' | 'saving' | 'error'>('idle');
  const projectUpdatedAt = useVideoEditorStore((state) => state.project?.updatedAt ?? null);
  const saveState = useVideoEditorStore((state) => state.saveState);
  const promote = useCallback(async () => {
    if (!projectId) return;
    setPromotionState('saving');
    try {
      await promoteOpenVideoProject(projectId);
      setTemporary(false);
      setPromotionState('idle');
    } catch (error) {
      setPromotionState('error');
      throw error;
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    void getVideoProject(projectId)
      .then((result) => {
        setTemporary(result.status === 'ready' && result.lifecycle?.storageClass === 'temporary');
      })
      .catch(() => setTemporary(null));
  }, [projectId]);

  useEffect(() => {
    if (!projectId || projectUpdatedAt === null || saveState !== 'saved') return;
    void refreshSavedVideoProjectPresentation(projectId, projectUpdatedAt).catch(() => undefined);
  }, [projectId, projectUpdatedAt, saveState]);

  useEffect(() => {
    if (!projectId) return;
    const presence = connectAggregateEditorPresence({
      aggregate: { id: projectId, kind: 'video-project' },
      promote,
    });
    return () => presence.dispose();
  }, [projectId, promote]);

  if (!projectId || temporary === null) return null;

  if (!temporary) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-[var(--sniptale-color-text-secondary)]">
        <Check size={14} aria-hidden />
        {translate('editor.documentActions.inLibrary')}
      </span>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <ProductActionButton
        compact
        tone="secondary"
        disabled={promotionState === 'saving'}
        onClick={() => void promote().catch(() => undefined)}
        className="gap-1.5 whitespace-nowrap"
      >
        <CloudUpload size={14} aria-hidden />
        {promotionState === 'saving'
          ? translate('common.states.saving')
          : translate('editor.documentActions.saveToLibrary')}
      </ProductActionButton>
      {promotionState === 'error' ? (
        <span className="max-w-56 text-xs text-[var(--sniptale-color-danger)]" role="alert">
          {translate('editor.documentActions.saveToLibraryError')}
        </span>
      ) : null}
    </div>
  );
}
