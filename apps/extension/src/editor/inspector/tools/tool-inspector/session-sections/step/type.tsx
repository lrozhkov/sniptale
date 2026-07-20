import { translate } from '../../../../../../platform/i18n';
import { resolveEditorStepSettingsPatch } from '../../../../../objects/step-tool/value';
import { CompactCommandField, CompactCommandToken, type CompactCommand } from '../../../../compact';
import type { ToolCommandParams } from '../../../../compact/tool-commands/types';
import { SelectField } from '../../../../../chrome/ui';

export function buildStepTypeCommand(
  params: ToolCommandParams,
  typeLabel: string,
  settings: ToolCommandParams['inspectorToolSettings']['step']
): CompactCommand {
  return {
    id: 'step-type',
    title: translate('editor.compact.stepType'),
    trigger: <CompactCommandToken>TYP</CompactCommandToken>,
    value: typeLabel,
    content: (
      <CompactCommandField label={translate('editor.compact.stepType')} value={typeLabel}>
        <SelectField
          label={translate('editor.compact.stepType')}
          value={settings.type}
          onChange={(value) =>
            params.applyStepPatch(resolveEditorStepSettingsPatch(settings, { type: value }))
          }
          options={params.stepTypeOptions}
        />
      </CompactCommandField>
    ),
  };
}
