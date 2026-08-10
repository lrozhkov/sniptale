import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  clampDrawingTextWidth,
  resolveDrawingTextNaturalWidth,
  resolveDrawingTextFontFamily,
  resolveDrawingTextHeight,
  type DrawingObject,
  type DrawingPoint,
} from '../../features/drawing/public';
import { translate } from '../../platform/i18n';
import type { ContentDrawingController } from './controller';
import { createDrawingId } from './interaction';
import {
  DrawingTextBackgrounds,
  resolveDrawingTextDomValue,
  resolveDrawingTextContentStyle,
  useDrawingTextBackgroundRects,
  type DrawingTextVisualStyle,
} from './text-content';

export type DrawingTextDraft = {
  autoWidth?: boolean;
  id: string | null;
  maxWidth?: number;
  point: DrawingPoint;
  rotation?: number;
  height?: number;
  value: string;
  width?: number;
};

export function useDrawingTextEditor(controller: ContentDrawingController) {
  const [draft, setDraftState] = useState<DrawingTextDraft | null>(null);
  const draftRef = useRef<DrawingTextDraft | null>(null);
  const setDraft = useCallback((next: DrawingTextDraft | null) => {
    draftRef.current = next;
    setDraftState(next);
  }, []);
  const cancel = useCallback(() => setDraft(null), [setDraft]);

  const commit = useCallback(() => {
    const current = draftRef.current;
    if (!current) return;
    setDraft(null);
    const text = current.value.trim();
    if (text) {
      const snapshot = controller.session.getSnapshot();
      const defaults = snapshot.defaults.text;
      const existing = current.id
        ? snapshot.document.objects.find(
            (object) => object.id === current.id && object.kind === 'text'
          )
        : null;
      const style =
        existing?.kind === 'text'
          ? {
              color: existing.color,
              backgroundColor: existing.backgroundColor,
              fontFamily: existing.fontFamily ?? 'sans',
              fontSize: existing.fontSize,
            }
          : defaults;
      const width = clampDrawingTextWidth(
        text,
        style.fontSize,
        current.width ??
          (existing?.kind === 'text'
            ? existing.bounds.width
            : resolveDrawingTextNaturalWidth(text, style.fontSize, current.maxWidth ?? 640)),
        current.autoWidth ? current.maxWidth : Number.POSITIVE_INFINITY
      );
      const object = {
        id: current.id ?? createDrawingId(),
        kind: 'text' as const,
        text,
        bounds: {
          x: current.point.x,
          y: current.point.y,
          width,
          height: current.height ?? resolveDrawingTextHeight(text, style.fontSize, width),
        },
        ...(existing?.kind === 'text' && existing.rotation !== undefined
          ? { rotation: existing.rotation }
          : {}),
        ...style,
      };
      if (current.id) controller.session.replaceObject(object);
      else controller.session.commitObject(object);
    }
  }, [controller, setDraft]);

  const edit = useCallback(
    (object: Extract<DrawingObject, { kind: 'text' }>) => {
      setDraft({
        id: object.id,
        point: object.bounds,
        ...(object.rotation === undefined ? {} : { rotation: object.rotation }),
        value: object.text,
        width: object.bounds.width,
        autoWidth: false,
      });
    },
    [setDraft]
  );

  const finalize = useCallback(() => {
    if (draftRef.current?.value.trim()) commit();
    else setDraft(null);
  }, [commit, setDraft]);

  return { cancel, commit, draft, edit, finalize, setDraft };
}

type DrawingTextEditorProps = {
  draft: DrawingTextDraft;
  layoutRevision?: number;
  projection: DrawingPoint;
  style: DrawingTextVisualStyle;
  onCancel: () => void;
  onChange: (draft: DrawingTextDraft) => void;
  onCommit: () => void;
};

function useDrawingTextEditorLayout(props: DrawingTextEditorProps) {
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLSpanElement>(null);
  const measurementRef = useRef<HTMLSpanElement>(null);
  const initialValueLengthRef = useRef(props.draft.value.length);
  const resolvedFontFamily = resolveDrawingTextFontFamily(props.style.fontFamily);
  const draft = props.draft;
  const fontSize = props.style.fontSize;
  const onChange = props.onChange;
  const backgroundRects = useDrawingTextBackgroundRects({
    contentRef: mirrorRef,
    fontFamily: resolvedFontFamily,
    fontSize: props.style.fontSize,
    value: props.draft.value,
  });
  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.scrollTop = 0;
    const frame = requestAnimationFrame(() => {
      if (editorRef.current === editor) editor.scrollTop = 0;
    });
    return () => cancelAnimationFrame(frame);
  }, [draft.value, props.layoutRevision]);

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    editor.setSelectionRange(initialValueLengthRef.current, initialValueLengthRef.current);
  }, []);

  useLayoutEffect(() => {
    let active = true;
    const synchronizeBounds = () => {
      if (!active) return;
      const mirror = mirrorRef.current;
      const measuredHeight = mirror ? Math.ceil(mirror.getBoundingClientRect().height) : 0;
      const measurer = measurementRef.current;
      const measuredWidth = measurer ? Math.ceil(measurer.getBoundingClientRect().width) : 0;
      const nextHeight = measuredHeight > 0 ? measuredHeight : draft.height;
      const nextWidth =
        draft.autoWidth && measuredWidth > 0
          ? clampDrawingTextWidth(draft.value, fontSize, measuredWidth, draft.maxWidth)
          : draft.width;
      if (nextHeight === draft.height && nextWidth === draft.width) return;
      onChange({
        ...draft,
        ...(nextHeight === undefined ? {} : { height: nextHeight }),
        ...(nextWidth === undefined ? {} : { width: nextWidth }),
      });
    };
    synchronizeBounds();
    void document.fonts
      ?.load(`${fontSize}px ${resolvedFontFamily}`, draft.value || 'M')
      .then(synchronizeBounds);
    return () => {
      active = false;
    };
  }, [draft, fontSize, onChange, resolvedFontFamily]);

  return { backgroundRects, editorRef, measurementRef, mirrorRef };
}

function resolveChangedTextDraft(args: {
  draft: DrawingTextDraft;
  fontSize: number;
  measurementElement: HTMLSpanElement | null;
  value: string;
}): DrawingTextDraft {
  const { draft, fontSize, measurementElement, value } = args;
  if (measurementElement) measurementElement.textContent = value || '\u200b';
  const measuredWidth = measurementElement
    ? Math.ceil(measurementElement.getBoundingClientRect().width)
    : 0;
  return {
    ...draft,
    value,
    ...(draft.autoWidth
      ? {
          width:
            measuredWidth > 0
              ? clampDrawingTextWidth(value, fontSize, measuredWidth, draft.maxWidth)
              : resolveDrawingTextNaturalWidth(value, fontSize, draft.maxWidth ?? 640),
        }
      : {}),
  };
}

export function DrawingTextEditor(props: DrawingTextEditorProps) {
  const { backgroundRects, editorRef, measurementRef, mirrorRef } =
    useDrawingTextEditorLayout(props);

  return (
    <div
      data-ui="content.drawing.text-editor"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) props.onCommit();
      }}
      style={{
        position: 'fixed',
        left: props.draft.point.x - props.projection.x,
        top: props.draft.point.y - props.projection.y,
        width: props.draft.width ?? 320,
        maxWidth: props.draft.maxWidth,
        minHeight: 0,
        fontSize: 0,
        lineHeight: 0,
        overflow: 'visible',
        transform: `rotate(${props.draft.rotation ?? 0}deg)`,
        transformOrigin: 'center',
        zIndex: 2,
      }}
    >
      <DrawingTextBackgrounds color={props.style.backgroundColor} rects={backgroundRects} />
      <span
        ref={mirrorRef}
        data-ui="content.drawing.text-mirror"
        aria-hidden="true"
        style={{
          ...resolveDrawingTextContentStyle(props.style),
          color: 'transparent',
          pointerEvents: 'none',
        }}
      >
        {resolveDrawingTextDomValue(props.draft.value)}
      </span>
      <textarea
        ref={editorRef}
        data-ui="content.drawing.text-input"
        aria-label={translate('content.toolbar.drawingTextInput')}
        value={props.draft.value}
        onChange={(event) => {
          props.onChange(
            resolveChangedTextDraft({
              draft: props.draft,
              fontSize: props.style.fontSize,
              measurementElement: measurementRef.current,
              value: event.currentTarget.value,
            })
          );
        }}
        onBlur={props.onCommit}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape') {
            event.preventDefault();
            props.onCancel();
          } else if (event.key === 'Enter' && event.shiftKey && !event.nativeEvent.isComposing) {
            // Keep the native textarea insertion/input sequence so the caret and scroll position
            // are reconciled in the same layout pass as the controlled value update.
            return;
          } else if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            props.onCommit();
          }
        }}
        style={{
          ...resolveDrawingTextContentStyle(props.style),
          background: 'transparent',
          border: 0,
          height: '100%',
          inset: 0,
          outline: 'none',
          overflow: 'hidden',
          position: 'absolute',
          resize: 'none',
        }}
      />
      <span
        ref={measurementRef}
        aria-hidden="true"
        style={{
          ...resolveDrawingTextContentStyle(props.style),
          left: -100000,
          position: 'fixed',
          visibility: 'hidden',
          whiteSpace: 'pre',
          width: 'max-content',
        }}
      >
        {resolveDrawingTextDomValue(props.draft.value)}
      </span>
    </div>
  );
}
