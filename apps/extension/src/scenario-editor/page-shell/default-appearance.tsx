import type {
  GuideStyle,
  GuideHtmlImageSettings,
} from '@sniptale/runtime-contracts/scenario/types/guide';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import type { Translate } from '../../platform/i18n';
import { GuideStyleFields } from './style-controls';
import { GuideHtmlImageFields } from './html-image-fields';
import { GuideInspectorGroup } from './inspector';
import { Images } from 'lucide-react';

/** Document defaults use the same canonical updater and history as selected-item edits. */
export function GuideDefaultAppearance({
  style,
  htmlImages,
  onHtmlImagesChange,
  disabled,
  onApply,
  t,
}: {
  style: GuideStyle;
  htmlImages: GuideHtmlImageSettings;
  onHtmlImagesChange: (patch: Partial<GuideHtmlImageSettings>) => void;
  disabled: boolean;
  onApply: (style: GuideStyle, resetSteps: boolean) => void;
  t: Translate;
}) {
  return (
    <div className="guide-default-appearance">
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
      <GuideInspectorGroup id="htmlImages" icon={Images} title={t('scenario.editor.htmlImages')}>
        <GuideHtmlImageFields
          value={htmlImages}
          disabled={disabled}
          onChange={onHtmlImagesChange}
          t={t}
        />
      </GuideInspectorGroup>
    </div>
  );
}
