import { translate } from '../../../../../platform/i18n';
import { fireAndReportEditorAction } from '../../../../runtime/async-actions';
import { CompactCommandField, CompactCommandToken, type CompactCommand } from '../../../compact';
import type { ToolCommandParams } from '../../../compact/tool-commands/types';
import type { ImageEditorController } from '../../../../controller';

export function buildCropCompactCommands(
  params: ToolCommandParams,
  controller: Pick<ImageEditorController, 'applyCropSelection'>
): CompactCommand[] {
  const cropStatus = params.cropReady
    ? translate('editor.compact.cropAreaReady')
    : translate('editor.compact.cropAreaWaiting');

  return [
    {
      id: 'crop-status',
      title: translate('editor.compact.cropArea'),
      trigger: <CompactCommandToken>AREA</CompactCommandToken>,
      value: cropStatus,
      content: (
        <CompactCommandField label={translate('editor.compact.crop')} value={cropStatus}>
          <div className="text-sm leading-6 text-[color:var(--sniptale-color-text-secondary)]">
            {params.cropReady
              ? translate('editor.compact.cropReadyDescription')
              : translate('editor.compact.cropWaitingDescription')}
          </div>
        </CompactCommandField>
      ),
    },
    {
      id: 'crop-apply',
      title: translate('editor.compact.applyCrop'),
      trigger: <CompactCommandToken>OK</CompactCommandToken>,
      disabled: !params.cropReady,
      onClick: () =>
        fireAndReportEditorAction('compact-apply-crop-selection', () =>
          controller.applyCropSelection()
        ),
    },
  ];
}
