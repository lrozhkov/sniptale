import { useEffect, useState } from 'react';
import { ValueBadge } from '@sniptale/ui/editor-chrome';
import { getVideoProject } from '../../../composition/persistence/projects';
import { promoteStoredItem } from '../../../composition/persistence/library-lifecycle';
import { translate } from '../../../platform/i18n';

export function VideoProjectStorageStatus() {
  const projectId =
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get('project');
  const [temporary, setTemporary] = useState<boolean | null>(null);
  const [promotionState, setPromotionState] = useState<'idle' | 'saving' | 'error'>('idle');

  useEffect(() => {
    if (!projectId) return;
    void getVideoProject(projectId)
      .then((result) => {
        setTemporary(result.status === 'ready' && result.lifecycle?.storageClass === 'temporary');
      })
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
            if (!projectId) return;
            setPromotionState('saving');
            try {
              await promoteStoredItem({ kind: 'video-project', id: projectId });
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
