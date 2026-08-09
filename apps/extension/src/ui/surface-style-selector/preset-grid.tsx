import { serializePaintToCss } from '@sniptale/foundation/paint';
import type { SurfaceStyle } from '@sniptale/runtime-contracts/highlighter/surface-style';
import { translate } from '../../platform/i18n';
import { projectCanonicalSurfaceCss } from '../../features/highlighter/surface-style/surface-css';
import type { SurfaceStyleSelectorProps } from './types';

export function SurfaceStylePresetGrid(props: {
  actions: SurfaceStyleSelectorProps['actions'];
  draft: SurfaceStyle;
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
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {props.presets.map((preset) => (
        <div
          key={preset.id}
          className="min-w-0 rounded-[8px] border border-[var(--sniptale-color-border-soft)] p-1"
        >
          <button
            type="button"
            className="w-full text-left text-xs"
            onClick={() =>
              props.onDraftChange({
                fillPaint: structuredClone(preset.style.fillPaint),
                surfaceCss: preset.style.surfaceCss,
              })
            }
          >
            <span
              className="mb-1 block h-10 rounded-[6px] border border-[var(--sniptale-color-border-soft)]"
              style={{
                background: serializePaintToCss(preset.style.fillPaint),
                ...(projectCanonicalSurfaceCss(preset.style.surfaceCss) ?? {}),
              }}
            />
            <span className="block truncate">
              {preset.favorite ? '★ ' : ''}
              {preset.name}
            </span>
          </button>
          <div className="mt-1 flex flex-wrap gap-1">
            <button
              type="button"
              aria-label={translate('content.callout.surfaceStyle.favorite')}
              onClick={() => void props.actions.onToggleFavorite(preset.id)}
            >
              ★
            </button>
            <button
              type="button"
              aria-label={translate('content.callout.surfaceStyle.duplicate')}
              onClick={() =>
                void props.actions.onDuplicate(
                  preset.id,
                  `${preset.name}${translate('content.callout.surfaceStyle.duplicateNameSuffix')}`
                )
              }
            >
              ⧉
            </button>
            {preset.origin === 'user' ? (
              <>
                <button
                  type="button"
                  aria-label={translate('content.callout.surfaceStyle.update')}
                  onClick={() => void props.actions.onUpdate(preset.id, props.draft)}
                >
                  ↻
                </button>
                <button
                  type="button"
                  aria-label={translate('content.callout.surfaceStyle.rename')}
                  onClick={() =>
                    props.name.trim() && void props.actions.onRename(preset.id, props.name.trim())
                  }
                >
                  ✎
                </button>
                <button
                  type="button"
                  aria-label={translate('content.callout.surfaceStyle.delete')}
                  onClick={() => void props.actions.onDelete(preset.id)}
                >
                  ×
                </button>
                <button
                  type="button"
                  aria-label={translate('content.callout.surfaceStyle.moveUp')}
                  onClick={() => move(preset.id, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={translate('content.callout.surfaceStyle.moveDown')}
                  onClick={() => move(preset.id, 1)}
                >
                  ↓
                </button>
              </>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
