import {
  glTransitionChoiceValue,
  resolveGlTransitionChoice,
  sceneJoinTransitionChoices,
  type GlTransitionChoiceCatalog,
} from './gl-transition-choices';
import { GlTransitionFields } from './gl-transition-fields';
import type { ComponentType, ReactNode } from 'react';
import type { CompositionJoinSettings } from '../features/video/project/scene/composition-join';
import { translate, useAppLocale } from '../platform/i18n';
import { ColorField, SelectField } from './compact-inspector-controls';
import { PreviewNumericRow } from './compact-inspector-controls/numeric-preview';
import type { InspectorDisclosureProps } from './compact-inspector-controls/shared';

/** Controlled join parameters; consumers retain clocks, admission, preview and history. */
export function PresentationJoinFields(props: {
  label: string;
  value: CompositionJoinSettings | undefined;
  timing?: CompositionJoinSettings | undefined;
  Details: ComponentType<InspectorDisclosureProps>;
  preferenceId: string;
  colorClassName?: string;
  onChange(value: CompositionJoinSettings | null): void;
  onPreview(value: CompositionJoinSettings | null): void;
  children?: ReactNode;
  glPresetActions?: ReactNode;
  glCatalog?: GlTransitionChoiceCatalog;
}) {
  useAppLocale();
  const { value, Details } = props;
  const timing = props.timing ?? value;
  const number = (edge: 'before' | 'after') => {
    if (!value || !timing) return null;
    const opposite = edge === 'before' ? 'after' : 'before';
    return (
      <PreviewNumericRow
        key={edge}
        label={translate(
          edge === 'before'
            ? 'gallery.videoReview.presentationJoinBefore'
            : 'gallery.videoReview.presentationJoinAfter'
        )}
        value={timing[edge]}
        min={value[opposite] === 0 ? 0.05 : 0}
        max={60 - value[opposite]}
        scrubEnabled={false}
        stepperPlacement="sides"
        step={0.05}
        precision={2}
        unit="s"
        onChange={(duration) => props.onChange({ ...value, [edge]: duration })}
        onPreview={(duration) =>
          props.onPreview(duration === null ? null : { ...value, [edge]: duration })
        }
      />
    );
  };
  return (
    <div className="min-w-0 space-y-1" data-ui="shared.ui.presentation-join-fields">
      <SelectField<string>
        label={props.label}
        value={
          value?.type === 'gl'
            ? glTransitionChoiceValue(props.glCatalog, value.selection)
            : (value?.type ?? 'none')
        }
        options={sceneJoinTransitionChoices(
          props.glCatalog,
          value?.type === 'gl' ? value.selection : undefined
        )}
        onChange={(type) => {
          if (type === 'none') {
            props.onChange(null);
            return;
          }
          const timing = { before: value?.before ?? 0.2, after: value?.after ?? 0.2 };
          if (type === 'dissolve' || type === 'fade-black') {
            props.onChange({ ...timing, type, ...(value?.color ? { color: value.color } : {}) });
            return;
          }
          const selection = resolveGlTransitionChoice(props.glCatalog, type);
          if (selection)
            props.onChange({
              ...timing,
              type: 'gl',
              selection,
              easing: value?.type === 'gl' ? value.easing : 'LINEAR',
            });
        }}
      />
      {value && timing && (
        <>
          {value.type === 'gl' && (
            <GlTransitionFields
              presetActions={props.glPresetActions}
              selection={value.selection}
              easing={value.easing}
              onChangeSelection={(selection) => props.onChange({ ...value, selection })}
              onChangeEasing={(easing) => props.onChange({ ...value, easing })}
              onPreviewSelection={(selection) =>
                props.onPreview(selection ? { ...value, selection } : null)
              }
            />
          )}
          {value.type === 'fade-black' && (
            <ColorField
              {...(props.colorClassName ? { className: props.colorClassName } : {})}
              label={translate('gallery.videoReview.cutTransitionColor')}
              title={translate('gallery.videoReview.cutTransitionColor')}
              value={value.color ?? '#000000'}
              allowAlpha={false}
              allowTransparent={false}
              onChange={(color) => props.onChange({ ...value, color })}
              onPreviewChange={(color) => props.onPreview(color ? { ...value, color } : null)}
              onPreviewReset={() => props.onPreview(null)}
            />
          )}
          <PreviewNumericRow
            label={translate('gallery.videoReview.presentationDuration')}
            value={timing.before + timing.after}
            min={0.05}
            max={60}
            scrubEnabled={false}
            stepperPlacement="sides"
            step={0.05}
            precision={2}
            unit="s"
            onChange={(total) => props.onChange(resize(total))}
            onPreview={(total) => props.onPreview(total === null ? null : resize(total))}
          />
          {props.children}
          <Details
            label={translate('gallery.videoReview.presentationJoinTiming')}
            preferenceId={`${props.preferenceId}.joinTiming`}
          >
            {number('before')}
            {number('after')}
          </Details>
        </>
      )}
    </div>
  );
  function resize(total: number): CompositionJoinSettings {
    const ratio = timing ? timing.before / (timing.before + timing.after) : 0.5;
    const before = total * ratio;
    return value
      ? { ...value, before, after: total - before }
      : { type: 'dissolve', before, after: total - before };
  }
}
