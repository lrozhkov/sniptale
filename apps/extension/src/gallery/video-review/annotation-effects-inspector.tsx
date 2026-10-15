import { useMemo, useRef } from 'react';
import { Clock3, Copy, Move, Palette, Shapes, Trash2 } from 'lucide-react';
import {
  applyEffectV1ControlPreset,
  resolveEffectLocaleText,
  resolveEffectV1ControlDefault,
  type ControlDefinition,
  type EffectV1Document,
} from '@sniptale/runtime-contracts/effect-v1';
import { translate, useAppLocale } from '../../platform/i18n';
import {
  ColorField,
  SelectField,
  TextField,
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
} from './controls';
import { ReviewInspectorSections, reviewInspectorActions } from './inspector-sections';
import {
  changeReviewAnnotationBoundControl,
  convertReviewAnnotationAttachment,
} from './annotation-effects-geometry';
import type { useReviewAnnotationEffects } from './annotation-effects-editor';
import {
  AnnotationNumeric,
  annotationNumericScrub,
  annotationPlacementScrub,
} from './annotation-effects-numeric';
import { reviewAnnotationPresetId } from './annotation-effects-presets';

type Editor = ReturnType<typeof useReviewAnnotationEffects>;
type Patch = Partial<Omit<ReviewAnnotationEffect, 'id' | 'snapshotId' | 'order'>>;
type Props = {
  editor: Editor;
  id: string;
  source: string | undefined;
  duration: number;
  busy: boolean;
};

/** SDK parameters and object commands share the existing admitted annotation transaction. */
export function ReviewAnnotationInspector(props: Props) {
  const locale = useAppLocale();
  const document = useMemo(
    () => (props.source ? readReviewAnnotationEffectDocument(props.source) : null),
    [props.source]
  );
  const instance = props.editor.previewLane?.instances.find((item) => item.id === props.id);
  if (!instance) return null;
  if (!document)
    return <div role="alert">{translate('gallery.videoReview.annotationSourceMissing')}</div>;
  return (
    <AnnotationParameters {...props} document={document} instance={instance} locale={locale} />
  );
}

function AnnotationParameters(
  props: Props & { document: EffectV1Document; instance: ReviewAnnotationEffect; locale: string }
) {
  const { editor, document, instance, locale } = props;
  const disabled = props.busy || editor.pending;
  const geometry = editor.geometry;
  const values = geometry
    ? resolveReviewAnnotationEffectControls(document, instance, geometry[instance.attachment])
    : {
        ...Object.fromEntries(
          document.controls.map((control) => [
            control.id,
            resolveEffectV1ControlDefault(control, locale),
          ])
        ),
        ...instance.controls,
      };
  const preview = (patch: Patch) => {
    if (disabled || (editor.gestureId !== instance.id && !editor.beginGesture(instance.id))) return;
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
      disabled={
        disabled ||
        ((key === 'width' || key === 'height') &&
          document.objectLayout?.resize === 'scale' &&
          !geometry)
      }
      min={min}
      max={max}
      step={unit === 's' ? 0.1 : 1}
      unit={unit}
      scrub={annotationPlacementScrub(key, value, min, max, unit === 's' ? 0.1 : 1)}
    />
  );
  const opposite = instance.attachment === 'content' ? 'viewport' : 'content';
  const converted = geometry
    ? convertReviewAnnotationAttachment(instance, opposite, geometry)
    : null;
  const transform = instance.transform;
  const dimension = (axis: 'width' | 'height', value: number): Patch => {
    const next = value / 100;
    const plane = geometry?.[instance.attachment];
    const layout = document.objectLayout;
    if (layout?.resize === 'scale' && plane) {
      return {
        transform: {
          ...transform,
          width:
            axis === 'width'
              ? next
              : (next * plane.height * layout.width) / (plane.width * layout.height),
          height:
            axis === 'height'
              ? next
              : (next * plane.width * layout.height) / (plane.height * layout.width),
        },
      };
    }
    return { transform: { ...transform, [axis]: next } };
  };
  const groups = new Map<string, ControlDefinition[]>();
  for (const control of [...document.controls].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    const group = control.group ?? 'parameters';
    const members = groups.get(group) ?? [];
    members.push(control);
    groups.set(group, members);
  }
  const label = (group: string) => {
    switch (group) {
      case 'appearance':
        return translate('gallery.videoReview.annotationAppearance');
      case 'animation':
        return translate('gallery.videoReview.annotationAnimation');
      case 'typography':
        return translate('gallery.videoReview.annotationTypography');
      case 'content':
        return translate('gallery.videoReview.annotationContent');
      case 'geometry':
        return translate('gallery.videoReview.annotationGeometry');
      case 'parameters':
        return translate('gallery.videoReview.annotationParameters');
      default:
        return group;
    }
  };
  const sections = [
    {
      id: 'timing',
      label: translate('gallery.videoReview.annotationTiming'),
      icon: Clock3,
      content: (
        <>
          {number(
            'start',
            translate('gallery.videoReview.annotationStart'),
            instance.start,
            (start) => ({ start }),
            0,
            instance.end - 0.001,
            's'
          )}
          {number(
            'end',
            translate('gallery.videoReview.annotationEnd'),
            instance.end,
            (end) => ({ end }),
            instance.start + 0.001,
            props.duration,
            's'
          )}
          <ToggleField
            value={instance.enabled}
            disabled={disabled}
            label={translate('gallery.videoReview.annotationEnabled')}
            onChange={(enabled) => editor.change(instance.id, { enabled })}
          />
        </>
      ),
    },
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
              if (geometry) {
                const next = convertReviewAnnotationAttachment(instance, attachment, geometry);
                if (next)
                  editor.change(instance.id, {
                    attachment,
                    transform: next.transform,
                    ...(next.anchors ? { anchors: next.anchors } : {}),
                  });
              }
            }}
          />
          {!converted && (
            <div role="status">
              {translate('gallery.videoReview.annotationAttachmentUnavailable')}
            </div>
          )}
          {!document.objectLayout && (
            <div className="flex min-h-8 min-w-0 items-center justify-between gap-2 text-xs">
              <span className="shrink-0 text-[var(--sniptale-color-text-secondary)]">
                {translate('gallery.videoReview.annotationLayout')}
              </span>
              <span className="min-w-0 truncate text-[var(--sniptale-color-text-primary)]">
                {translate('gallery.videoReview.annotationFullScene')}
              </span>
            </div>
          )}
          {number(
            'x',
            translate('gallery.videoReview.annotationX'),
            transform.x * 100,
            (x) => ({ transform: { ...transform, x: x / 100 } }),
            -1600,
            1600,
            '%'
          )}
          {number(
            'y',
            translate('gallery.videoReview.annotationY'),
            transform.y * 100,
            (y) => ({ transform: { ...transform, y: y / 100 } }),
            -1600,
            1600,
            '%'
          )}
          {number(
            'width',
            translate('gallery.videoReview.annotationWidth'),
            transform.width * 100,
            (width) => dimension('width', width),
            0.01,
            1600,
            '%'
          )}
          {number(
            'height',
            translate('gallery.videoReview.annotationHeight'),
            transform.height * 100,
            (height) => dimension('height', height),
            0.01,
            1600,
            '%'
          )}
          {number(
            'rotation',
            translate('gallery.videoReview.annotationRotation'),
            (transform.rotation * 180) / Math.PI,
            (rotation) => ({ transform: { ...transform, rotation: (rotation * Math.PI) / 180 } }),
            -360,
            360,
            'deg'
          )}
        </>
      ),
    },
    ...(document.controlPresets?.length
      ? [
          {
            id: 'presets',
            label: translate('gallery.videoReview.annotationPresets'),
            icon: Palette,
            content: (
              <AnnotationPreset
                document={document}
                instance={instance}
                editor={editor}
                locale={locale}
                disabled={disabled}
              />
            ),
          },
        ]
      : []),
    ...[...groups].map(([group, controls]) => ({
      id: `sdk:${group}`,
      label: label(group),
      icon: Shapes,
      content: (
        <div className="flex min-w-0 flex-col gap-2">
          {controls.map((control) => (
            <AnnotationControl
              key={control.id}
              document={document}
              control={control}
              instance={instance}
              value={values[control.id] ?? resolveEffectV1ControlDefault(control, locale)}
              locale={locale}
              editor={editor}
              disabled={disabled}
              preview={preview}
              commit={commit}
            />
          ))}
        </div>
      ),
    })),
    reviewInspectorActions(
      <>
        <ReviewButton
          label={translate('gallery.videoReview.annotationDuplicate')}
          className={reviewTextButtonClassName}
          disabled={disabled}
          onClick={() => editor.duplicate(instance.id)}
        >
          <Copy size={16} aria-hidden="true" />
          <span>{translate('gallery.videoReview.annotationDuplicate')}</span>
        </ReviewButton>
        <ReviewButton
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
      <div className="flex min-h-8 min-w-0 items-center justify-between gap-2 text-xs">
        <span className="shrink-0 text-[var(--sniptale-color-text-secondary)]">
          {translate('gallery.videoReview.annotationName')}
        </span>
        <span
          className="min-w-0 truncate text-[var(--sniptale-color-text-primary)]"
          title={resolveEffectLocaleText(document.label, locale)}
        >
          {resolveEffectLocaleText(document.label, locale)}
        </span>
      </div>
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

function AnnotationPreset(props: {
  document: EffectV1Document;
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
        editor.change(instance.id, {
          controls: applyEffectV1ControlPreset(document, instance.controls, id),
        })
      }
    />
  );
}

function AnnotationControl(props: {
  document: EffectV1Document;
  control: ControlDefinition;
  instance: ReviewAnnotationEffect;
  value: string | number;
  locale: string;
  editor: Editor;
  disabled: boolean;
  preview(patch: Patch): void;
  commit(): void;
}) {
  const { control, instance, editor } = props;
  const cancelling = useRef(false);
  const label = resolveEffectLocaleText(control.label, props.locale) || control.id;
  const bound = props.document.objectLayout?.handles?.some(
    (handle) => handle.xControl === control.id || handle.yControl === control.id
  );
  const disabled = props.disabled || (!!bound && !editor.geometry);
  const patch = (value: string | number): Patch | null => {
    if (bound) {
      const anchors =
        typeof value === 'number' && editor.geometry
          ? changeReviewAnnotationBoundControl(
              instance,
              props.document,
              editor.geometry,
              control.id,
              value
            )
          : null;
      return anchors ? { anchors } : null;
    }
    return { controls: { ...instance.controls, [control.id]: value } };
  };
  const preview = (value: string | number) => {
    const next = patch(value);
    if (next) props.preview(next);
  };
  if (control.options?.length)
    return (
      <SelectField
        className={reviewSelectFieldClassName}
        label={label}
        disabled={disabled}
        value={control.options.findIndex((item) => item.value === props.value).toString()}
        options={control.options.map((option, index) => ({
          value: index.toString(),
          label: resolveEffectLocaleText(option.label, props.locale),
        }))}
        onChange={(id) => {
          const option = control.options?.find((_, index) => index.toString() === id);
          if (option) {
            preview(option.value);
            props.commit();
          }
        }}
      />
    );
  if (control.kind === 'number') {
    const value = typeof props.value === 'number' ? props.value : control.defaultValue;
    const layout = props.document.objectLayout;
    const handle = layout?.handles?.find(
      (item) => item.xControl === control.id || item.yControl === control.id
    );
    const length =
      handle && layout
        ? handle.xControl === control.id
          ? layout.width
          : layout.height
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
        patch={patch}
        scrub={annotationNumericScrub(
          value,
          control.min,
          control.max,
          control.step,
          length === undefined ? undefined : { min: -length, max: 2 * length }
        )}
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
    <TextField
      label={label}
      disabled={disabled}
      value={typeof props.value === 'string' ? props.value : control.defaultValue}
      onChange={(event) => preview(event.currentTarget.value)}
      onBlur={() => {
        if (!cancelling.current) props.commit();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          cancelling.current = true;
          editor.cancelGesture();
          event.currentTarget.blur();
          cancelling.current = false;
        } else if (event.key === 'Enter') {
          event.preventDefault();
          props.commit();
        }
      }}
    />
  );
}
