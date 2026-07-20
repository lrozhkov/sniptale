import { ChevronLeft, RotateCcw } from 'lucide-react';
import type { AppLocale } from '../../../platform/i18n';
import { getSharedPreviewCopy } from '../support/common';
import { designSystemPreview, type DesignSystemVariantPreview } from '../support/provider';
import { EditorDivider, EditorIconButton, ValueBadge } from '@sniptale/ui/editor-chrome';

function renderIconButtonPreview(label: string, danger = false) {
  return (
    <div className="flex items-center gap-3 rounded-[16px] border border-[var(--sniptale-color-border-soft)] p-3">
      <EditorIconButton title={label} danger={danger} onClick={() => undefined}>
        {danger ? <RotateCcw className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </EditorIconButton>
      <span className="text-sm text-[var(--sniptale-color-text-secondary)]">{label}</span>
    </div>
  );
}

export function buildEditorChromeSharedPreviews(locale: AppLocale): DesignSystemVariantPreview[] {
  const copy = getSharedPreviewCopy(locale);

  return [
    designSystemPreview(
      'shared.ui.editor-chrome',
      'icon-button',
      renderIconButtonPreview(copy.back)
    ),
    designSystemPreview(
      'shared.ui.editor-chrome',
      'danger-icon-button',
      renderIconButtonPreview(copy.reset, true)
    ),
    designSystemPreview(
      'shared.ui.editor-chrome',
      'value-badge',
      <div className="flex items-center gap-3 rounded-[16px] border border-[var(--sniptale-color-border-soft)] p-3">
        <ValueBadge>{copy.apply}</ValueBadge>
        <EditorDivider className="h-6" />
        <span className="text-sm text-[var(--sniptale-color-text-secondary)]">
          {copy.modePalette}
        </span>
      </div>
    ),
  ];
}
