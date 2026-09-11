import { useState, type ReactNode } from 'react';
import { GUIDE_LIMITS, type GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { Translate } from '../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { Library, Undo2, Redo2, Save } from 'lucide-react';
import { openGalleryPage } from '../../platform/navigation/extension-pages';

export function GuidePageHeader({
  project,
  panelControls,
  disabled,
  saveDisabled,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSave,
  onChange,
  t,
}: {
  project: GuideProject | null;
  panelControls?: ReactNode;
  disabled: boolean;
  saveDisabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => Promise<void>;
  onChange: (project: GuideProject, group?: string | null) => void;
  t: Translate;
}) {
  const [libraryStatus, setLibraryStatus] = useState<'idle' | 'opening' | 'failed'>('idle');
  const openLibrary = async () => {
    if (libraryStatus === 'opening') return;
    setLibraryStatus('opening');
    try {
      await openGalleryPage();
      setLibraryStatus('idle');
    } catch {
      setLibraryStatus('failed');
    }
  };
  return (
    <>
      <header className="guide-page-header">
        <div className="guide-page-identity">
          <ContentToolbarButton
            type="button"
            className="guide-library-link"
            disabled={libraryStatus === 'opening'}
            onClick={() => void openLibrary()}
            title={t('scenario.editor.guideLibraryHint')}
            aria-label={t('scenario.editor.guideLibrary')}
          >
            <Library size={16} aria-hidden="true" />
          </ContentToolbarButton>
        </div>
        {project && (
          <label className="guide-project-name">
            <span aria-hidden="true" className="guide-project-name-measure">
              {project.name || ' '}
            </span>
            <input
              aria-label={t('scenario.editor.projectLabel')}
              disabled={disabled}
              value={project.name}
              maxLength={GUIDE_LIMITS.maxLabelLength}
              onChange={(event) =>
                onChange({ ...project, name: event.target.value }, 'project-name')
              }
            />
          </label>
        )}
        {project && (
          <div
            className="guide-history-controls"
            role="group"
            aria-label={t('scenario.editor.guideHistoryActions')}
          >
            <ContentToolbarButton
              type="button"
              disabled={disabled || !canUndo}
              onClick={onUndo}
              title={t('scenario.editor.guideUndoHint')}
              aria-label={t('scenario.editor.guideUndo')}
            >
              <Undo2 size={16} aria-hidden="true" />
            </ContentToolbarButton>
            <ContentToolbarButton
              type="button"
              disabled={disabled || !canRedo}
              onClick={onRedo}
              title={t('scenario.editor.guideRedoHint')}
              aria-label={t('scenario.editor.guideRedo')}
            >
              <Redo2 size={16} aria-hidden="true" />
            </ContentToolbarButton>
          </div>
        )}
        <div className="guide-header-panel-controls">{panelControls}</div>
        {project && (
          <ProductActionButton
            className="guide-save"
            type="button"
            disabled={saveDisabled}
            onClick={() => void onSave()}
          >
            <Save size={16} aria-hidden="true" />
            {t('scenario.editor.guideSave')}
          </ProductActionButton>
        )}
      </header>
      {libraryStatus === 'failed' && (
        <div className="guide-page-feedback">
          <p role="alert">{t('scenario.editor.guideLibraryFailed')}</p>
        </div>
      )}
    </>
  );
}
