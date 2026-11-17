import { useMemo, type ReactNode } from 'react';
import {
  glTransitionControls,
  glTransitionParameters,
  parseGlTransitionSelection,
  resolveGlTransition,
  type GlTransitionSelection,
} from '../features/video/project/transition/gl-catalog';
import { translate, useAppLocale } from '../platform/i18n';
import { ColorField, SelectField } from './compact-inspector-controls';
import { glTransitionParameterLabel } from './gl-transition-labels';
import { PreviewNumericRow } from './compact-inspector-controls/numeric-preview';
import {
  EffectControlChoices,
  EffectControlFrame,
  effectControlSliderRange,
} from './effect-control-presentation/controls';

/** Pure shared fields; project commands, preview drafts, Undo and persistence remain with consumers. */
export function GlTransitionFields(props: {
  selection: GlTransitionSelection;
  presetActions?: ReactNode;
  easing: 'LINEAR' | 'EASE_IN_OUT';
  disabled?: boolean | undefined;
  onChangeSelection(value: GlTransitionSelection): void;
  onChangeEasing(value: 'LINEAR' | 'EASE_IN_OUT'): void;
  onPreviewSelection?(value: GlTransitionSelection | null): void;
}) {
  const locale = useAppLocale();
  const descriptor = resolveGlTransition(props.selection);
  const controls = useMemo(
    () => (descriptor ? glTransitionControls(descriptor).controls : []),
    [descriptor]
  );
  if (!descriptor || !glTransitionParameters(props.selection))
    return (
      <>
        <p role="status" className="text-xs text-[var(--sniptale-color-text-secondary)]">
          {translate('videoEditor.sidebar.transitionImplementationUnavailable')}
        </p>
        {props.presetActions}
      </>
    );
  const update = (id: string, value: number | string, preview = false) => {
    const next = parseGlTransitionSelection({
      ...props.selection,
      values: { ...props.selection.values, [id]: value },
    });
    if (next) {
      if (preview) props.onPreviewSelection?.(next);
      else props.onChangeSelection(next);
    }
  };
  return (
    <div className="min-w-0 space-y-1" data-ui="shared.ui.gl-transition-fields">
      <SelectField<'LINEAR' | 'EASE_IN_OUT'>
        label={translate('videoEditor.sidebar.transitionEasingLabel')}
        disabled={props.disabled ?? false}
        value={props.easing}
        onChange={props.onChangeEasing}
        options={[
          { value: 'LINEAR', label: translate('videoEditor.sidebar.transitionEasingLinear') },
          {
            value: 'EASE_IN_OUT',
            label: translate('videoEditor.sidebar.transitionEasingEaseInOut'),
          },
        ]}
      />
      {controls.map((control) => {
        const label = glTransitionParameterLabel(control.id, locale);
        const localizedControl = {
          ...control,
          label: { [locale]: label },
          ...(control.options
            ? {
                options: control.options.map((option) => ({
                  ...option,
                  label: {
                    [locale]: translate(
                      option.value === 1
                        ? 'videoEditor.glTransitions.enabled'
                        : 'videoEditor.glTransitions.disabled'
                    ),
                  },
                })),
              }
            : {}),
        };
        const value = props.selection.values[control.id] ?? control.defaultValue;
        let field;
        if (control.options?.length)
          field = (
            <EffectControlChoices
              control={localizedControl}
              locale={locale}
              disabled={props.disabled ?? false}
              value={value}
              onChange={(value) => update(control.id, value)}
            />
          );
        else if (control.kind === 'number') {
          const parameter = descriptor.params[control.id.split('.')[0] ?? control.id];
          const integer = parameter?.type === 'int' || parameter?.type === 'ivec2';
          const current = typeof value === 'number' ? value : control.defaultValue;
          const scrub = effectControlSliderRange(control, current);
          field = (
            <PreviewNumericRow
              label={label}
              title={label}
              disabled={props.disabled ?? false}
              value={current}
              min={control.min ?? (integer ? -2147483648 : -3.4028234663852886e38)}
              max={control.max ?? (integer ? 2147483647 : 3.4028234663852886e38)}
              step={control.step ?? (integer ? 1 : 0.01)}
              precision={integer ? 0 : 6}
              scrubMin={scrub.min}
              scrubMax={scrub.max}
              scrubStep={control.step ?? (integer ? 1 : 0.01)}
              onChange={(value) => update(control.id, value)}
              onPreview={(value) =>
                value === null ? props.onPreviewSelection?.(null) : update(control.id, value, true)
              }
            />
          );
        } else if (control.kind === 'color') {
          const alpha = descriptor.params[control.id]?.type === 'vec4';
          field = (
            <ColorField
              label={label}
              title={label}
              disabled={props.disabled ?? false}
              value={typeof value === 'string' ? value : control.defaultValue}
              allowAlpha={alpha}
              allowTransparent={alpha}
              onChange={(value) => update(control.id, value)}
              onPreviewChange={(value) => update(control.id, value, true)}
              onPreviewReset={() => props.onPreviewSelection?.(null)}
            />
          );
        } else throw new Error('Bundled GL transition contains an unsupported control.');
        return (
          <EffectControlFrame key={control.id} control={control}>
            {field}
          </EffectControlFrame>
        );
      })}
      {props.presetActions}
    </div>
  );
}
