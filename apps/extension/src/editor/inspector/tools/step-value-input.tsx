import { useRef } from 'react';
import { translate } from '../../../platform/i18n';
import {
  getNextEditorStepValue,
  normalizeEditorStepValue,
  resolveEditorStepSettingsPatch,
} from '../../objects/step-tool/value';
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
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const previewValue = (value: string) => {
    const patch = resolveEditorStepSettingsPatch(settingsRef.current, { value });
    settingsRef.current = { ...settingsRef.current, ...patch };
    props.previewStepPatch(patch);
  };
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
      onNumericStep={
        settings.type === 'number'
          ? (direction) => {
              const current = settingsRef.current;
              const value =
                direction === 1
                  ? getNextEditorStepValue(current)
                  : String(
                      Math.max(
                        0,
                        (Number(normalizeEditorStepValue(current.value, current)) || 0) - 1
                      )
                    );
              previewValue(value);
            }
          : undefined
      }
      onChange={(event) => previewValue(event.currentTarget.value)}
      onValueCommit={props.commitPendingSelectionSettings}
      className={props.className}
      inputClassName="text-center"
    />
  );
}
