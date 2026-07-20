import { translate } from '../../../../../../platform/i18n';
import { CompactCommandField, CompactCommandToken, type CompactCommand } from '../../../../compact';
import type { ToolCommandParams } from '../../../../compact/tool-commands/types';
import { StepValueInput } from '../../../step-value-input';

export function buildStepValueCommand(
  params: ToolCommandParams,
  valueLabel: string,
  settings: ToolCommandParams['inspectorToolSettings']['step']
): CompactCommand {
  return {
    id: 'step-value',
    title: translate('editor.compact.stepValue'),
    trigger: <CompactCommandToken>VAL</CompactCommandToken>,
    value: valueLabel,
    content: (
      <CompactCommandField label={translate('editor.compact.stepValue')} value={valueLabel}>
        <StepValueInput
          settings={settings}
          previewStepPatch={params.previewStepPatch}
          commitPendingSelectionSettings={params.commitPendingSelectionSettings}
        />
      </CompactCommandField>
    ),
  };
}
