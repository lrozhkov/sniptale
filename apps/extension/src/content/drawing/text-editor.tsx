import { useCallback, useState } from 'react';
import type { DrawingObject, DrawingPoint } from '../../features/drawing/public';
import { translate } from '../../platform/i18n';
import type { ContentDrawingController } from './controller';
import { createDrawingId, estimateTextLineCount } from './interaction';

export type DrawingTextDraft = {
  id: string | null;
  point: DrawingPoint;
  value: string;
};

export function useDrawingTextEditor(controller: ContentDrawingController) {
  const [draft, setDraft] = useState<DrawingTextDraft | null>(null);
  const cancel = useCallback(() => setDraft(null), []);

  const commit = useCallback(() => {
    if (!draft) return;
    const text = draft.value.trim();
    if (text) {
      const snapshot = controller.session.getSnapshot();
      const defaults = snapshot.defaults.text;
      const existing = draft.id
        ? snapshot.document.objects.find(
            (object) => object.id === draft.id && object.kind === 'text'
          )
        : null;
      const style =
        existing?.kind === 'text'
          ? {
              color: existing.color,
              backgroundColor: existing.backgroundColor,
              fontSize: existing.fontSize,
            }
          : defaults;
      const object = {
        id: draft.id ?? createDrawingId(),
        kind: 'text' as const,
        text,
        bounds: {
          x: draft.point.x,
          y: draft.point.y,
          width: existing?.kind === 'text' ? existing.bounds.width : 320,
          height: Math.max(
            style.fontSize * 1.5,
            estimateTextLineCount(text, style.fontSize) * style.fontSize * 1.25 + 12
          ),
        },
        ...style,
      };
      if (draft.id) controller.session.replaceObject(object);
      else controller.session.commitObject(object);
    }
    setDraft(null);
  }, [controller, draft]);

  const edit = useCallback((object: Extract<DrawingObject, { kind: 'text' }>) => {
    setDraft({ id: object.id, point: object.bounds, value: object.text });
  }, []);

  const finalize = useCallback(() => {
    if (draft?.value.trim()) commit();
    else setDraft(null);
  }, [commit, draft]);

  return { cancel, commit, draft, edit, finalize, setDraft };
}

export function DrawingTextEditor(props: {
  draft: DrawingTextDraft;
  projection: DrawingPoint;
  style: { backgroundColor: string | null; color: string; fontSize: number };
  onCancel: () => void;
  onChange: (draft: DrawingTextDraft) => void;
  onCommit: () => void;
}) {
  return (
    <textarea
      autoFocus
      aria-label={translate('content.toolbar.drawingTextInput')}
      value={props.draft.value}
      onChange={(event) => props.onChange({ ...props.draft, value: event.target.value })}
      onBlur={props.onCommit}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          props.onCancel();
        }
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault();
          props.onCommit();
        }
      }}
      style={{
        position: 'fixed',
        left: props.draft.point.x - props.projection.x,
        top: props.draft.point.y - props.projection.y,
        width: 320,
        minHeight: 48,
        padding: 6,
        border: '1px solid #2563eb',
        borderRadius: 4,
        background: props.style.backgroundColor ?? 'transparent',
        color: props.style.color,
        font: `${props.style.fontSize}px system-ui, sans-serif`,
        resize: 'none',
        zIndex: 2,
      }}
    />
  );
}
