import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { translate } from '../../platform/i18n';
import { isImageSnapshotCurrent } from '../controller/ai-image/snapshot';
import type { ImageResultFitting } from '../controller/ai-image/apply';
import type { ImageApplyController } from '../controller/ai-image/types';
import type { ImageEditorSession, ImageSessionState } from './session';
import { INSPECTOR_INLINE_BUTTON_CLASS_NAME } from '../inspector/chrome';

/** Applies through the existing document owner. Only a successful receipt completes the current task. */
export function ImageResults(props: {
  session: ImageEditorSession;
  state: ImageSessionState;
  controller: ImageApplyController;
  fitting: ImageResultFitting;
  ready: boolean;
  onFinish(): void;
}) {
  const step = props.state.steps.find((entry) => entry.id === props.state.selected?.stepId);
  const result = props.session.getSelectedVariant();
  if (!step || !result) return null;
  const source = step.snapshot;
  const sameDocument =
    props.controller.canvas === source.canvas &&
    props.controller.originalDocument === source.originalDocument &&
    props.controller.source?.id === source.sourceId;
  const current = isImageSnapshotCurrent(props.controller, source);
  const busy = props.state.status !== 'idle';
  const unavailable = busy || !props.ready;
  const update =
    sameDocument &&
    props.session.canUpdate() &&
    !props.session.isApplied('update') &&
    !props.session.isApplied('add') &&
    !props.session.isApplied('replace');
  const add = sameDocument && !props.session.isApplied('add');
  const replace =
    sameDocument && current && source.replacementAllowed && !props.session.isApplied('replace');
  const apply = async (mode: 'add' | 'replace' | 'update') => {
    await props.session.apply(mode, true, translate('editor.ai.newLayerName'), props.fitting);
    const latest = props.session.getSnapshot();
    if (!latest.error && latest.selected?.stepId === step.id && props.session.isApplied(mode))
      props.onFinish();
  };
  return (
    <div
      className={[
        'flex shrink-0 items-center justify-between gap-3 border-t',
        'border-[var(--sniptale-color-border-soft)] p-2',
      ].join(' ')}
      data-ui="editor.ai.result"
    >
      <ProductActionButton
        compact
        tone="secondary"
        className={`${INSPECTOR_INLINE_BUTTON_CLASS_NAME} shrink-0`}
        disabled={busy}
        onClick={props.onFinish}
      >
        {translate(step.applied ? 'editor.ai.finishTask' : 'editor.ai.cancelPreview')}
      </ProductActionButton>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">
        {source.intention === 'new-image' || !sameDocument ? (
          <ProductActionButton
            compact
            tone="secondary"
            className={INSPECTOR_INLINE_BUTTON_CLASS_NAME}
            disabled={busy}
            onClick={async () => {
              await props.session.openDocument(translate('editor.ai.newLayerName'));
              const latest = props.session.getSnapshot();
              if (!latest.error && latest.selected?.stepId === step.id) props.onFinish();
            }}
          >
            {translate('editor.ai.openDocument')}
          </ProductActionButton>
        ) : null}
        {replace ? (
          <ProductActionButton
            compact
            tone="secondary"
            className={INSPECTOR_INLINE_BUTTON_CLASS_NAME}
            disabled={unavailable}
            onClick={() => void apply('replace')}
          >
            {translate('editor.ai.replace')}
          </ProductActionButton>
        ) : null}
        {add ? (
          <ProductActionButton
            compact
            tone={update ? 'secondary' : 'primary'}
            className="!h-8 !min-h-8 !rounded-[4px] !px-3"
            disabled={unavailable}
            onClick={() => void apply('add')}
          >
            {translate('editor.ai.apply')}
          </ProductActionButton>
        ) : null}
        {update ? (
          <ProductActionButton
            compact
            className="!h-8 !min-h-8 !rounded-[4px] !px-3"
            disabled={unavailable}
            onClick={() => void apply('update')}
          >
            {translate('editor.ai.update')}
          </ProductActionButton>
        ) : null}
      </div>
    </div>
  );
}
