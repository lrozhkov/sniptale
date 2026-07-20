import type { AppLocale } from '../../../platform/i18n';
import { getProductPreviewCopy } from '../support/product';
import {
  DesignSystemFloatingPreviewFrame,
  designSystemPreview,
  type DesignSystemVariantPreview,
} from '../support/provider';
import {
  ProductField,
  ProductInput,
  ProductKeyboardHint,
  ProductRange,
  ProductSelect,
  ProductTextarea,
  ProductToggle,
} from '@sniptale/ui/product-form-controls';

function renderInputPreview(copy: ReturnType<typeof getProductPreviewCopy>) {
  return (
    <DesignSystemFloatingPreviewFrame minHeight={132} className="justify-start">
      <div className="sniptale-ai-modal-root w-full">
        <ProductField>
          <ProductInput value={copy.formInputValue} readOnly className="max-w-[320px]" />
        </ProductField>
      </div>
    </DesignSystemFloatingPreviewFrame>
  );
}

function renderTextareaPreview(copy: ReturnType<typeof getProductPreviewCopy>) {
  return (
    <DesignSystemFloatingPreviewFrame minHeight={192} className="justify-start">
      <div className="sniptale-ai-modal-root w-full">
        <ProductField>
          <ProductTextarea
            value={copy.formTextareaValue}
            readOnly
            className="h-[120px] max-w-[360px]"
          />
        </ProductField>
      </div>
    </DesignSystemFloatingPreviewFrame>
  );
}

function renderCheckboxPreview(copy: ReturnType<typeof getProductPreviewCopy>) {
  return (
    <DesignSystemFloatingPreviewFrame minHeight={120} className="justify-start">
      <div className="sniptale-ai-modal-root w-full">
        <label className="inline-flex items-center gap-3 text-sm text-[var(--sniptale-color-text-primary)]">
          <input type="checkbox" className="sniptale-checkbox" defaultChecked />
          <span>{copy.formCheckboxLabel}</span>
        </label>
      </div>
    </DesignSystemFloatingPreviewFrame>
  );
}

function renderSelectPreview(copy: ReturnType<typeof getProductPreviewCopy>) {
  return (
    <DesignSystemFloatingPreviewFrame minHeight={132} className="justify-start">
      <div className="sniptale-ai-modal-root w-full">
        <ProductField>
          <ProductSelect
            value="preset-a"
            onChange={() => undefined}
            options={[
              { value: 'preset-a', label: copy.presetA },
              { value: 'preset-b', label: copy.presetB },
            ]}
            className="max-w-[320px]"
          />
        </ProductField>
      </div>
    </DesignSystemFloatingPreviewFrame>
  );
}

function renderTogglePreview(copy: ReturnType<typeof getProductPreviewCopy>) {
  return (
    <DesignSystemFloatingPreviewFrame minHeight={120} className="justify-start">
      <div className="sniptale-ai-modal-root flex w-full items-center justify-between gap-4">
        <span className="text-sm text-[var(--sniptale-color-text-primary)]">
          {copy.formCheckboxLabel}
        </span>
        <ProductToggle checked onClick={() => undefined} />
      </div>
    </DesignSystemFloatingPreviewFrame>
  );
}

function renderRangePreview() {
  return (
    <DesignSystemFloatingPreviewFrame minHeight={120} className="justify-start">
      <div className="sniptale-ai-modal-root flex w-full items-center gap-4">
        <ProductRange defaultValue={72} className="flex-1" />
        <span className="text-xs text-[var(--sniptale-color-text-dim)]">72%</span>
      </div>
    </DesignSystemFloatingPreviewFrame>
  );
}

function renderKeyboardHintPreview(copy: ReturnType<typeof getProductPreviewCopy>) {
  return (
    <DesignSystemFloatingPreviewFrame minHeight={120} className="justify-start">
      <div className="sniptale-ai-modal-root w-full">
        <ProductKeyboardHint shortcut="Ctrl+Enter">{copy.formKbdLabel}</ProductKeyboardHint>
      </div>
    </DesignSystemFloatingPreviewFrame>
  );
}

export function buildProductFormControlsPreviews(locale: AppLocale): DesignSystemVariantPreview[] {
  const copy = getProductPreviewCopy(locale);

  return [
    designSystemPreview('product.ui.form-controls', 'input', renderInputPreview(copy)),
    designSystemPreview('product.ui.form-controls', 'textarea', renderTextareaPreview(copy)),
    designSystemPreview('product.ui.form-controls', 'checkbox', renderCheckboxPreview(copy)),
    designSystemPreview('product.ui.form-controls', 'select', renderSelectPreview(copy)),
    designSystemPreview('product.ui.form-controls', 'toggle', renderTogglePreview(copy)),
    designSystemPreview('product.ui.form-controls', 'range', renderRangePreview()),
    designSystemPreview('product.ui.form-controls', 'kbd', renderKeyboardHintPreview(copy)),
  ];
}
