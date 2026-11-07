import { RotateCcw } from 'lucide-react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { translate } from '../../../platform/i18n';
import { INSPECTOR_SECONDARY_BUTTON_CLASS_NAME } from '../chrome';

export function FrameApplyButton(props: {
  onApplyFrame: () => void;
  disabled?: boolean | undefined;
}) {
  return (
    <div className="pt-0">
      <ProductActionButton
        compact
        disabled={props.disabled}
        tone="secondary"
        className={`${INSPECTOR_SECONDARY_BUTTON_CLASS_NAME} justify-center px-3.5`}
        onClick={props.onApplyFrame}
        type="button"
      >
        <RotateCcw size={16} aria-hidden="true" />
        {translate('editor.scene.resetBackground')}
      </ProductActionButton>
    </div>
  );
}
