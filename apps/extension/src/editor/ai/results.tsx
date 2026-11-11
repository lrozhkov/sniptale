import { useState } from 'react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import type { ImageRaster } from '../../contracts/ai/image';
import { formatNumber, translate } from '../../platform/i18n';
import { isImageSnapshotCurrent } from '../controller/ai-image/snapshot';
import type { ImageApplyController } from '../controller/ai-image/types';
import type { ImageEditorSession, ImageSessionState } from './session';

function ImageResultPreview({
  original,
  image,
}: {
  original: ImageRaster | null;
  image: ImageRaster;
}) {
  const [compare, setCompare] = useState(false);
  return (
    <>
      <div className="flex gap-1">
        <ProductActionButton
          compact
          tone="toggle"
          active={!compare}
          onClick={() => setCompare(false)}
        >
          {translate('editor.ai.result')}
        </ProductActionButton>
        {original ? (
          <ProductActionButton
            compact
            tone="toggle"
            active={compare}
            onClick={() => setCompare(true)}
          >
            {translate('editor.ai.original')}
          </ProductActionButton>
        ) : null}
        <span className="ml-auto self-center text-xs tabular-nums">
          {image.width} × {image.height}
        </span>
      </div>
      <img
        src={compare && original ? original.dataUrl : image.dataUrl}
        alt={translate(compare ? 'editor.ai.original' : 'editor.ai.result')}
        className="max-h-[min(10rem,24vh)] w-full rounded-[4px] object-contain"
      />
    </>
  );
}

function ImageResultVariants({
  variants,
  selectedIndex,
  busy,
  onChoose,
}: {
  variants: ImageSessionState['steps'][number]['variants'];
  selectedIndex: number | undefined;
  busy: boolean;
  onChoose(index: number): void;
}) {
  return variants.filter(Boolean).length > 1 ? (
    <div className="flex flex-wrap gap-2">
      {variants.map((variant, index) =>
        variant ? (
          <button
            key={index}
            type="button"
            disabled={busy}
            aria-pressed={selectedIndex === index}
            aria-label={`${translate('editor.ai.variants')} ${index + 1}`}
            onClick={() => onChoose(index)}
            className={[
              'rounded-[4px] border p-0.5',
              selectedIndex === index
                ? 'border-[var(--sniptale-color-accent)]'
                : 'border-[var(--sniptale-color-border-soft)]',
            ].join(' ')}
          >
            <img src={variant.image.dataUrl} alt="" className="h-12 w-16 object-contain" />
          </button>
        ) : null
      )}
    </div>
  ) : null;
}

/** Previews remain disposable. Only the Apply commands call the document mutation owner. */
export function ImageResults(props: {
  session: ImageEditorSession;
  state: ImageSessionState;
  controller: ImageApplyController;
}) {
  const [fit, setFit] = useState(false);
  const step = props.state.steps.find((entry) => entry.id === props.state.selected?.stepId);
  const result = props.session.getSelectedVariant();
  if (!step || !result) return null;
  const source = step.snapshot;
  const mismatch =
    source.intention !== 'new-image' &&
    (result.image.width !== source.inputBounds.width ||
      result.image.height !== source.inputBounds.height);
  const current = isImageSnapshotCurrent(props.controller, source);
  const busy = props.state.status !== 'idle';
  const applyDisabled = busy || (mismatch && !fit);
  return (
    <div className="space-y-2" data-ui="editor.ai.result">
      <ImageResultPreview original={source.raster} image={result.image} />
      <ImageResultVariants
        variants={step.variants}
        selectedIndex={props.state.selected?.variant}
        busy={busy}
        onChoose={(index) => props.session.chooseVariant(step.id, index)}
      />
      {result.costRub !== undefined ? (
        <p className="text-xs text-[var(--sniptale-color-text-secondary)]">
          {formatNumber(result.costRub, { maximumFractionDigits: 2 })} ₽
        </p>
      ) : null}
      {mismatch ? (
        <>
          <p className="text-xs text-[var(--sniptale-color-text-secondary)]">
            {translate('editor.ai.sizeMismatch')}
          </p>
          <label className="flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              checked={fit}
              onChange={(event) => setFit(event.currentTarget.checked)}
              className="sniptale-parameter-check"
            />
            {translate('editor.ai.fit')}
          </label>
        </>
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
      <div className="flex flex-wrap gap-2">
        {props.session.canUpdate() ? (
          <ProductActionButton
            compact
            disabled={applyDisabled || props.session.isApplied('update')}
            onClick={() =>
              void props.session.apply('update', fit, translate('editor.ai.newLayerName'))
            }
          >
            {translate('editor.ai.update')}
          </ProductActionButton>
        ) : null}
        <ProductActionButton
          compact
          tone="secondary"
          disabled={applyDisabled || props.session.isApplied('add')}
          onClick={() => void props.session.apply('add', fit, translate('editor.ai.newLayerName'))}
        >
          {translate('editor.ai.apply')}
        </ProductActionButton>
        {source.replacementAllowed ? (
          <ProductActionButton
            compact
            tone="secondary"
            disabled={applyDisabled || props.session.isApplied('replace') || !current}
            onClick={() =>
              void props.session.apply('replace', fit, translate('editor.ai.newLayerName'))
            }
          >
            {translate('editor.ai.replace')}
          </ProductActionButton>
        ) : null}
        {source.intention === 'new-image' ? (
          <ProductActionButton
            compact
            tone="secondary"
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
