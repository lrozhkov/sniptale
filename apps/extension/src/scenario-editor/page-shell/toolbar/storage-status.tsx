import { useEffect, useState } from 'react';
import { ValueBadge } from '@sniptale/ui/editor-chrome';
import { getScenarioProjectEntry } from '../../../composition/persistence/scenario/projects/project';
import { promoteStoredItem } from '../../../composition/persistence/library-lifecycle';
import { translate } from '../../../platform/i18n';

export function ScenarioProjectStorageStatus({ projectId }: { projectId: string | null }) {
  const [temporary, setTemporary] = useState<boolean | null>(null);
  const [promotionState, setPromotionState] = useState<'idle' | 'saving' | 'error'>('idle');

  useEffect(() => {
    if (!projectId) return;
    void getScenarioProjectEntry(projectId)
      .then((entry) => setTemporary(entry?.lifecycle?.storageClass === 'temporary'))
      .catch(() => setTemporary(null));
  }, [projectId]);

  if (!projectId || temporary === null) return null;

  return (
    <ValueBadge>
      {temporary ? (
        <button
          type="button"
          disabled={promotionState === 'saving'}
          onClick={async () => {
            setPromotionState('saving');
            try {
              await promoteStoredItem({ kind: 'scenario-project', id: projectId });
              setTemporary(false);
              setPromotionState('idle');
            } catch {
              setPromotionState('error');
            }
          }}
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
