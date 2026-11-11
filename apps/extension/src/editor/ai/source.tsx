import { useImagePreview } from './preview';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { translate } from '../../platform/i18n';
import { CompactSelect, SelectField } from '../chrome/ui';
import type { EditorImageSnapshot, ImageBounds } from '../controller/ai-image/types';
import type { ImageEditorSession, ImageSessionState } from './session';
import { INSPECTOR_SECONDARY_BUTTON_CLASS_NAME } from '../inspector/chrome';

function ImageSourcePreview({ snapshot }: { snapshot: EditorImageSnapshot }) {
  const preview = useImagePreview();
  return snapshot.raster ? (
    <details className="text-xs">
      <summary className="flex cursor-pointer items-center gap-2">
        <img src={snapshot.raster.dataUrl} alt="" className="h-10 w-14 object-contain" />
        <span>
          {translate('editor.ai.sourcePreview')} · {snapshot.raster.width} ×{' '}
          {snapshot.raster.height}
        </span>
      </summary>
      <ProductActionButton
        compact
        tone="secondary"
        className={`${INSPECTOR_SECONDARY_BUTTON_CLASS_NAME} my-2`}
        onClick={(event) => preview.openSource(event.currentTarget)}
      >
        {translate('editor.ai.openSourcePreview')}
      </ProductActionButton>
      {snapshot.inputBounds.width !== snapshot.captureBounds.width ||
      snapshot.inputBounds.height !== snapshot.captureBounds.height ? (
        <p className="my-2 text-[var(--sniptale-color-text-secondary)]">
          {translate('editor.ai.nativePadding')}
        </p>
      ) : null}
      {snapshot.intention === 'layers' ? (
        <ul className="space-y-1 break-words">
          {snapshot.names.map((name, i) => (
            <li key={i}>{name}</li>
          ))}
        </ul>
      ) : null}
      <p className="mt-2 text-[var(--sniptale-color-text-secondary)]">
        {translate('editor.ai.sourceFrozen')}
      </p>
    </details>
  ) : null;
}

/** Selects the source directly; local preparation follows the chosen source automatically. */
export function ImageSourceControls({
  session,
  state,
  region,
  selectedCount,
  busy,
  onSelectRegion,
  pickingRegion,
}: {
  session: Pick<ImageEditorSession, 'setDraft' | 'refreshSource'>;
  state: Pick<ImageSessionState, 'source' | 'draft'>;
  region: ImageBounds | null;
  selectedCount: number;
  busy: boolean;
  onSelectRegion(): void;
  pickingRegion: boolean;
}) {
  const describedRegion = state.source?.intention === 'region' ? state.source.targetBounds : region;
  const describedLayerCount =
    state.source?.intention === 'layers' ? state.source.sources.length : selectedCount;
  const regionSize = describedRegion
    ? ` · ${Math.round(describedRegion.width)} × ${Math.round(describedRegion.height)}`
    : '';
  const intentions = [
    {
      value: 'region',
      label: `${translate('editor.ai.region')}${regionSize}`,
    },
    { value: 'source', label: translate('editor.ai.main') },
    { value: 'layers', label: `${translate('editor.ai.layers')} · ${describedLayerCount}` },
    { value: 'new-image', label: translate('editor.ai.newImage') },
  ] as const;
  return (
    <>
      <CompactSelect
        aria-label={translate('editor.ai.source')}
        value={pickingRegion ? 'region' : state.draft.intention}
        options={intentions}
        disabled={busy}
        onChange={(intention) => {
          if (intention === 'region') onSelectRegion();
          else session.setDraft({ intention, regionSource: 'canvas' });
        }}
      />
      {pickingRegion || state.draft.intention === 'region' ? (
        <div className="space-y-1">
          <ProductActionButton
            compact
            tone="secondary"
            className={INSPECTOR_SECONDARY_BUTTON_CLASS_NAME}
            disabled={busy}
            onClick={onSelectRegion}
          >
            {translate('editor.ai.selectRegion')}
          </ProductActionButton>
          <details className="text-xs">
            <summary className="cursor-pointer py-1 text-[var(--sniptale-color-text-secondary)]">
              {translate('editor.ai.context')}
            </summary>
            <SelectField
              label={translate('editor.ai.context')}
              value={state.draft.context}
              options={[
                { value: 'region', label: translate('editor.ai.regionOnly') },
                { value: 'surroundings', label: translate('editor.ai.surroundings') },
                { value: 'whole', label: translate('editor.ai.whole') },
              ]}
              disabled={busy}
              onChange={(context) => session.setDraft({ context })}
            />
          </details>
        </div>
      ) : null}
      {state.source ? <ImageSourcePreview snapshot={state.source} /> : null}
      {state.draft.intention === 'layers' ? (
        <p className="text-xs text-[var(--sniptale-color-text-secondary)]">
          {translate('editor.ai.layersNotice')}
        </p>
      ) : null}
    </>
  );
}
