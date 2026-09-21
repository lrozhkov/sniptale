import { CompactPaintSelector } from '../../ui/paint-selector';
import { ColorField } from '../../ui/compact-inspector-controls/controls';
import { Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { serializePaintToCss } from '@sniptale/foundation/paint';
import { translate } from '../../platform/i18n';
import type { CanvasComment, ReviewAnnotation } from '../../features/video/review/types';
import {
  CANVAS_COMMENT_STYLE_PRESETS,
  clampCanvasCommentTimes,
} from '../../features/video/review/comments';
import { ReviewButton, reviewTimeLabel } from './controls';

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
    <fieldset className="space-y-1">
      <legend className="text-xs text-[var(--sniptale-color-text-muted)]">
        {translate('gallery.videoReview.overlayWindow')}
      </legend>
      <div className="flex gap-2">
        <label className="flex-1 text-xs">
          {translate('gallery.videoReview.overlayStart')}
          <input
            data-ui="gallery.videoReview.overlayStartInput"
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
            className="mt-1 w-full rounded-md border
                border-[var(--sniptale-color-border-soft)] px-2 py-1 text-sm tabular-nums"
          />
        </label>
        <label className="flex-1 text-xs">
          {translate('gallery.videoReview.overlayEnd')}
          <input
            data-ui="gallery.videoReview.overlayEndInput"
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
            className="mt-1 w-full rounded-md border
                border-[var(--sniptale-color-border-soft)] px-2 py-1 text-sm tabular-nums"
          />
        </label>
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
  const toggleButton = 'aria-pressed:!bg-[var(--sniptale-color-accent-soft)]';
  return (
    <fieldset className="space-y-1">
      <legend className="text-xs text-[var(--sniptale-color-text-muted)]">
        {translate('gallery.videoReview.overlayPlacement')}
      </legend>
      <div className="flex flex-wrap gap-1">
        <ReviewButton
          label={translate('gallery.videoReview.overlayAbove')}
          aria-pressed={props.placement !== 'below'}
          disabled={props.busy}
          className={`!border-0 !bg-transparent !shadow-none !text-xs ${toggleButton}`}
          onClick={() => {
            if (props.placement === 'below') props.onPatch({ placement: 'above' });
          }}
        />
        <ReviewButton
          label={translate('gallery.videoReview.overlayBelow')}
          aria-pressed={props.placement === 'below'}
          disabled={props.busy}
          className={`!border-0 !bg-transparent !shadow-none !text-xs ${toggleButton}`}
          onClick={() => {
            if (props.placement !== 'below') props.onPatch({ placement: 'below' });
          }}
        />
      </div>
    </fieldset>
  );
}

/** Shared bubble presets; preview and export paint the same surfaces. */
function ReviewOverlayStyleRow(props: {
  style: CanvasComment['style'];
  busy: boolean;
  onPatch(patch: Partial<Omit<CanvasComment, 'id'>>): void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-xs text-[var(--sniptale-color-text-muted)]">
        {translate('gallery.videoReview.overlayStyle')}
      </span>
      {CANVAS_COMMENT_STYLE_PRESETS.map((preset, index) => {
        const active = JSON.stringify(props.style.fillPaint) === JSON.stringify(preset.fillPaint);
        return (
          <button
            key={index}
            type="button"
            aria-label={`${translate('gallery.videoReview.overlayStyle')} ${index + 1}`}
            aria-pressed={active}
            disabled={props.busy}
            className="h-5 w-5 rounded-full border border-[var(--sniptale-color-border-soft)]
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
  const toggleButton = 'aria-pressed:!bg-[var(--sniptale-color-accent-soft)]';
  return (
    <div
      data-ui="gallery.videoReview.canvasCommentEditor"
      className="space-y-2 rounded-lg
        border border-[var(--sniptale-color-accent)] p-3"
    >
      <label className="block text-xs text-[var(--sniptale-color-text-muted)]">
        {translate(linked ? linkedTextPlaceholder : 'gallery.videoReview.overlayText')}
        <textarea
          data-ui="gallery.videoReview.overlayTextInput"
          value={linked ? '' : text}
          placeholder={linked ? translate('gallery.videoReview.overlayLinkedHint') : undefined}
          disabled={props.busy || linked}
          readOnly={linked}
          onChange={(event) => change(event.target.value)}
          onBlur={(event) => {
            if (
              event.relatedTarget instanceof Element &&
              event.relatedTarget.closest('[data-ui="gallery.videoReview.canvasCommentEditor"]')
            ) {
              pause();
              return;
            }
            commit(event.target.value);
          }}
          className="mt-1 w-full resize-none rounded-md border
              border-[var(--sniptale-color-border-soft)] p-2 text-sm"
          rows={3}
        />
      </label>
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
      <fieldset className="space-y-1">
        <legend className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('gallery.videoReview.behaviorAtZoom')}
        </legend>
        <div className="flex flex-wrap gap-1">
          <ReviewButton
            label={translate('gallery.videoReview.followVideo')}
            aria-pressed={props.comment.attachment === 'content'}
            disabled={props.busy}
            className={`!border-0 !bg-transparent !shadow-none !text-xs ${toggleButton}`}
            onClick={() => props.onSwitchAttachment('content')}
          />
          <ReviewButton
            label={translate('gallery.videoReview.stayOnScreen')}
            aria-pressed={props.comment.attachment === 'viewport'}
            disabled={props.busy}
            className={`!border-0 !bg-transparent !shadow-none !text-xs ${toggleButton}`}
            onClick={() => props.onSwitchAttachment('viewport')}
          />
        </div>
      </fieldset>
      <ReviewOverlayPlacementFields
        placement={props.comment.placement}
        busy={props.busy}
        onPatch={patchComment}
      />
      <ReviewOverlayStyleRow style={props.comment.style} busy={props.busy} onPatch={patchComment} />
      <ReviewCommentStyleFields
        style={props.comment.style}
        busy={props.busy}
        onPatch={patchComment}
      />
      <ReviewOverlayFlagRow
        comment={props.comment}
        busy={props.busy}
        onPatch={patchComment}
        onDelete={props.onDelete}
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
    <fieldset disabled={props.busy} className="space-y-2">
      <CompactPaintSelector
        label={translate('gallery.videoReview.overlayFill')}
        title={translate('gallery.videoReview.overlayFill')}
        value={props.style.fillPaint}
        disabled={props.busy}
        onChange={(fillPaint) => patch({ fillPaint })}
      />
      <ColorField
        label={translate('gallery.videoReview.overlayTextColor')}
        title={translate('gallery.videoReview.overlayTextColor')}
        value={props.style.textColor}
        disabled={props.busy}
        allowAlpha={false}
        allowTransparent={false}
        palette={['#111827', '#ffffff', '#334155', '#f97316']}
        onChange={(textColor) => patch({ textColor })}
      />
      <div className="grid grid-cols-2 gap-2">
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
          <label key={field.key} className="text-xs text-[var(--sniptale-color-text-muted)]">
            {translate(field.label)}
            <input
              type="number"
              min={field.min}
              max={field.max}
              step={1}
              key={`${props.style[field.key] ?? field.fallback}`}
              defaultValue={props.style[field.key] ?? field.fallback}
              className="mt-1 w-full rounded-md border border-[var(--sniptale-color-border-soft)]
                px-2 py-1 text-sm tabular-nums"
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
          </label>
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
  onDelete(): void;
}) {
  const toggleButton = 'aria-pressed:!bg-[var(--sniptale-color-accent-soft)]';
  return (
    <div className="flex flex-wrap gap-2">
      <ReviewButton
        label={translate('gallery.videoReview.overlayVisible')}
        aria-pressed={props.comment.visible}
        disabled={props.busy}
        className={`!text-xs ${toggleButton}`}
        onClick={() => props.onPatch({ visible: !props.comment.visible })}
      />
      <ReviewButton
        label={translate('gallery.videoReview.overlayRenderToVideo')}
        aria-pressed={props.comment.renderToVideo}
        disabled={props.busy}
        className={`!text-xs ${toggleButton}`}
        onClick={() => props.onPatch({ renderToVideo: !props.comment.renderToVideo })}
      />
      <ReviewButton
        label={translate('gallery.videoReview.overlayDelete')}
        disabled={props.busy}
        className="!border-0 !bg-transparent !shadow-none !text-xs"
        onClick={props.onDelete}
      >
        {translate('gallery.videoReview.overlayDelete')}
      </ReviewButton>
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
                    className={`rounded-lg border p-3 ${
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
