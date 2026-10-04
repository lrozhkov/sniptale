import { LoaderCircle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { translate } from '../../../platform/i18n';
import { useEditorController } from '../../application/controller-context';
import { renameEditorImage } from '../../workflows/rename-image';

/** Owns temporary name input, header action visibility, and focus restoration. */
export function EditorDocumentTitleEditor(props: {
  title: string;
  hasImage: boolean;
  aggregateId: string | null;
  children: (start: () => void, triggerRef: RefObject<HTMLButtonElement | null>) => ReactNode;
}) {
  const controller = useEditorController();
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pending = useRef(false);
  const restoreFocus = useRef(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [width, setWidth] = useState<number>();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const generation = useRef({
    aggregateId: props.aggregateId,
    hasImage: props.hasImage,
    revision: 0,
  });
  if (
    generation.current.aggregateId !== props.aggregateId ||
    generation.current.hasImage !== props.hasImage
  ) {
    generation.current = {
      aggregateId: props.aggregateId,
      hasImage: props.hasImage,
      revision: generation.current.revision + 1,
    };
  }
  useEffect(() => {
    setDraft(null);
    setSaving(false);
    setFailed(false);
    pending.current = false;
  }, [props.aggregateId, props.hasImage]);
  const editing = draft !== null;
  const focusInput = useCallback((input: HTMLInputElement | null) => {
    input?.focus();
    input?.select();
  }, []);

  useEffect(() => {
    if (!editing && restoreFocus.current) {
      restoreFocus.current = false;
      trigger.current?.focus();
    }
  }, [editing]);

  const finish = async (focus: boolean) => {
    if (pending.current || draft === null) return;
    restoreFocus.current = focus;
    if (!draft.trim() || draft.trim() === props.title.trim()) {
      setDraft(null);
      return;
    }
    const revision = generation.current.revision;
    pending.current = true;
    setSaving(true);
    setFailed(false);
    try {
      await renameEditorImage(controller, props.aggregateId, draft);
      if (generation.current.revision === revision) setDraft(null);
    } catch {
      if (generation.current.revision === revision) setFailed(true);
    } finally {
      if (generation.current.revision === revision) {
        pending.current = false;
        setSaving(false);
      }
    }
  };

  return (
    <div ref={container} className="min-w-0" style={editing ? { width } : undefined}>
      <div className={editing ? 'hidden' : 'flex min-w-0 items-center gap-1.5'}>
        {props.children(() => {
          setWidth(container.current?.getBoundingClientRect().width);
          setFailed(false);
          setDraft(props.title);
        }, trigger)}
      </div>
      {editing ? (
        <div className="relative w-full min-w-0">
          <input
            ref={focusInput}
            aria-label={translate('editor.page.renameImage')}
            aria-invalid={failed}
            aria-describedby={failed ? 'image-rename-error' : undefined}
            aria-busy={saving}
            readOnly={saving}
            value={draft}
            className={[
              'w-full min-w-0 rounded-md border border-[var(--sniptale-color-border-strong)]',
              'bg-[var(--sniptale-color-surface-panel)] pl-2 pr-8 py-1.5 text-sm',
              'text-[var(--sniptale-color-text-primary)] outline-none focus-visible:ring-1',
              'focus-visible:ring-[var(--sniptale-color-border-strong)]',
            ].join(' ')}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
              if (!failed) void finish(false);
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.nativeEvent.isComposing) return;
              if (event.key === 'Enter') {
                event.preventDefault();
                void finish(true);
              } else if (event.key === 'Escape' && !pending.current) {
                event.preventDefault();
                restoreFocus.current = true;
                setDraft(null);
              }
            }}
          />
          {saving ? (
            <LoaderCircle
              aria-hidden="true"
              size={16}
              className="absolute right-2 top-2 motion-safe:animate-spin"
            />
          ) : null}
          {failed ? (
            <p
              id="image-rename-error"
              role="alert"
              className="px-2 text-xs text-[var(--sniptale-color-text-primary)]"
            >
              {translate('common.errors.saveFailed')}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
