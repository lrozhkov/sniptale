import { TourChoiceField } from './fields';
import { ToggleField } from '../../../ui/compact-inspector-controls/controls';
import type { TourHighlightAnimation } from '@sniptale/runtime-contracts/scenario/types/tour';
import { TourInspectorNumericRow } from './numeric-row';
import type { Translate } from '../../../platform/i18n';

/** Animation inheritance is independent from the mask's paint and opacity inheritance. */
export function TourHighlightAnimationFields({
  value,
  inherited,
  central,
  disabled,
  onChange,
  t,
}: {
  value: TourHighlightAnimation;
  inherited: boolean;
  central: boolean;
  disabled: boolean;
  onChange: (value: TourHighlightAnimation | null) => boolean;
  t: Translate;
}) {
  return (
    <>
      {!central && (
        <ToggleField
          disabled={disabled}
          label={t('scenario.editor.tourUseTourAnimation')}
          value={inherited}
          onChange={() => onChange(inherited ? value : null)}
        />
      )}
      {(['enter', 'exit'] as const).map((phase) => (
        <div key={phase} className="sniptale-parameter-stack">
          <div className="tour-text-field">
            <TourChoiceField
              label={t(
                phase === 'enter'
                  ? 'scenario.editor.tourHighlightEnter'
                  : 'scenario.editor.tourHighlightExit'
              )}
              disabled={disabled}
              value={value[phase].kind}
              options={[
                { value: 'none', label: t('scenario.editor.tourAnimationNone') },
                { value: 'fade', label: t('scenario.editor.tourAnimationFade') },
              ]}
              onChange={(kind) => onChange({ ...value, [phase]: { ...value[phase], kind } })}
            />
          </div>
          {value[phase].kind === 'fade' && (
            <TourInspectorNumericRow
              label={t(
                phase === 'enter'
                  ? 'scenario.editor.tourHighlightEnterDuration'
                  : 'scenario.editor.tourHighlightExitDuration'
              )}
              value={value[phase].durationMs / 1000}
              unit="s"
              min={0.1}
              max={1}
              step={0.05}
              precision={2}
              disabled={disabled}
              onChange={(duration) =>
                onChange({
                  ...value,
                  [phase]: { ...value[phase], durationMs: Math.round(duration * 1000) },
                })
              }
            />
          )}
        </div>
      ))}
    </>
  );
}
