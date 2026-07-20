import { translate } from '../../../../../../platform/i18n';
import { CompactCommandField, CompactCommandToken, type CompactCommand } from '../../../../compact';
import type { ToolCommandParams } from '../../../../compact/tool-commands/types';
import { NumericRow } from '../../../../../chrome/ui';

export function buildStepSizeCommand(
  params: ToolCommandParams,
  settings: ToolCommandParams['inspectorToolSettings']['step']
): CompactCommand {
  return {
    id: 'step-size',
    title: translate('editor.compact.stepSize'),
    trigger: <CompactCommandToken>{settings.sizeLevel}</CompactCommandToken>,
    value: String(settings.sizeLevel),
    preservePopoverLabel: true,
    content: (
      <CompactCommandField
        label={translate('editor.compact.size')}
        value={String(settings.sizeLevel)}
      >
        <NumericRow
          label={translate('editor.compact.stepSize')}
          value={settings.sizeLevel}
          min={0}
          max={20}
          step={1}
          onPreviewValue={(sizeLevel) =>
            params.previewStepPatch({
              sizeLevel: sizeLevel as typeof settings.sizeLevel,
            })
          }
          onCommitValue={(sizeLevel) => {
            params.previewStepPatch({
              sizeLevel: sizeLevel as typeof settings.sizeLevel,
            });
            params.commitPendingSelectionSettings();
          }}
          scrub={{ min: 0, max: 20, step: 1 }}
        />
      </CompactCommandField>
    ),
  };
}
