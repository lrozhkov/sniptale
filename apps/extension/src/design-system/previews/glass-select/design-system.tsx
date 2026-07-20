import type { AppLocale } from '../../../platform/i18n';
import { getSharedPreviewCopy } from '../support/common';
import { designSystemPreview, type DesignSystemVariantPreview } from '../support/provider';
import { GlassSelect } from '../../../ui/glass-select/index';

function renderGlassSelectPreview(
  value: string,
  ariaLabel: string,
  options: Array<{ value: string; label: string; description?: string }>,
  props?: Partial<React.ComponentProps<typeof GlassSelect>>
) {
  return (
    <div className="w-full max-w-[320px]">
      <GlassSelect
        value={value}
        onChange={() => undefined}
        options={options}
        aria-label={ariaLabel}
        {...props}
      />
    </div>
  );
}

function renderGlassSelectPortalPreview(
  optionCopy: Array<{ value: string; label: string; description?: string }>,
  portalSelectAria: string,
  portalNote: string
) {
  return (
    <div className="w-full max-w-[320px] space-y-3">
      <GlassSelect
        value="screen"
        onChange={() => undefined}
        options={optionCopy}
        portal
        aria-label={portalSelectAria}
      />
      <div
        className={[
          'rounded-[12px] border border-[var(--sniptale-color-border-soft)]',
          'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_72%,transparent)]',
          'px-3 py-2 text-xs text-[var(--sniptale-color-text-secondary)]',
        ].join(' ')}
      >
        {portalNote}
      </div>
    </div>
  );
}

export function buildGlassSelectSharedPreviews(locale: AppLocale): DesignSystemVariantPreview[] {
  const copy = getSharedPreviewCopy(locale);
  const optionCopy = copy.selectOptions.map((option) => ({
    value: option.value,
    label: option.label,
    description: option.description,
  }));

  return [
    designSystemPreview(
      'shared.ui.glass-select',
      'default',
      renderGlassSelectPreview('screen', copy.defaultSelectAria, optionCopy)
    ),
    designSystemPreview(
      'shared.ui.glass-select',
      'popup-flat',
      renderGlassSelectPreview('window', copy.popupFlatSelectAria, optionCopy, {
        variant: 'popup-flat',
      })
    ),
    designSystemPreview(
      'shared.ui.glass-select',
      'portal',
      renderGlassSelectPortalPreview(optionCopy, copy.portalSelectAria, copy.portalNote)
    ),
    designSystemPreview(
      'shared.ui.glass-select',
      'sm',
      <div className="w-full max-w-[260px]">
        <GlassSelect
          value="screen"
          onChange={() => undefined}
          options={optionCopy}
          size="sm"
          aria-label={copy.smallSelectAria}
        />
      </div>
    ),
    designSystemPreview(
      'shared.ui.glass-select',
      'md',
      renderGlassSelectPreview('window', copy.mediumSelectAria, optionCopy, { size: 'md' })
    ),
  ];
}
