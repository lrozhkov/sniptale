import {
  arePaintsEqual,
  serializePaintToCss,
  type Gradient,
  type GradientType,
} from '@sniptale/foundation/paint';
import { ProductGlassIconButton } from '@sniptale/ui/product-glass-controls';
import { Copy } from 'lucide-react';
import { useGradientPresetCatalog } from '../../composition/gradient-preset-resources/use-gradient-preset-catalog';
import { translate } from '../../platform/i18n';

const COPY_ACTION_CLASS_NAME = [
  'pointer-events-none !h-7 !w-7 !border-0 !bg-transparent !shadow-none opacity-0 transition-opacity',
  'group-hover:pointer-events-auto group-hover:opacity-100',
  'group-focus-within:pointer-events-auto group-focus-within:opacity-100',
  'focus-visible:pointer-events-auto focus-visible:opacity-100',
].join(' ');

export function GradientTemplatePanel(props: {
  activeGradient?: Gradient;
  allowedModes?: readonly ('solid' | GradientType)[];
  onCopy: (gradient: Gradient) => void;
  onSelect: (gradient: Gradient) => void;
}) {
  const resources = useGradientPresetCatalog('highlighter-frame-fill');
  const templates = resources.presets.filter(
    (preset) => preset.enabled && (props.allowedModes?.includes(preset.gradient.type) ?? true)
  );

  return (
    <div
      className="grid max-h-[11.25rem] gap-1.5 overflow-y-auto overscroll-contain pr-1"
      data-ui="shared.ui.paint-selector.templates"
    >
      {templates.length === 0 ? (
        <p
          className="px-3 py-5 text-center text-xs text-[var(--sniptale-color-text-muted)]"
          data-ui="shared.ui.paint-selector.templates-empty"
        >
          {translate('highlighter.paintPicker.presetsEmpty')}
        </p>
      ) : null}
      {templates.map((template) => {
        const active =
          props.activeGradient !== undefined &&
          arePaintsEqual(
            { kind: 'gradient', gradient: props.activeGradient },
            { kind: 'gradient', gradient: template.gradient }
          );
        return (
          <div
            key={template.id}
            className={[
              'group flex min-w-0 items-center gap-1 rounded-[9px] border p-1 transition',
              active
                ? 'border-[var(--sniptale-color-border-accent-strong)]'
                : 'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_58%,transparent)]',
              'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-muted)_38%,transparent)]',
              'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-muted)_72%,transparent)]',
            ].join(' ')}
          >
            <button
              type="button"
              aria-label={template.name}
              aria-pressed={active}
              className={[
                'flex min-w-0 flex-1 items-center gap-2 rounded-[7px] p-0.5 text-left outline-none',
                'focus-visible:shadow-[inset_0_0_0_1px_var(--sniptale-color-border-accent-strong)]',
              ].join(' ')}
              onClick={() => props.onSelect(structuredClone(template.gradient))}
            >
              <span
                aria-hidden="true"
                className="h-6 w-10 shrink-0 rounded-[6px] border border-[var(--sniptale-color-border-soft)]"
                style={{
                  background: serializePaintToCss({
                    kind: 'gradient',
                    gradient: template.gradient,
                  }),
                }}
              />
              <span className="min-w-0 flex-1 truncate text-xs font-semibold">{template.name}</span>
            </button>
            <ProductGlassIconButton
              aria-label={`${translate('highlighter.paintPicker.copyPreset')}: ${template.name}`}
              className={COPY_ACTION_CLASS_NAME}
              onClick={() => props.onCopy(structuredClone(template.gradient))}
            >
              <Copy aria-hidden="true" size={14} />
            </ProductGlassIconButton>
          </div>
        );
      })}
    </div>
  );
}
