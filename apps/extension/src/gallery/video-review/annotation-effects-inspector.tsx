import {
  EffectControlChoices,
  EffectControlFrame,
  effectControlUnit,
  effectControlSliderRange,
} from '../../ui/effect-control-presentation/controls';
import { EffectControlTree } from '../../ui/effect-control-presentation/groups';
import {
  effectControlIcons,
  effectControlRootIcon,
} from '../../ui/effect-control-presentation/icons';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from 'react';
import { Copy, Move, Trash2 } from 'lucide-react';
import { type AnimationTemplate } from '@sniptale/runtime-contracts/animation-template';
import {
  applyEffectControlPreset,
  resolveEffectLocaleText,
  resolveEffectControlDefault,
  type ControlDefinition,
  resolveEffectControlGroup,
  EFFECT_CONTROL_GROUPS,
} from '@sniptale/runtime-contracts/effect-controls';
import { translate, useAppLocale } from '../../platform/i18n';
import {
  ColorField,
  SelectField,
  TextField,
  TextareaField,
  ToggleField,
} from '../../ui/compact-inspector-controls';
import type { ReviewAnnotationEffect } from '../../features/video/review/annotation-effects/types';
import { resolveReviewAnnotationEffectControls } from '../../features/video/review/annotation-effects/layout';
import { readReviewAnnotationEffectDocument } from '../../features/video/review/annotation-effects/validation';
import {
  ReviewButton,
  reviewDeleteButtonClassName,
  reviewSelectFieldClassName,
  reviewTextButtonClassName,
  ReviewDetails,
} from './controls';
import { ReviewInspectorSections, reviewInspectorActions } from './inspector-sections';
import {
  changeReviewAnnotationBoundControl,
  convertReviewAnnotationAttachment,
  changeReviewAnnotationBodyTransform,
  reviewAnnotationBodyGeometry,
  reviewAnnotationBodyMeasurementKey,
  setReviewAnnotationBodyBounds,
} from './annotation-effects-geometry';
import type { useReviewAnnotationEffects } from './annotation-effects-editor';
import { AnnotationNumeric, annotationNumericScrub } from './annotation-effects-numeric';
import { reviewAnnotationPresetId } from './annotation-effects-presets';

type Editor = ReturnType<typeof useReviewAnnotationEffects>;
type Patch = Partial<Omit<ReviewAnnotationEffect, 'id' | 'snapshotId' | 'order'>>;

// These shipped templates declare sliders for dimensions that need exact pixel steps.
const outlineDimensions = new Map<string, readonly string[]>([
  ['sniptale-frame', ['stroke', 'radius']],
  ['sniptale-corners', ['stroke']],
  ['sniptale-arrow', ['stroke']],
  ['sniptale-leader-labels', ['lineWidth']],
]);

type Props = {
  editor: Editor;
  id: string;
  source: string | undefined;
  sourceDigest?: string | undefined;
  duration: number;
  busy: boolean;
};

/** SDK parameters and object commands share the existing admitted annotation transaction. */
export function ReviewAnnotationInspector(props: Props) {
  const locale = useAppLocale();
  const geometry = useSyncExternalStore(
    props.editor.geometry.subscribe,
    props.editor.geometry.read
  );
  const document = useMemo(
    () =>
      props.source ? readReviewAnnotationEffectDocument(props.source, props.sourceDigest) : null,
    [props.source, props.sourceDigest]
  );
  const [placement, setPlacement] = useState<ReviewAnnotationEffect | null>(null);
  useEffect(() => props.editor.movement.subscribe(setPlacement), [props.editor.movement]);
  useEffect(() => {
    if (!props.editor.gestureId) setPlacement(null);
  }, [props.editor.gestureId, props.editor.lane]);
  const instance =
    placement?.id === props.id
      ? placement
      : props.editor.previewLane?.instances.find((item) => item.id === props.id);
  if (!instance) return null;
  if (!document)
    return <div role="alert">{translate('gallery.videoReview.annotationSourceMissing')}</div>;
  return (
    <AnnotationParameters
      {...props}
      geometry={geometry}
      document={document}
      instance={instance}
      locale={locale}
    />
  );
}

function AnnotationParameters(
  props: Props & {
    geometry: ReturnType<Editor['geometry']['read']>;
    document: AnimationTemplate;
    instance: ReviewAnnotationEffect;
    locale: string;
  }
) {
  const { editor, document, instance, locale } = props;
  const disabled = props.busy || editor.pending;
  const geometry = props.geometry;
  const values = geometry
    ? resolveReviewAnnotationEffectControls(document, instance, geometry[instance.attachment])
    : {
        ...Object.fromEntries(
          document.controls.map((control) => [
            control.id,
            resolveEffectControlDefault(control, locale),
          ])
        ),
        ...instance.controls,
      };
  const preview = (patch: Patch) => {
    if (
      disabled ||
      (editor.gestureId !== instance.id && !editor.beginGesture(instance.id, 'field'))
    )
      return;
    editor.previewGesture(patch);
  };
  const commit = () => {
    void editor.commitGesture();
  };
  const number = (
    key: string,
    label: string,
    value: number,
    patch: (next: number) => Patch,
    min?: number,
    max?: number,
    unit?: 's' | '%' | 'deg'
  ) => (
    <AnnotationNumeric
      editor={editor}
      id={instance.id}
      patch={patch}
      key={key}
      label={label}
      value={value}
      disabled={disabled || ((key === 'width' || key === 'height') && !geometry)}
      min={min}
      max={max}
      step={unit === 's' ? 0.1 : 1}
      unit={unit}
      stepperPlacement="sides"
    />
  );
  const opposite = instance.attachment === 'content' ? 'viewport' : 'content';
  const converted = geometry
    ? convertReviewAnnotationAttachment(instance, opposite, geometry)
    : null;
  const measured = editor.bodyMeasurements.get(
    reviewAnnotationBodyMeasurementKey(instance, values)
  );
  if (measured) setReviewAnnotationBodyBounds(document, instance.id, measured);
  const transform = instance.transform;
  const body = geometry ? reviewAnnotationBodyGeometry(instance, document, geometry) : null;
  const plane = geometry?.[instance.attachment];
  const place = (change: Parameters<typeof changeReviewAnnotationBodyTransform>[3]): Patch => ({
    transform: geometry
      ? changeReviewAnnotationBodyTransform(instance, document, geometry, change)
      : { ...transform, ...change },
  });
  const position =
    body && plane
      ? {
          x: body.origin.x / plane.width,
          y: body.origin.y / plane.height,
          width: body.size.width / plane.width,
          height: body.size.height / plane.height,
        }
      : transform;

  const sdkSections = annotationSdkSections({
    document,
    instance,
    values,
    locale,
    editor,
    geometry,
    disabled,
    preview,
    commit,
  });
  if (document.controlPresets?.length) {
    const preset = (
      <AnnotationPreset
        document={document}
        instance={instance}
        editor={editor}
        locale={locale}
        disabled={disabled}
      />
    );
    const appearance = sdkSections.findIndex((section) => section.id === 'sdk:appearance');
    if (appearance >= 0) {
      const section = sdkSections[appearance]!;
      sdkSections[appearance] = {
        ...section,
        content: (
          <>
            {preset}
            {section.content}
          </>
        ),
      };
    } else {
      sdkSections.push({
        id: 'sdk:appearance',
        label: translate('videoEditor.effectsLibrary.objectAppearance'),
        icon: effectControlRootIcon('appearance'),
        content: preset,
      });
    }
  }
  const enabled = (
    <ToggleField
      showStatus
      value={instance.enabled}
      disabled={disabled}
      label={translate('gallery.videoReview.annotationEnabled')}
      onChange={(enabled) => editor.change(instance.id, { enabled })}
    />
  );
  const appearance = sdkSections.find((section) => section.id === 'sdk:appearance');
  if (appearance)
    appearance.content = (
      <>
        {enabled}
        {appearance.content}
      </>
    );
  else
    sdkSections.push({
      id: 'sdk:appearance',
      label: translate('videoEditor.effectsLibrary.objectAppearance'),
      icon: effectControlRootIcon('appearance'),
      content: enabled,
    });
  const sections = [
    ...sdkSections.filter((section) => section.id === 'sdk:content'),
    {
      id: 'placement',
      label: translate('gallery.videoReview.annotationPlacement'),
      icon: Move,
      content: (
        <>
          <SelectField
            className={reviewSelectFieldClassName}
            label={translate('gallery.videoReview.annotationAttachment')}
            value={instance.attachment}
            disabled={disabled}
            options={[
              {
                value: 'content',
                label: translate('gallery.videoReview.annotationContentAttachment'),
                disabled: instance.attachment !== 'content' && !converted,
              },
              {
                value: 'viewport',
                label: translate('gallery.videoReview.annotationViewportAttachment'),
                disabled: instance.attachment !== 'viewport' && !converted,
              },
            ]}
            onChange={(attachment) => {
              if (!geometry) return;
              editor.change(instance.id, (current) => {
                const next = convertReviewAnnotationAttachment(current, attachment, geometry);
                return next
                  ? {
                      attachment,
                      transform: next.transform,
                      ...(next.anchors ? { anchors: next.anchors } : {}),
                    }
                  : null;
              });
            }}
          />
          {!converted && (
            <div role="status">
              {translate('gallery.videoReview.annotationAttachmentUnavailable')}
            </div>
          )}
          {number(
            'x',
            translate('gallery.videoReview.annotationX'),
            position.x * 100,
            (x) => place({ x: x / 100 }),
            -1600,
            1600,
            '%'
          )}
          {number(
            'y',
            translate('gallery.videoReview.annotationY'),
            position.y * 100,
            (y) => place({ y: y / 100 }),
            -1600,
            1600,
            '%'
          )}
          {number(
            'width',
            translate('gallery.videoReview.annotationWidth'),
            position.width * 100,
            (width) => place({ width: width / 100 }),
            0.01,
            1600,
            '%'
          )}
          {number(
            'height',
            translate('gallery.videoReview.annotationHeight'),
            position.height * 100,
            (height) => place({ height: height / 100 }),
            0.01,
            1600,
            '%'
          )}
          {number(
            'rotation',
            translate('gallery.videoReview.annotationRotation'),
            (transform.rotation * 180) / Math.PI,
            (rotation) => place({ rotation: (rotation * Math.PI) / 180 }),
            -360,
            360,
            'deg'
          )}
        </>
      ),
    },
    ...sdkSections.filter((section) => section.id !== 'sdk:content'),
    reviewInspectorActions(
      <>
        <ReviewButton
          selectionAction="duplicate"
          label={translate('gallery.videoReview.annotationDuplicate')}
          className={reviewTextButtonClassName}
          disabled={disabled}
          onClick={() => editor.duplicate(instance.id)}
        >
          <Copy size={16} aria-hidden="true" />
          <span>{translate('gallery.videoReview.annotationDuplicate')}</span>
        </ReviewButton>
        <ReviewButton
          selectionAction="delete"
          label={translate('gallery.videoReview.deleteSelected')}
          className={reviewDeleteButtonClassName}
          disabled={disabled}
          onClick={() => editor.remove(instance.id)}
        >
          <Trash2 size={16} aria-hidden="true" />
          <span>{translate('gallery.videoReview.deleteSelected')}</span>
        </ReviewButton>
      </>
    ),
  ];
  return (
    <div data-ui="gallery.videoReview.annotationInspector">
      {editor.failure && (
        <div role="alert">
          {translate(
            editor.failure === 'unsupported'
              ? 'gallery.videoReview.annotationEffectsUnsupported'
              : 'gallery.videoReview.annotationEditFailed'
          )}
          {editor.failure !== 'unsupported' ? (
            <ReviewButton
              label={translate('gallery.videoReview.retry')}
              className={reviewTextButtonClassName}
              disabled={editor.pending}
              onClick={editor.retry}
            />
          ) : null}
        </div>
      )}
      <ReviewInspectorSections sections={sections} />
    </div>
  );
}

function annotationSdkSections(props: {
  document: AnimationTemplate;
  instance: ReviewAnnotationEffect;
  values: Record<string, string | number>;
  locale: string;
  editor: Editor;
  geometry: ReturnType<Editor['geometry']['read']>;
  disabled: boolean;
  preview(patch: Patch): void;
  commit(): void;
}) {
  const { document, instance, values, locale, editor, disabled, preview, commit } = props;
  const groups = new Map<string, ControlDefinition[]>();
  for (const control of [...document.controls].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    const group = resolveEffectControlGroup(control.group, document.controlGroups) ?? 'advanced';
    const members = groups.get(group) ?? [];
    members.push(control);
    groups.set(group, members);
  }
  const label = (group: string) => {
    switch (group) {
      case 'content':
        return translate('videoEditor.effectsLibrary.objectText');
      case 'typography':
        return translate('videoEditor.effectsLibrary.objectTypography');
      case 'appearance':
        return translate('videoEditor.effectsLibrary.objectAppearance');
      case 'geometry':
        return translate('videoEditor.effectsLibrary.objectGeometry');
      case 'processing':
        return translate('videoEditor.effectsLibrary.objectProcessing');
      case 'animation':
        return translate('videoEditor.effectsLibrary.objectAnimation');
      default:
        return translate('videoEditor.effectsLibrary.objectAdvanced');
    }
  };
  return EFFECT_CONTROL_GROUPS.filter((group) => groups.has(group)).map((group) => ({
    id: `sdk:${group}`,
    label: label(group),
    icon: effectControlRootIcon(group),
    content: (
      <div className="flex min-w-0 flex-col gap-2">
        <EffectControlTree
          document={document}
          parentId={group}
          controls={groups.get(group) ?? []}
          renderGroup={(definition, children) => (
            // Placement already owns Move; nested group icons are optional.
            <ReviewDetails
              preferenceId={`effect-group:${document.id}:${definition.id}`}
              label={resolveEffectLocaleText(definition.label, locale)}
              initiallyOpen={!definition.collapsed}
              {...(definition.icon && definition.icon !== 'move'
                ? { icon: effectControlIcons[definition.icon] }
                : {})}
            >
              {children}
            </ReviewDetails>
          )}
          renderControl={(control) => (
            <EffectControlFrame control={control}>
              <AnnotationControl
                key={control.id}
                document={document}
                control={control}
                instance={instance}
                value={values[control.id] ?? resolveEffectControlDefault(control, locale)}
                locale={locale}
                editor={editor}
                geometry={props.geometry}
                disabled={disabled}
                preview={preview}
                commit={commit}
              />
            </EffectControlFrame>
          )}
        />
      </div>
    ),
  }));
}

function AnnotationPreset(props: {
  document: AnimationTemplate;
  instance: ReviewAnnotationEffect;
  editor: Editor;
  locale: string;
  disabled: boolean;
}) {
  const { document, instance, editor, locale, disabled } = props;
  return (
    <SelectField
      className={reviewSelectFieldClassName}
      label={translate('gallery.videoReview.annotationPresets')}
      value={reviewAnnotationPresetId(
        document,
        editor.lane?.instances.find((item) => item.id === instance.id)?.controls ??
          instance.controls,
        locale
      )}
      disabled={disabled}
      options={[
        { value: '', label: translate('gallery.videoReview.annotationCustomPreset') },
        ...(document.controlPresets ?? []).map((preset) => ({
          value: preset.id,
          label: [
            resolveEffectLocaleText(preset.theme.label, locale),
            resolveEffectLocaleText(preset.label, locale),
          ].join(' · '),
        })),
      ]}
      onChange={(id) =>
        id &&
        editor.change(instance.id, (current) => ({
          controls: applyEffectControlPreset(document, current.controls, id),
        }))
      }
    />
  );
}

type AnnotationControlProps = {
  document: AnimationTemplate;
  control: ControlDefinition;
  instance: ReviewAnnotationEffect;
  value: string | number;
  locale: string;
  editor: Editor;
  geometry: ReturnType<Editor['geometry']['read']>;
  disabled: boolean;
  preview(patch: Patch): void;
  commit(): void;
};

function AnnotationControl(props: AnnotationControlProps) {
  const { control, instance, editor } = props;
  const label = resolveEffectLocaleText(control.label, props.locale) || control.id;
  const bound = props.document.objectLayout?.handles?.some(
    (handle) => handle.xControl === control.id || handle.yControl === control.id
  );
  const disabled = props.disabled || (!!bound && !props.geometry);
  const patch = (value: string | number): Patch | null => {
    if (bound) {
      const anchors =
        typeof value === 'number' && props.geometry
          ? changeReviewAnnotationBoundControl(
              instance,
              props.document,
              props.geometry,
              control.id,
              value
            )
          : null;
      return anchors ? { anchors } : null;
    }
    return { controls: { [control.id]: value } };
  };
  const preview = (value: string | number) => {
    const next = patch(value);
    if (next) props.preview(next);
  };
  if (control.options?.length)
    return (
      <EffectControlChoices
        control={control}
        value={props.value}
        locale={props.locale}
        disabled={disabled}
        onChange={(value) => {
          preview(value);
          props.commit();
        }}
      />
    );
  if (control.kind === 'number') {
    const value = typeof props.value === 'number' ? props.value : control.defaultValue;
    const outlineDimension =
      outlineDimensions.get(props.document.id)?.includes(control.id) &&
      control.unit === 'px' &&
      control.min !== undefined &&
      control.max !== undefined &&
      !bound;
    const authoredSlider = control.presentation === 'slider' && !outlineDimension;
    const range = authoredSlider ? effectControlSliderRange(control, value) : control;
    const layout = props.document.objectLayout;
    const handle = layout?.handles?.find(
      (item) => item.xControl === control.id || item.yControl === control.id
    );
    const length =
      handle && layout
        ? handle.xControl === control.id
          ? props.document.animation.w
          : props.document.animation.h
        : undefined;
    return (
      <AnnotationNumeric
        editor={editor}
        id={instance.id}
        label={label}
        disabled={disabled}
        value={value}
        min={control.min}
        max={control.max}
        step={control.step}
        unit={effectControlUnit(control.unit)}
        revealScrub={authoredSlider}
        rangePresentation={
          !bound &&
          control.id === 'opacity' &&
          control.unit === 'percent' &&
          control.min === 0 &&
          control.max === 100 &&
          (control.step ?? 1) === 1
            ? 'field'
            : undefined
        }
        stepperPlacement={outlineDimension ? 'sides' : undefined}
        patch={patch}
        scrub={
          authoredSlider
            ? annotationNumericScrub(
                value,
                range.min,
                range.max,
                range.step,
                length === undefined ? undefined : { min: -length, max: 2 * length }
              )
            : undefined
        }
      />
    );
  }
  if (control.kind === 'color')
    return (
      <ColorField
        className={reviewSelectFieldClassName}
        label={label}
        title={label}
        disabled={disabled}
        value={typeof props.value === 'string' ? props.value : control.defaultValue}
        onChange={(value) => {
          preview(value);
          props.commit();
        }}
      />
    );
  return (
    <AnnotationTextControl
      control={control}
      label={label}
      value={props.value}
      disabled={disabled}
      editor={editor}
      preview={preview}
      commit={props.commit}
    />
  );
}

function AnnotationTextControl(
  props: Pick<AnnotationControlProps, 'value' | 'editor' | 'disabled' | 'commit'> & {
    control: Extract<ControlDefinition, { defaultValue: string }>;
    label: string;
    preview(value: string): void;
  }
) {
  const { control, editor, disabled, label, preview } = props;
  const cancelling = useRef(false);
  const onBlur = () => {
    if (!cancelling.current) props.commit();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cancelling.current = true;
      editor.cancelGesture();
      event.currentTarget.blur();
      cancelling.current = false;
    } else if (
      event.key === 'Enter' &&
      (control.presentation !== 'textarea' || event.ctrlKey || event.metaKey)
    ) {
      event.preventDefault();
      props.commit();
    }
  };
  if (control.presentation === 'textarea')
    return (
      <TextareaField
        clearable={false}
        label={label}
        disabled={disabled}
        value={typeof props.value === 'string' ? props.value : control.defaultValue}
        onChange={preview}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
      />
    );
  return (
    <TextField
      label={label}
      disabled={disabled}
      value={typeof props.value === 'string' ? props.value : control.defaultValue}
      onChange={(event) => preview(event.currentTarget.value)}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    />
  );
}
