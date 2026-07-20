import { translate } from '../../../platform/i18n';
import { resolveEditorStepSettingsPatch } from '../../objects/step-tool/value';
import type { EditorToolSettings } from '../../../features/editor/document/tool-settings-types';
import { TextField } from '../../chrome/ui';

type StepValueSettings = EditorToolSettings['step'];

export function StepValueInput(props: {
  className?: string;
  commitPendingSelectionSettings: () => void;
  previewStepPatch: (patch: Partial<StepValueSettings>) => void;
  settings: StepValueSettings;
}) {
  const { settings } = props;
  const maxLength = settings.type === 'number' ? 2 : settings.type === 'manual' ? 3 : 1;

  return (
    <TextField
      aria-label={translate('editor.compact.stepValue')}
      label={translate('editor.compact.stepValue')}
      inputMode={settings.type === 'number' ? 'numeric' : 'text'}
      maxLength={maxLength}
      pattern={settings.type === 'number' ? '[0-9]*' : undefined}
      type="text"
      value={settings.value}
      onChange={(event) =>
        props.previewStepPatch(
          resolveEditorStepSettingsPatch(settings, { value: event.currentTarget.value })
        )
      }
      onValueCommit={props.commitPendingSelectionSettings}
      className={props.className}
      inputClassName="text-center"
    />
  );
}
