import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DEFAULT_COLOR_INFO_STRONG } from '@sniptale/ui/default-colors/constants';
import {
  DRAWING_TEXT_INPUT_PAINT_STYLE,
  DRAWING_TEXT_INPUT_SELECTION_CSS,
} from '../../ui/drawing-tools/text-style';
import {
  createDrawingId,
  resolveDrawingTextFontFamily,
  type DrawingObject,
  type DrawingPoint,
  type DrawingTextInkLayout,
} from '../../features/drawing/public';
import { translate } from '../../platform/i18n';
import type { ContentDrawingController } from './controller';
import { measureContentDrawingTextLayout } from './text-measurement';
import {
  DrawingTextBackgrounds,
  resolveDrawingTextContentStyle,
  resolveDrawingTextDomValue,
  useDrawingTextLayout,
  type DrawingTextVisualStyle,
} from './text-content';

export type DrawingTextDraft = {
  autoWidth?: boolean;
  fittedWidth?: number | undefined;
  id: string | null;
  maxWidth?: number;
  point: DrawingPoint;
  rotation?: number;
  height?: number;
  value: string;
  width?: number;
  originX?: number;
  firstBaseline?: number;
};

function keepTextOrigin(
  point: DrawingPoint,
  previous: { width: number; height: number; originX: number; firstBaseline: number },
  next: DrawingTextInkLayout,
  rotation = 0
): DrawingPoint {
  const radians = (rotation * Math.PI) / 180;
  const dx = previous.originX - previous.width / 2 - next.originX + next.width / 2;
  const dy = previous.firstBaseline - previous.height / 2 - next.firstBaseline + next.height / 2;
  return {
    x:
      point.x + (previous.width - next.width) / 2 + dx * Math.cos(radians) - dy * Math.sin(radians),
    y:
      point.y +
      (previous.height - next.height) / 2 +
      dx * Math.sin(radians) +
      dy * Math.cos(radians),
  };
}

export function useDrawingTextEditor(controller: ContentDrawingController) {
  const [draft, setDraftState] = useState<DrawingTextDraft | null>(null);
  const draftRef = useRef<DrawingTextDraft | null>(null);
  const setDraft = useCallback(
    (next: DrawingTextDraft | null) => {
      draftRef.current = next;
      setDraftState(next);
      const text = next?.value ?? '';
      const previous = next?.id
        ? controller.session.getSnapshot().document.objects.find((object) => object.id === next.id)
        : null;
      controller.setPendingTextChange?.(
        Boolean(text.trim() && (!previous || previous.kind !== 'text' || previous.text !== text))
      );
    },
    [controller]
  );
  const cancel = useCallback(() => setDraft(null), [setDraft]);
  useEffect(() => () => controller.setPendingTextChange?.(false), [controller]);
  const commit = useCallback(() => {
    const current = draftRef.current;
    if (!current) return;
    if (!current.value.trim()) {
      if (current.id) controller.session.deleteObjects([current.id]);
      setDraft(null);
      return;
    }
    const snapshot = controller.session.getSnapshot();
    const previous = current.id
      ? snapshot.document.objects.find((object) => object.id === current.id)
      : null;
    const style =
      previous?.kind === 'text'
        ? {
            color: previous.color,
            backgroundColor: previous.backgroundColor,
            fontFamily: previous.fontFamily ?? 'sans',
            fontSize: previous.fontSize,
          }
        : snapshot.defaults.text;
    const automatic = current.autoWidth ?? false;
    const wrapWidth = automatic
      ? (current.maxWidth ?? current.width ?? 640)
      : (current.width ?? 320);
    const layout = measureContentDrawingTextLayout({
      ...style,
      text: current.value,
      wrapWidth,
      autoWidth: automatic,
    });
    const point =
      current.originX !== undefined && current.firstBaseline !== undefined
        ? keepTextOrigin(
            current.point,
            {
              width: current.fittedWidth ?? layout.width,
              height: current.height ?? layout.height,
              originX: current.originX,
              firstBaseline: current.firstBaseline,
            },
            layout,
            current.rotation
          )
        : current.point;
    const object = {
      id: current.id ?? createDrawingId(),
      kind: 'text' as const,
      text: current.value,
      bounds: { ...point, width: layout.width, height: layout.height },
      autoWidth: automatic,
      wrapWidth,
      ...(current.rotation === undefined ? {} : { rotation: current.rotation }),
      ...style,
    };
    if (current.id) controller.session.replaceObject(object);
    else controller.session.commitObject(object);
    if (controller.session.getSnapshot().document.objects.some((entry) => entry === object))
      setDraft(null);
  }, [controller, setDraft]);
  const edit = useCallback(
    (object: Extract<DrawingObject, { kind: 'text' }>) => {
      setDraft({
        id: object.id,
        point: object.bounds,
        value: object.text,
        ...(object.rotation === undefined ? {} : { rotation: object.rotation }),
        width: object.wrapWidth ?? object.bounds.width,
        maxWidth: object.wrapWidth ?? object.bounds.width,
        autoWidth: object.autoWidth ?? false,
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

type TextLayoutSnapshot = {
  layout: DrawingTextInkLayout;
  value: string;
  font: string;
  ready: boolean;
};

function resolveDraftWrapWidth(draft: DrawingTextDraft): number {
  return draft.autoWidth ? (draft.maxWidth ?? draft.width ?? 640) : (draft.width ?? 320);
}

function resolveDraftAnchor(
  previous: TextLayoutSnapshot | null,
  draft: DrawingTextDraft,
  font: string,
  ready: boolean,
  style: DrawingTextVisualStyle
): DrawingTextInkLayout | null {
  if (!previous && draft.id)
    return measureContentDrawingTextLayout({
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      text: draft.value,
      wrapWidth: resolveDraftWrapWidth(draft),
      autoWidth: draft.autoWidth ?? false,
    });
  if (
    !previous ||
    previous.font !== font ||
    previous.ready !== ready ||
    previous.value === draft.value
  )
    return null;
  return previous.layout;
}

function draftMatchesLayout(
  draft: DrawingTextDraft,
  layout: DrawingTextInkLayout,
  point: DrawingPoint
): boolean {
  return (
    draft.fittedWidth === layout.width &&
    draft.height === layout.height &&
    draft.width === layout.logicalWidth &&
    draft.originX === layout.originX &&
    draft.firstBaseline === layout.firstBaseline &&
    Math.abs(draft.point.x - point.x) < 0.01 &&
    Math.abs(draft.point.y - point.y) < 0.01
  );
}

function useDrawingTextEditorLayout(props: DrawingTextEditorProps) {
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const initialLength = useRef(props.draft.value.length);
  const { draft, style, onChange, layoutRevision } = props;
  const fontFamily = resolveDrawingTextFontFamily(style.fontFamily);
  const fontKey = `${style.fontSize}px ${fontFamily}`;
  const layout = useDrawingTextLayout({
    fontFamily,
    fontSize: style.fontSize,
    value: draft.value,
    wrapWidth: resolveDraftWrapWidth(draft),
    autoWidth: draft.autoWidth ?? false,
    editing: true,
  });
  const previous = useRef<TextLayoutSnapshot | null>(null);
  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    editor.setSelectionRange(initialLength.current, initialLength.current);
  }, []);
  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.scrollTop = 0;
    const frame = requestAnimationFrame(() => {
      if (editorRef.current === editor) editor.scrollTop = 0;
    });
    return () => cancelAnimationFrame(frame);
  }, [draft.value, layoutRevision]);
  useLayoutEffect(() => {
    const ready = document.fonts?.check?.(fontKey, draft.value || 'M') ?? true;
    const anchor = resolveDraftAnchor(previous.current, draft, fontKey, ready, style);
    const point = anchor
      ? keepTextOrigin(draft.point, anchor, layout, draft.rotation)
      : draft.point;
    previous.current = { layout, value: draft.value, font: fontKey, ready };
    if (draftMatchesLayout(draft, layout, point)) return;
    onChange({
      ...draft,
      point,
      width: layout.logicalWidth,
      fittedWidth: layout.width,
      height: layout.height,
      originX: layout.originX,
      firstBaseline: layout.firstBaseline,
    });
  }, [draft, layout, fontKey, onChange, style]);
  return { layout, editorRef };
}

export function DrawingTextEditor(props: DrawingTextEditorProps) {
  const { layout, editorRef } = useDrawingTextEditorLayout(props);
  const textStyle = resolveDrawingTextContentStyle(props.style, layout);
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
        width: layout.width,
        height: layout.height,
        minHeight: 0,
        fontSize: 0,
        lineHeight: 0,
        overflow: 'visible',
        transform: `rotate(${props.draft.rotation ?? 0}deg)`,
        transformOrigin: 'center',
        zIndex: 'var(--sniptale-drawing-editor-layer, 2)',
      }}
    >
      <style>{DRAWING_TEXT_INPUT_SELECTION_CSS}</style>
      <DrawingTextBackgrounds
        color={props.style.backgroundColor}
        rects={layout.backgrounds}
        text={{
          layout,
          color: props.style.color,
          fontFamily: props.style.fontFamily,
          fontSize: props.style.fontSize,
        }}
      />
      <span
        aria-hidden="true"
        style={{
          ...textStyle,
          whiteSpace: 'pre',
          overflowWrap: 'normal',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        {resolveDrawingTextDomValue(layout.lines.join('\n'))}
      </span>
      <textarea
        data-sniptale-drawing-input=""
        ref={editorRef}
        data-ui="content.drawing.text-input"
        aria-label={translate('content.toolbar.drawingTextInput')}
        value={props.draft.value}
        onChange={(event) => props.onChange({ ...props.draft, value: event.currentTarget.value })}
        onBlur={props.onCommit}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape') {
            event.preventDefault();
            props.onCancel();
          } else if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            props.onCommit();
          }
        }}
        style={{
          ...textStyle,
          ...DRAWING_TEXT_INPUT_PAINT_STYLE,
          background: 'transparent',
          border: 0,
          caretColor: DEFAULT_COLOR_INFO_STRONG,
          outline: 'none',
          overflow: 'hidden',
          resize: 'none',
        }}
      />
    </div>
  );
}
