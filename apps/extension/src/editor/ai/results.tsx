import { Eye } from 'lucide-react';
import { useImagePreview } from './preview';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { formatNumber, translate } from '../../platform/i18n';
import { isImageSnapshotCurrent } from '../controller/ai-image/snapshot';
import type { ImageApplyController } from '../controller/ai-image/types';
import type { ImageEditorSession, ImageSessionState } from './session';
import {
  INSPECTOR_PRIMARY_BUTTON_CLASS_NAME,
  INSPECTOR_SECONDARY_BUTTON_CLASS_NAME,
} from '../inspector/chrome';

/** Previews remain disposable. Only the Apply commands call the document mutation owner. */
export function ImageResults(props: {
  session: ImageEditorSession;
  state: ImageSessionState;
  controller: ImageApplyController;
}) {
  const preview = useImagePreview();
  const step = props.state.steps.find((entry) => entry.id === props.state.selected?.stepId);
  const result = props.session.getSelectedVariant();
  if (!step || !result) return null;
  const source = step.snapshot;
  const current = isImageSnapshotCurrent(props.controller, source);
  const busy = props.state.status !== 'idle';
  const applyDisabled = busy;
  return (
    <div className="space-y-2" data-ui="editor.ai.result">
      <div className="flex items-center justify-between gap-2">
        <ProductActionButton
          compact
          tone="secondary"
          className={`${INSPECTOR_SECONDARY_BUTTON_CLASS_NAME} !w-auto flex-1`}
          onClick={(event) => preview.openResult(event.currentTarget)}
        >
          <Eye size={14} />
          {translate('editor.ai.openPreview')}
        </ProductActionButton>
        <span className="text-xs tabular-nums">
          {result.image.width} × {result.image.height}
        </span>
      </div>
      {result.costRub !== undefined ? (
        <p className="text-xs text-[var(--sniptale-color-text-secondary)]">
          {formatNumber(result.costRub, { maximumFractionDigits: 2 })} ₽
        </p>
      ) : null}
      {!current ? (
        <p role="status" className="text-xs text-[var(--sniptale-color-text-secondary)]">
          {translate('editor.ai.stale')}
        </p>
      ) : null}
      {source.intention === 'source' && !source.replacementAllowed ? (
        <p role="status" className="text-xs text-[var(--sniptale-color-text-secondary)]">
          {translate('editor.ai.sourceLocked')}
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-1">
        {props.session.canUpdate() ? (
          <ProductActionButton
            compact
            className={INSPECTOR_PRIMARY_BUTTON_CLASS_NAME}
            disabled={applyDisabled || props.session.isApplied('update')}
            onClick={() =>
              void props.session.apply('update', true, translate('editor.ai.newLayerName'))
            }
          >
            {translate('editor.ai.update')}
          </ProductActionButton>
        ) : null}
        <ProductActionButton
          compact
          tone="secondary"
          className={
            props.session.canUpdate()
              ? INSPECTOR_SECONDARY_BUTTON_CLASS_NAME
              : INSPECTOR_PRIMARY_BUTTON_CLASS_NAME
          }
          disabled={applyDisabled || props.session.isApplied('add')}
          onClick={() => void props.session.apply('add', true, translate('editor.ai.newLayerName'))}
        >
          {translate('editor.ai.apply')}
        </ProductActionButton>
        {source.replacementAllowed ? (
          <ProductActionButton
            compact
            tone="secondary"
            className={INSPECTOR_SECONDARY_BUTTON_CLASS_NAME}
            disabled={applyDisabled || props.session.isApplied('replace') || !current}
            onClick={() =>
              void props.session.apply('replace', true, translate('editor.ai.newLayerName'))
            }
          >
            {translate('editor.ai.replace')}
          </ProductActionButton>
        ) : null}
        {source.intention === 'new-image' ? (
          <ProductActionButton
            compact
            tone="secondary"
            className={INSPECTOR_SECONDARY_BUTTON_CLASS_NAME}
            disabled={busy}
            onClick={() => void props.session.openDocument(translate('editor.ai.newLayerName'))}
          >
            {translate('editor.ai.openDocument')}
          </ProductActionButton>
        ) : null}
      </div>
    </div>
  );
}
