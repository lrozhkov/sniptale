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
    <div className="space-y-3">
      <PanelSection
        label={translate('editor.compact.crop')}
        value={
          props.cropReady
            ? translate('editor.compact.cropAreaReady')
            : translate('editor.compact.cropAreaWaiting')
        }
      >
        <div className="text-sm leading-6 text-[color:var(--sc-text-secondary)]">
          {props.cropReady
            ? translate('editor.compact.cropReadyDescription')
            : translate('editor.compact.cropWaitingDescription')}
        </div>
      </PanelSection>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
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
        </button>
        <button
          type="button"
          className={props.secondaryPanelButtonClassName}
          onClick={() => props.controller.cancelCropMode()}
        >
          {translate('editor.compact.cancel')}
        </button>
      </div>
    </div>
  );
}
