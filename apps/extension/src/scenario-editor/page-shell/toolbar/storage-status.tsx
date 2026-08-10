import { useCallback, useEffect, useState } from 'react';
import { ValueBadge } from '@sniptale/ui/editor-chrome';
import { getScenarioProjectEntry } from '../../../composition/persistence/scenario/projects/project';
import { promoteStoredItem } from '../../../composition/persistence/library-lifecycle';
import { translate } from '../../../platform/i18n';
import { connectAggregateEditorPresence } from '../../../workflows/aggregate-editor-presence/client';
import { refreshScenarioAggregatePresentation } from '../../project/presentation';

type ScenarioProjectStorageStatusProps = {
  projectId: string | null;
  projectUpdatedAt: number | null;
  saveState: 'error' | 'saved' | 'saving';
};

async function waitForScenarioWorkspace(
  projectId: string,
  updatedAt: number
): Promise<Awaited<ReturnType<typeof getScenarioProjectEntry>>> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const entry = await getScenarioProjectEntry(projectId);
    if (entry?.project.updatedAt === updatedAt) return entry;
    await new Promise((resolve) => globalThis.setTimeout(resolve, 50));
  }
  throw new Error('The scenario did not finish saving.');
}

export function ScenarioProjectStorageStatus({
  projectId,
  projectUpdatedAt,
  saveState,
}: ScenarioProjectStorageStatusProps) {
  const [temporary, setTemporary] = useState<boolean | null>(null);
  const [promotionState, setPromotionState] = useState<'idle' | 'saving' | 'error'>('idle');
  const promote = useCallback(async () => {
    if (!projectId || projectUpdatedAt === null) return;
    if (saveState === 'error') throw new Error('The scenario has unsaved changes.');
    setPromotionState('saving');
    try {
      const entry = await waitForScenarioWorkspace(projectId, projectUpdatedAt);
      if (!entry) throw new Error('The scenario is unavailable.');
      await refreshScenarioAggregatePresentation(entry);
      await promoteStoredItem({ kind: 'scenario-project', id: projectId });
      setTemporary(false);
      setPromotionState('idle');
    } catch (error) {
      setPromotionState('error');
      throw error;
    }
  }, [projectId, projectUpdatedAt, saveState]);

  useEffect(() => {
    if (!projectId) return;
    void getScenarioProjectEntry(projectId)
      .then((entry) => setTemporary(entry?.lifecycle?.storageClass === 'temporary'))
      .catch(() => setTemporary(null));
  }, [projectId]);

  useEffect(() => {
    if (!projectId || projectUpdatedAt === null || saveState !== 'saved') return;
    void waitForScenarioWorkspace(projectId, projectUpdatedAt)
      .then((entry) => (entry ? refreshScenarioAggregatePresentation(entry) : undefined))
      .catch(() => undefined);
  }, [projectId, projectUpdatedAt, saveState]);

  useEffect(() => {
    if (!projectId) return;
    const presence = connectAggregateEditorPresence({
      aggregate: { id: projectId, kind: 'scenario' },
      promote,
    });
    return () => presence.dispose();
  }, [projectId, promote]);

  if (!projectId || temporary === null) return null;

  return (
    <ValueBadge>
      {temporary ? (
        <button
          type="button"
          disabled={promotionState === 'saving'}
          onClick={() => void promote().catch(() => undefined)}
        >
          {translate('gallery.preview.saveToLibrary')}
        </button>
      ) : (
        translate('editor.documentActions.inLibrary')
      )}
      {promotionState === 'error' ? (
        <span role="alert">{translate('editor.documentActions.saveToLibraryError')}</span>
      ) : null}
    </ValueBadge>
  );
}
