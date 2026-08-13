import type { SurfaceStyle } from '@sniptale/runtime-contracts/highlighter/surface-style';
import { translate } from '../../platform/i18n';
import { CompactPaintSelector } from '../paint-selector';
import type { SurfaceStyleSelectorProps } from './types';

const FIELD_CLASS_NAME = [
  'w-full rounded-[9px] border px-2.5 text-xs outline-none transition',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_68%,transparent)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_72%,transparent)]',
  'text-[var(--sniptale-color-text-primary)]',
  'focus:border-[color:color-mix(in_srgb,var(--sniptale-color-accent)_55%,var(--sniptale-color-border-soft))]',
  'focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--sniptale-color-accent)_14%,transparent)]',
].join(' ');
const BUTTON_CLASS_NAME = [
  'min-h-8 rounded-[8px] border px-3 text-xs font-semibold transition',
  'border-[var(--sniptale-color-border-soft)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_88%,var(--sniptale-color-surface-canvas)_12%)]',
  'text-[var(--sniptale-color-text-secondary)] hover:text-[var(--sniptale-color-text-primary)]',
  'disabled:cursor-not-allowed disabled:opacity-45',
].join(' ');
const EDITOR_CLASS_NAME = [
  'grid gap-3 rounded-[11px] border p-2.5',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_54%,transparent)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-muted)_34%,transparent)]',
].join(' ');
const ALERT_CLASS_NAME = [
  'rounded-[8px] px-2.5 py-2 text-xs',
  'bg-[var(--sniptale-color-danger-soft)] text-[var(--sniptale-color-danger)]',
].join(' ');
const APPLY_BUTTON_CLASS_NAME = [
  BUTTON_CLASS_NAME,
  'bg-[var(--sniptale-color-accent)] text-white hover:text-white',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-accent)_55%,var(--sniptale-color-border-soft))]',
].join(' ');

export function SurfaceStyleEditorPanel(props: {
  actions: SurfaceStyleSelectorProps['actions'];
  canonicalCss: string | null;
  disabled?: boolean;
  draft: SurfaceStyle;
  name: string;
  onApply: () => void;
  onCancel: () => void;
  onDraftChange: (style: SurfaceStyle) => void;
  onNameChange: (name: string) => void;
}) {
  return (
    <div className={EDITOR_CLASS_NAME}>
      <CompactPaintSelector
        {...(props.disabled === undefined ? {} : { disabled: props.disabled })}
        label={translate('content.callout.surfaceStyle.paint')}
        title={translate('content.callout.surfaceStyle.paint')}
        value={props.draft.fillPaint}
        onChange={(fillPaint) => props.onDraftChange({ ...props.draft, fillPaint })}
      />
      <label className="grid gap-1.5 text-[11px] font-medium text-[var(--sniptale-color-text-muted)]">
        {translate('content.callout.surfaceStyle.advancedCss')}
        <textarea
          value={props.draft.surfaceCss}
          maxLength={4000}
          rows={5}
          className={`${FIELD_CLASS_NAME} min-h-24 resize-y py-2 font-mono leading-relaxed`}
          onChange={(event) =>
            props.onDraftChange({ ...props.draft, surfaceCss: event.target.value })
          }
        />
      </label>
      {props.canonicalCss === null ? (
        <div className={ALERT_CLASS_NAME} role="alert">
          {translate('content.callout.surfaceStyle.cssInvalid')}
        </div>
      ) : null}
      <label className="grid gap-1.5 text-[11px] font-medium text-[var(--sniptale-color-text-muted)]">
        {translate('content.callout.surfaceStyle.name')}
        <input
          aria-label={translate('content.callout.surfaceStyle.name')}
          className={`${FIELD_CLASS_NAME} h-9`}
          maxLength={80}
          value={props.name}
          onChange={(event) => props.onNameChange(event.target.value)}
        />
      </label>
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          className={`${BUTTON_CLASS_NAME} mr-auto`}
          disabled={!props.name.trim() || props.canonicalCss === null}
          onClick={() =>
            void props.actions.onCreate(props.name.trim(), {
              ...props.draft,
              surfaceCss: props.canonicalCss ?? '',
            })
          }
        >
          {translate('content.callout.surfaceStyle.create')}
        </button>
        <button
          type="button"
          className={BUTTON_CLASS_NAME}
          data-ui="surface-style.cancel"
          onClick={props.onCancel}
        >
          {translate('content.callout.surfaceStyle.cancel')}
        </button>
        <button
          type="button"
          className={APPLY_BUTTON_CLASS_NAME}
          data-ui="surface-style.apply"
          disabled={props.canonicalCss === null}
          onClick={props.onApply}
        >
          {translate('content.callout.surfaceStyle.apply')}
        </button>
      </div>
    </div>
  );
}
