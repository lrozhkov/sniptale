import { translate } from '../../../../../../platform/i18n';
import { resolveEditorStepSettingsPatch } from '../../../../../objects/step-tool/value';
import { CompactCommandField, CompactCommandToken, type CompactCommand } from '../../../../compact';
import type { ToolCommandParams } from '../../../../compact/tool-commands/types';
import { SelectField } from '../../../../../chrome/ui';

export function buildStepAlphabetCommand(
  params: ToolCommandParams,
  alphabetLabel: string,
  settings: ToolCommandParams['inspectorToolSettings']['step']
): CompactCommand {
  return {
    id: 'step-alphabet',
    title: translate('editor.compact.alphabet'),
    trigger: <CompactCommandToken>ABC</CompactCommandToken>,
    value: alphabetLabel,
    content: (
      <CompactCommandField label={translate('editor.compact.alphabet')} value={alphabetLabel}>
        <SelectField
          label={translate('editor.compact.alphabet')}
          value={settings.alphabet}
          onChange={(value) =>
            params.applyStepPatch(resolveEditorStepSettingsPatch(settings, { alphabet: value }))
          }
          options={params.stepAlphabetOptions}
        />
      </CompactCommandField>
    ),
  };
}
