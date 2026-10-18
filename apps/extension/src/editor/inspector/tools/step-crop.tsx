import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { translate } from '../../../platform/i18n';
import { fireAndReportEditorAction } from '../../runtime/async-actions';
import type { ImageEditorController } from '../../controller';
import { cx } from '../../chrome/ui';
import { PanelSection } from './sections';

export { renderStepControlsSection } from './step-sections';

export function renderCropControlsSection(props: {
  controller: Pick<ImageEditorController, 'applyCropSelection' | 'cancelCropMode'>;
  cropReady: boolean;
  primaryPanelButtonClassName: string;
  secondaryPanelButtonClassName: string;
}) {
  return (
    <div className="space-y-1">
      <PanelSection
        label={translate('editor.compact.crop')}
        value={
          props.cropReady
            ? translate('editor.compact.cropAreaReady')
            : translate('editor.compact.cropAreaWaiting')
        }
      >
        <div className="text-[12px] leading-4 text-[color:var(--sc-text-secondary)]">
          {props.cropReady
            ? translate('editor.compact.cropReadyDescription')
            : translate('editor.compact.cropWaitingDescription')}
        </div>
      </PanelSection>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-1">
        <ProductActionButton
          tone="secondary"
          className={cx(props.secondaryPanelButtonClassName, '!w-auto px-3')}
          onClick={() => props.controller.cancelCropMode()}
        >
          {translate('editor.compact.cancel')}
        </ProductActionButton>
        <ProductActionButton
          type="button"
          className={cx(
            props.primaryPanelButtonClassName,
            !props.cropReady && 'cursor-not-allowed opacity-50 hover:brightness-100'
          )}
          onClick={() =>
            fireAndReportEditorAction('inspector-apply-crop-selection', () =>
              props.controller.applyCropSelection()
            )
          }
          disabled={!props.cropReady}
        >
          {translate('editor.compact.apply')}
        </ProductActionButton>
      </div>
    </div>
  );
}
