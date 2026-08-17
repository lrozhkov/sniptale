import { serializePaintToCss } from '@sniptale/foundation/paint';
import { Check, Copy, Heart, Pencil, RefreshCw, Trash2, ArrowDown, ArrowUp } from 'lucide-react';
import { ProductGlassIconButton } from '@sniptale/ui/product-glass-controls';
import type { SurfaceStyle } from '@sniptale/runtime-contracts/highlighter/surface-style';
import { translate } from '../../platform/i18n';
import { projectCanonicalSurfaceCss } from '../../features/highlighter/surface-style/surface-css';
import type { SurfaceStyleSelectorProps } from './types';
import { matchSurfaceStylePreset } from '../../features/highlighter/surface-style/operations';

const PRESET_SELECTED_CLASS_NAME = [
  'border-[color:color-mix(in_srgb,var(--sniptale-color-accent)_58%,var(--sniptale-color-border-soft))]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent)_9%,transparent)]',
  'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_10%,transparent)]',
].join(' ');
const PRESET_IDLE_CLASS_NAME = [
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_62%,transparent)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-muted)_38%,transparent)]',
  'hover:border-[color:color-mix(in_srgb,var(--sniptale-color-accent)_35%,var(--sniptale-color-border-soft))]',
].join(' ');
const PREVIEW_CLASS_NAME = [
  'block h-6 w-9 shrink-0 overflow-hidden rounded-[6px] border bg-white shadow-sm',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_76%,transparent)]',
].join(' ');
const SELECTED_MARK_CLASS_NAME = [
  'flex h-5 w-5 shrink-0 items-center justify-center',
  'text-[var(--sniptale-color-accent-emphasis)]',
].join(' ');
const ACTIONS_CLASS_NAME = [
  'mt-1.5 flex flex-wrap gap-1 border-t pt-1.5',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_46%,transparent)]',
].join(' ');
const PRESET_BUTTON_CLASS_NAME = [
  'relative flex w-full items-center gap-2 rounded-[8px] text-left text-xs outline-none',
  'focus-visible:shadow-[inset_0_0_0_1px_var(--sniptale-color-border-accent-strong)]',
].join(' ');

export function SurfaceStylePresetGrid(props: {
  actions: SurfaceStyleSelectorProps['actions'];
  draft: SurfaceStyle;
  selectionOnly?: boolean;
  name: string;
  onDraftChange: (style: SurfaceStyle) => void;
  presets: SurfaceStyleSelectorProps['presets'];
}) {
  const userIds = props.presets
    .filter((preset) => preset.origin === 'user')
    .map((preset) => preset.id);
  const move = (id: string, offset: number) => {
    const index = userIds.indexOf(id);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= userIds.length) return;
    const next = [...userIds];
    [next[index], next[target]] = [next[target]!, next[index]!];
    void props.actions.onReorder(next);
  };

  return (
    <div
      className={
        props.selectionOnly
          ? 'grid max-h-[12rem] grid-cols-1 gap-1 overflow-y-auto overscroll-contain pr-1'
          : 'grid grid-cols-1 gap-2 sm:grid-cols-2'
      }
    >
      {props.presets.map((preset) => {
        const selected = matchSurfaceStylePreset(props.draft, [preset]) !== null;
        return (
          <div
            key={preset.id}
            className={[
              'group min-w-0 rounded-[9px] border p-1 transition',
              selected ? PRESET_SELECTED_CLASS_NAME : PRESET_IDLE_CLASS_NAME,
            ].join(' ')}
          >
            <button
              type="button"
              aria-pressed={selected}
              className={PRESET_BUTTON_CLASS_NAME}
              onClick={() =>
                props.onDraftChange({
                  fillPaint: structuredClone(preset.style.fillPaint),
                  surfaceCss: preset.style.surfaceCss,
                })
              }
            >
              <span
                className={PREVIEW_CLASS_NAME}
                style={{
                  backgroundImage: 'conic-gradient(#d1d5db 25%, #fff 0 50%, #d1d5db 0 75%, #fff 0)',
                  backgroundSize: '8px 8px',
                }}
              >
                <span
                  className="block h-full w-full"
                  style={{
                    background: serializePaintToCss(preset.style.fillPaint),
                    ...(projectCanonicalSurfaceCss(preset.style.surfaceCss) ?? {}),
                  }}
                />
              </span>
              <span className="min-w-0 flex-1 truncate px-0.5 font-medium">
                {!props.selectionOnly && preset.favorite ? '★ ' : ''}
                {preset.name}
              </span>
              {selected ? (
                <span className={SELECTED_MARK_CLASS_NAME}>
                  <Check aria-hidden="true" size={16} strokeWidth={2} />
                </span>
              ) : null}
            </button>
            {!props.selectionOnly ? (
              <div className={ACTIONS_CLASS_NAME}>
                <ProductGlassIconButton
                  aria-label={translate('content.callout.surfaceStyle.favorite')}
                  active={preset.favorite}
                  onClick={() => void props.actions.onToggleFavorite(preset.id)}
                  title={translate('content.callout.surfaceStyle.favorite')}
                >
                  <Heart aria-hidden="true" size={13} />
                </ProductGlassIconButton>
                <ProductGlassIconButton
                  aria-label={translate('content.callout.surfaceStyle.duplicate')}
                  onClick={() =>
                    void props.actions.onDuplicate(
                      preset.id,
                      `${preset.name}${translate('content.callout.surfaceStyle.duplicateNameSuffix')}`
                    )
                  }
                  title={translate('content.callout.surfaceStyle.duplicate')}
                >
                  <Copy aria-hidden="true" size={13} />
                </ProductGlassIconButton>
                {preset.origin === 'user' ? (
                  <>
                    <ProductGlassIconButton
                      aria-label={translate('content.callout.surfaceStyle.update')}
                      onClick={() => void props.actions.onUpdate(preset.id, props.draft)}
                      title={translate('content.callout.surfaceStyle.update')}
                    >
                      <RefreshCw aria-hidden="true" size={13} />
                    </ProductGlassIconButton>
                    <ProductGlassIconButton
                      aria-label={translate('content.callout.surfaceStyle.rename')}
                      onClick={() =>
                        props.name.trim() &&
                        void props.actions.onRename(preset.id, props.name.trim())
                      }
                      title={translate('content.callout.surfaceStyle.rename')}
                    >
                      <Pencil aria-hidden="true" size={13} />
                    </ProductGlassIconButton>
                    <ProductGlassIconButton
                      aria-label={translate('content.callout.surfaceStyle.delete')}
                      onClick={() => void props.actions.onDelete(preset.id)}
                      title={translate('content.callout.surfaceStyle.delete')}
                    >
                      <Trash2 aria-hidden="true" size={13} />
                    </ProductGlassIconButton>
                    <ProductGlassIconButton
                      aria-label={translate('content.callout.surfaceStyle.moveUp')}
                      onClick={() => move(preset.id, -1)}
                      title={translate('content.callout.surfaceStyle.moveUp')}
                    >
                      <ArrowUp aria-hidden="true" size={13} />
                    </ProductGlassIconButton>
                    <ProductGlassIconButton
                      aria-label={translate('content.callout.surfaceStyle.moveDown')}
                      onClick={() => move(preset.id, 1)}
                      title={translate('content.callout.surfaceStyle.moveDown')}
                    >
                      <ArrowDown aria-hidden="true" size={13} />
                    </ProductGlassIconButton>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
