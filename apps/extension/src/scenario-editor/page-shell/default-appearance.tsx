import type { GuideStyle } from '@sniptale/runtime-contracts/scenario/types/guide';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { Layers } from 'lucide-react';
import type { Translate } from '../../platform/i18n';
import { GuideStyleFields } from './style-controls';

/** Document defaults use the same canonical updater and history as selected-item edits. */
export function GuideDefaultAppearance({
  style,
  disabled,
  onApply,
  t,
}: {
  style: GuideStyle;
  disabled: boolean;
  onApply: (style: GuideStyle, resetSteps: boolean) => void;
  t: Translate;
}) {
  return (
    <div className="guide-default-appearance">
      <div className="guide-inspector-context">
        <Layers size={16} aria-hidden="true" />
        <strong>{t('scenario.editor.guideEntireDocument')}</strong>
      </div>
      <p className="guide-inspector-hint">{t('scenario.editor.guideDefaultScopeHint')}</p>
      <GuideStyleFields
        style={style}
        disabled={disabled}
        t={t}
        onChange={(patch) => onApply({ ...style, ...patch }, false)}
      />
      <div className="guide-inspector-bulk">
        <ProductActionButton
          compact
          tone="secondary"
          disabled={disabled}
          onClick={() => onApply(style, true)}
        >
          {t('scenario.editor.guideApplyAllSteps')}
        </ProductActionButton>
        <p className="guide-inspector-hint">{t('scenario.editor.guideApplyAllHint')}</p>
      </div>
    </div>
  );
}
