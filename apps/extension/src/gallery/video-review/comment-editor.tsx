import { InspectorParameterRow } from '../../ui/compact-inspector-controls/layout';
import { CompactPaintSelector } from '../../ui/paint-selector';
import {
  ColorField,
  SegmentedRow,
  TextareaField,
  ToggleField,
} from '../../ui/compact-inspector-controls';
import { Plus, Type, Paintbrush, Play, Trash2 } from 'lucide-react';
import {
  reviewInspectorActions,
  ReviewInspectorSections,
  ReviewInspectorColumns,
} from './inspector-sections';
import { useEffect, useRef, useState } from 'react';
import { serializePaintToCss } from '@sniptale/foundation/paint';
import { translate } from '../../platform/i18n';
import type { CanvasComment, ReviewAnnotation } from '../../features/video/review/types';
import {
  CANVAS_COMMENT_STYLE_PRESETS,
  clampCanvasCommentTimes,
} from '../../features/video/review/comments';
import { ReviewButton, reviewTimeLabel, reviewDeleteButtonClassName } from './controls';

/** Text from the linked annotation is edited there; the overlay only references it. */
const linkedTextPlaceholder = 'gallery.videoReview.overlayLinkedText';

const resolveTimes = (value: string): number | undefined => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/** Editor for one selected overlay comment: text, timing, styling, and visibility flags. */
/** Numeric show-time window bounded by the source and by window order. */
function ReviewOverlayTimeFields(props: {
  comment: CanvasComment;
  duration: number;
  busy: boolean;
  start: string;
  end: string;
  onInputStart(value: string): void;
  onInputEnd(value: string): void;
  onCommit(window: { start?: number | undefined; end?: number | undefined }): void;
}) {
  return (
    <fieldset className="sniptale-parameter-stack">
      <legend className="text-xs text-[var(--sniptale-color-text-muted)]">
        {translate('gallery.videoReview.overlayWindow')}
      </legend>
      <div className="sniptale-parameter-stack">
        <InspectorParameterRow label={translate('gallery.videoReview.overlayStart')}>
          <input
            data-ui="gallery.videoReview.overlayStartInput"
            aria-label={translate('gallery.videoReview.overlayStart')}
            type="number"
            step={0.1}
            min={0}
            max={props.duration}
            disabled={props.busy}
            value={props.start}
            onChange={(event) => props.onInputStart(event.target.value)}
            onBlur={() =>
              props.onCommit({ start: resolveTimes(props.start), end: props.comment.end })
            }
            className="h-8 w-full min-w-0 rounded-md border border-transparent
              bg-transparent px-2 py-1 text-right tabular-nums"
          />
        </InspectorParameterRow>
        <InspectorParameterRow label={translate('gallery.videoReview.overlayEnd')}>
          <input
            data-ui="gallery.videoReview.overlayEndInput"
            aria-label={translate('gallery.videoReview.overlayEnd')}
            type="number"
            step={0.1}
            min={0}
            max={props.duration}
            disabled={props.busy}
            value={props.end}
            onChange={(event) => props.onInputEnd(event.target.value)}
            onBlur={() =>
              props.onCommit({ start: props.comment.start, end: resolveTimes(props.end) })
            }
            className="h-8 w-full min-w-0 rounded-md border border-transparent
              bg-transparent px-2 py-1 text-right tabular-nums"
          />
        </InspectorParameterRow>
      </div>
    </fieldset>
  );
}

/** Bubble placement toggle; the anchor point itself never moves. */
function ReviewOverlayPlacementFields(props: {
  placement: CanvasComment['placement'];
  busy: boolean;
  onPatch(patch: Partial<Omit<CanvasComment, 'id'>>): void;
}) {
  return (
    <SegmentedRow
      label={translate('gallery.videoReview.overlayPlacement')}
      ariaLabel={translate('gallery.videoReview.overlayPlacement')}
      columns={2}
      value={props.placement === 'below' ? 'below' : 'above'}
      options={[
        {
          value: 'above',
          label: translate('gallery.videoReview.overlayAbove'),
          disabled: props.busy,
        },
        {
          value: 'below',
          label: translate('gallery.videoReview.overlayBelow'),
          disabled: props.busy,
        },
      ]}
      onChange={(placement) => {
        if (placement !== (props.placement === 'below' ? 'below' : 'above'))
          props.onPatch({ placement });
      }}
    />
  );
}

/** Shared bubble presets; preview and export paint the same surfaces. */
function ReviewOverlayStyleRow(props: {
  style: CanvasComment['style'];
  busy: boolean;
  onPatch(patch: Partial<Omit<CanvasComment, 'id'>>): void;
}) {
  return (
    <InspectorParameterRow label={translate('gallery.videoReview.overlayStyle')}>
      <div className="flex flex-wrap items-center gap-1">
        {CANVAS_COMMENT_STYLE_PRESETS.map((preset, index) => {
          const active = JSON.stringify(props.style.fillPaint) === JSON.stringify(preset.fillPaint);
          return (
            <button
              key={index}
              type="button"
              aria-label={`${translate('gallery.videoReview.overlayStyle')} ${index + 1}`}
              aria-pressed={active}
              disabled={props.busy}
              className="h-6 w-6 rounded-full border border-[var(--sniptale-color-border-soft)]
                aria-pressed:outline aria-pressed:outline-2
                aria-pressed:outline-[var(--sniptale-color-accent)]"
              style={{ background: serializePaintToCss(preset.fillPaint) }}
              onClick={() =>
                props.onPatch({
                  style: {
                    ...props.style,
                    fillPaint: { ...preset.fillPaint },
                    textColor: preset.textColor,
                  },
                })
              }
            />
          );
        })}
      </div>
    </InspectorParameterRow>
  );
}

type CanvasCommentEditorProps = {
  comment: CanvasComment;
  annotations: readonly ReviewAnnotation[];
  duration: number;
  busy: boolean;
  onPatch(patch: Partial<Omit<CanvasComment, 'id'>>): void;
  onSwitchAttachment(attachment: CanvasComment['attachment']): void;
  onDraft?(id: string, text: string): void;
  onDelete(): void;
};

/** Text draft timing is independent of the appearance and placement controls. */
function useCommentEditorDraft(props: CanvasCommentEditorProps) {
  const linked = !!props.comment.annotationId;
  const [text, setText] = useState(props.comment.text);
  const [start, setStart] = useState(props.comment.start?.toString() ?? '');
  const [end, setEnd] = useState(props.comment.end?.toString() ?? '');
  const timer = useRef<number | null>(null);
  const committed = useRef<string | null>(null);
  const textRef = useRef(text);
  const propsRef = useRef(props);
  useEffect(() => {
    textRef.current = text;
  }, [text]);
  useEffect(() => {
    propsRef.current = props;
  });
  // A late persisted prop must never cancel an in-progress local draft; only a
  // fresh comment identity (or a quiet external change) resets the editor.
  useEffect(() => {
    const current = propsRef.current;
    setText(current.comment.text);
    setStart(current.comment.start?.toString() ?? '');
    setEnd(current.comment.end?.toString() ?? '');
    committed.current = null;
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
    };
  }, [props.comment.id]);
  useEffect(
    () => () => {
      if (textRef.current !== propsRef.current.comment.text)
        propsRef.current.onPatch({ text: textRef.current });
    },
    []
  );
  useEffect(() => {
    if (props.comment.text === committed.current) {
      committed.current = null;
      return;
    }
    if (timer.current === null && textRef.current === committed.current)
      setText(props.comment.text);
  }, [props.comment.text]);
  const pause = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const commit = (value: string) => {
    pause();
    if (value !== props.comment.text) {
      committed.current = value;
      props.onPatch({ text: value });
    }
  };
  const change = (value: string) => {
    setText(value);
    props.onDraft?.(props.comment.id, value);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => commit(value), 320);
  };
  const patchComment = (patch: Partial<Omit<CanvasComment, 'id'>>) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    props.onPatch({ ...patch, ...(linked ? {} : { text: textRef.current }) });
  };
  const patchTimes = (window: { start?: number | undefined; end?: number | undefined }) => {
    const bounded = clampCanvasCommentTimes(props.comment, window, props.duration);
    setStart(bounded.start?.toString() ?? '');
    setEnd(bounded.end?.toString() ?? '');
    patchComment(bounded);
  };
  return { text, start, end, setStart, setEnd, change, commit, pause, patchComment, patchTimes };
}

export function ReviewCanvasCommentEditor(props: CanvasCommentEditorProps) {
  const linked = !!props.comment.annotationId;
  const { text, start, end, setStart, setEnd, change, commit, pause, patchComment, patchTimes } =
    useCommentEditorDraft(props);
  return (
    <div data-ui="gallery.videoReview.canvasCommentEditor" className="min-w-0 space-y-3">
      <ReviewInspectorSections
        sections={[
          {
            id: 'content',
            label: translate('videoEditor.sidebar.inspectorGroupContent'),
            icon: Type,
            content: (
              <TextareaField
                label={translate(
                  linked ? linkedTextPlaceholder : 'gallery.videoReview.overlayText'
                )}
                data-ui="gallery.videoReview.overlayTextInput"
                value={linked ? '' : text}
                placeholder={
                  linked ? translate('gallery.videoReview.overlayLinkedHint') : undefined
                }
                disabled={props.busy || linked}
                readOnly={linked}
                onChange={change}
                onBlur={(event) => {
                  if (
                    event.relatedTarget instanceof Element &&
                    event.relatedTarget.closest(
                      '[data-ui="gallery.videoReview.canvasCommentEditor"]'
                    )
                  ) {
                    pause();
                    return;
                  }
                  commit(event.target.value);
                }}
                rows={3}
              />
            ),
          },
          {
            id: 'appearance',
            label: translate('videoEditor.effectsLibrary.objectAppearance'),
            icon: Paintbrush,
            content: (
              <ReviewInspectorColumns>
                <ReviewOverlayPlacementFields
                  placement={props.comment.placement}
                  busy={props.busy}
                  onPatch={patchComment}
                />
                <div className="sniptale-parameter-stack">
                  <ReviewOverlayStyleRow
                    style={props.comment.style}
                    busy={props.busy}
                    onPatch={patchComment}
                  />
                  <ReviewCommentStyleFields
                    style={props.comment.style}
                    busy={props.busy}
                    onPatch={patchComment}
                  />
                </div>
              </ReviewInspectorColumns>
            ),
          },
          {
            id: 'playback',
            label: translate('scenario.editor.tourPlayback'),
            icon: Play,
            content: (
              <ReviewInspectorColumns>
                <ReviewOverlayTimeFields
                  comment={props.comment}
                  duration={props.duration}
                  busy={props.busy}
                  start={start}
                  end={end}
                  onInputStart={setStart}
                  onInputEnd={setEnd}
                  onCommit={patchTimes}
                />
                <div className="sniptale-parameter-stack">
                  <SegmentedRow
                    label={translate('gallery.videoReview.behaviorAtZoom')}
                    ariaLabel={translate('gallery.videoReview.behaviorAtZoom')}
                    columns={2}
                    value={props.comment.attachment}
                    options={[
                      {
                        value: 'content',
                        label: translate('gallery.videoReview.followVideo'),
                        disabled: props.busy,
                      },
                      {
                        value: 'viewport',
                        label: translate('gallery.videoReview.stayOnScreen'),
                        disabled: props.busy,
                      },
                    ]}
                    onChange={props.onSwitchAttachment}
                  />
                  <ReviewOverlayFlagRow
                    comment={props.comment}
                    busy={props.busy}
                    onPatch={patchComment}
                  />
                </div>
              </ReviewInspectorColumns>
            ),
          },
          reviewInspectorActions(
            <>
              <ReviewButton
                label={translate('gallery.videoReview.overlayDelete')}
                disabled={props.busy}
                className={`${reviewDeleteButtonClassName} !w-full justify-start`}
                onClick={props.onDelete}
              >
                <Trash2 size={15} aria-hidden="true" />
                <span>{translate('gallery.videoReview.overlayDelete')}</span>
              </ReviewButton>
            </>
          ),
        ]}
      />
    </div>
  );
}

/** Bounded style values share the same paint/color controls as tour comments. */
function ReviewCommentStyleFields(props: {
  style: CanvasComment['style'];
  busy: boolean;
  onPatch(patch: Partial<Omit<CanvasComment, 'id'>>): void;
}) {
  const patch = (style: Partial<CanvasComment['style']>) =>
    props.onPatch({ style: { ...props.style, ...style } });
  return (
    <fieldset disabled={props.busy} className="sniptale-parameter-stack">
      <CompactPaintSelector
        triggerVariant="swatch"
        label={translate('gallery.videoReview.overlayFill')}
        title={translate('gallery.videoReview.overlayFill')}
        value={props.style.fillPaint}
        disabled={props.busy}
        onChange={(fillPaint) => patch({ fillPaint })}
      />
      <ColorField
        triggerVariant="swatch"
        floatingPlacement="side"
        label={translate('gallery.videoReview.overlayTextColor')}
        title={translate('gallery.videoReview.overlayTextColor')}
        value={props.style.textColor}
        disabled={props.busy}
        allowAlpha={false}
        allowTransparent={false}
        palette={['#111827', '#ffffff', '#334155', '#f97316']}
        onChange={(textColor) => patch({ textColor })}
      />
      <div className="sniptale-parameter-stack">
        {(
          [
            {
              key: 'width',
              label: 'gallery.videoReview.overlayWidth',
              min: 80,
              max: 640,
              fallback: 224,
            },
            {
              key: 'fontSize',
              label: 'gallery.videoReview.overlayFontSize',
              min: 10,
              max: 48,
              fallback: 12,
            },
            {
              key: 'padding',
              label: 'gallery.videoReview.overlayPadding',
              min: 0,
              max: 32,
              fallback: 10,
            },
            {
              key: 'radius',
              label: 'gallery.videoReview.overlayRadius',
              min: 0,
              max: 64,
              fallback: 14,
            },
          ] as const
        ).map((field) => (
          <InspectorParameterRow key={field.key} label={translate(field.label)}>
            <input
              type="number"
              aria-label={translate(field.label)}
              min={field.min}
              max={field.max}
              step={1}
              key={`${props.style[field.key] ?? field.fallback}`}
              defaultValue={props.style[field.key] ?? field.fallback}
              className="h-8 w-full min-w-0 rounded-md border border-transparent
                bg-transparent px-2 py-1 text-right text-xs tabular-nums"
              onBlur={(event) => {
                const value = event.currentTarget.valueAsNumber;
                const bounded = Number.isFinite(value)
                  ? Math.max(field.min, Math.min(field.max, value))
                  : (props.style[field.key] ?? field.fallback);
                event.currentTarget.value = String(bounded);
                patch({ [field.key]: bounded });
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape')
                  event.currentTarget.value = String(props.style[field.key] ?? field.fallback);
                if (event.key === 'Enter' || event.key === 'Escape') {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
            />
          </InspectorParameterRow>
        ))}
      </div>
    </fieldset>
  );
}

/** Visibility, burn-in, and delete: the comment lifecycle toggles. */
function ReviewOverlayFlagRow(props: {
  comment: CanvasComment;
  busy: boolean;
  onPatch(patch: Partial<Omit<CanvasComment, 'id'>>): void;
}) {
  return (
    <div className="sniptale-parameter-stack">
      <ToggleField
        label={translate('gallery.videoReview.overlayVisible')}
        value={props.comment.visible}
        disabled={props.busy}
        onChange={(visible) => props.onPatch({ visible })}
      />
      <ToggleField
        label={translate('gallery.videoReview.overlayRenderToVideo')}
        value={props.comment.renderToVideo}
        disabled={props.busy}
        onChange={(renderToVideo) => props.onPatch({ renderToVideo })}
      />
    </div>
  );
}

/** Inspector section for overlay comments: the list plus the editor of the selection. */
export function ReviewCanvasCommentsSection(props: {
  view?: 'list' | 'selected';
  comments: readonly CanvasComment[];
  annotations: readonly ReviewAnnotation[];
  duration: number;
  selectedId: string | null;
  busy: boolean;
  onSelect(id: string): void;
  onAdd(): void;
  onPatch(comment: CanvasComment, patch: Partial<Omit<CanvasComment, 'id'>>): void;
  onSwitchAttachment(comment: CanvasComment, attachment: CanvasComment['attachment']): void;
  onDraft(id: string, text: string): void;
  onDelete(comment: CanvasComment): void;
  flushTexts(): Promise<void>;
}) {
  const selected = props.comments.find((comment) => comment.id === props.selectedId) ?? null;
  return (
    <div data-ui="gallery.videoReview.canvasComments" className="space-y-2">
      {props.view !== 'selected' ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              {translate('gallery.videoReview.overlayComments')}
            </h3>
            <ReviewButton
              label={translate('gallery.videoReview.addOverlayComment')}
              disabled={props.busy}
              className="!h-7 !min-h-7 !border-0 !bg-transparent !shadow-none"
              onClick={props.onAdd}
            >
              <Plus size={16} />
            </ReviewButton>
          </div>
          {props.comments.length ? (
            <ol className="space-y-2">
              {props.comments.map((comment) => {
                const text =
                  props.annotations.find((item) => item.id === comment.annotationId)?.text ??
                  comment.text;
                return (
                  <li
                    key={comment.id}
                    className={`rounded-[var(--sniptale-radius-sm)] border p-3 ${
                      props.selectedId === comment.id
                        ? 'border-[var(--sniptale-color-accent)]'
                        : 'border-[var(--sniptale-color-border-soft)]'
                    }`}
                  >
                    <button
                      type="button"
                      className="block w-full text-left"
                      onClick={() => props.onSelect(comment.id)}
                    >
                      <span className="text-xs tabular-nums text-[var(--sniptale-color-text-muted)]">
                        {comment.start === undefined
                          ? translate('gallery.videoReview.overlayComments')
                          : reviewTimeLabel(comment.start)}
                      </span>
                      <span className="mt-1 block whitespace-pre-wrap break-words text-sm">
                        {text.trim() ? text : translate('gallery.videoReview.overlayPoint')}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="text-xs text-[var(--sniptale-color-text-muted)]">
              {translate('gallery.videoReview.overlayComments')}
            </p>
          )}
        </>
      ) : null}
      {selected && props.view !== 'list' ? (
        <ReviewCanvasCommentEditor
          comment={selected}
          annotations={props.annotations}
          duration={props.duration}
          busy={props.busy}
          onPatch={(patch) => void props.onPatch(selected, patch)}
          onSwitchAttachment={(attachment) => props.onSwitchAttachment(selected, attachment)}
          onDraft={props.onDraft}
          onDelete={() => void props.onDelete(selected)}
        />
      ) : null}
    </div>
  );
}
