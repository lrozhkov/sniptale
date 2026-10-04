import type { RefObject } from 'react';
import { Check, Crop, Pencil, Magnet, X } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { GuideResourceTrigger } from './resource-drawer';
import type { Translate } from '../../platform/i18n';

type ToolsProps = {
  editing: boolean;
  disabled: boolean;
  url: string | null | undefined;
  t: Translate;
  trigger: RefObject<HTMLButtonElement | null>;
  libraryTarget?: { stepId: string; blockId: string };
  onEdit?: () => void;
  onEditingChange: (editing: boolean) => void;
  bounds: boolean;
  boundsDisabled: boolean;
  close: (commit: boolean) => void;
  toggleBounds: () => void;
};

/** Framing has only geometry/accept/cancel commands; resource and block actions stay outside it. */
export function GuideImageSurfaceTools(props: ToolsProps) {
  const { editing, disabled, url, t } = props;
  return (
    <div
      className="guide-image-tools"
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') event.stopPropagation();
      }}
    >
      {editing ? (
        <FramingTools {...props} />
      ) : (
        <>
          {props.libraryTarget && (
            <GuideResourceTrigger
              t={t}
              disabled={disabled}
              target={{ kind: 'replace-image', ...props.libraryTarget }}
              title={t('scenario.editor.guideReplaceImage')}
            />
          )}
          {props.onEdit && (
            <ContentToolbarButton
              title={t('scenario.editor.guideEditImage')}
              aria-label={t('scenario.editor.guideEditImage')}
              data-edit-image
              disabled={disabled || !url}
              onClick={props.onEdit}
            >
              <Pencil size={16} aria-hidden="true" />
            </ContentToolbarButton>
          )}
        </>
      )}
      <ContentToolbarButton
        ref={props.trigger}
        data-frame-image
        disabled={disabled || !url}
        title={t(
          editing ? 'scenario.editor.guideImageDone' : 'scenario.editor.guideEditImageFrame'
        )}
        aria-label={t(
          editing ? 'scenario.editor.guideImageDone' : 'scenario.editor.guideEditImageFrame'
        )}
        aria-expanded={editing}
        onClick={() => (editing ? props.close(true) : props.onEditingChange(true))}
      >
        {editing ? (
          <>
            <Check size={16} aria-hidden="true" />
            <span>{t('scenario.editor.guideImageDone')}</span>
          </>
        ) : (
          <Crop size={16} aria-hidden="true" />
        )}
      </ContentToolbarButton>
    </div>
  );
}
function FramingTools({ t, bounds, boundsDisabled, disabled, toggleBounds, close }: ToolsProps) {
  return (
    <>
      <ContentToolbarButton
        title={t('scenario.editor.guideCropBounds')}
        aria-label={t('scenario.editor.guideCropBounds')}
        aria-pressed={bounds}
        disabled={boundsDisabled}
        onClick={toggleBounds}
      >
        <Magnet size={16} aria-hidden="true" />
      </ContentToolbarButton>
      <ContentToolbarButton
        title={t('common.actions.cancel')}
        aria-label={t('common.actions.cancel')}
        disabled={disabled}
        onClick={() => close(false)}
      >
        <X size={16} aria-hidden="true" />
        <span>{t('common.actions.cancel')}</span>
      </ContentToolbarButton>
    </>
  );
}
