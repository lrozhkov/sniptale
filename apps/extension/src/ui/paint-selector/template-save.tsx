import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { serializePaintToCss, type Gradient } from '@sniptale/foundation/paint';
import {
  createGradientPresetId,
  type GradientTemplateResources,
} from '../../composition/gradient-preset-resources/use-gradient-preset-catalog';
import { translate } from '../../platform/i18n';
import { X } from 'lucide-react';

const checkerboard = 'conic-gradient(#c4c4c4 25%, #eee 0 50%, #c4c4c4 0 75%, #eee 0)';

const formClass = [
  'm-0 rounded-[4px] border-0 bg-[var(--sniptale-color-surface-panel)] p-2.5 text-xs',
  'leading-4 text-[var(--sniptale-color-text-primary)] shadow-[0_6px_24px_#0004]',
].join(' ');

const closeClass = [
  'grid h-6 w-6 place-items-center rounded-[4px] text-[var(--sniptale-color-text-secondary)]',
  'outline-none hover:bg-[var(--sniptale-color-surface-hover)] focus-visible:outline',
  'focus-visible:outline-1 focus-visible:outline-[var(--sniptale-color-text-secondary)]',
].join(' ');

const nameClass = [
  'h-8 min-w-0 rounded-[4px] border border-[var(--sniptale-color-border-soft)]',
  'bg-[var(--sniptale-color-surface-input)] px-2 text-xs outline-none focus-visible:outline',
  'focus-visible:outline-1 focus-visible:outline-[var(--sniptale-color-text-secondary)]',
].join(' ');

const saveClass = [
  'h-8 cursor-pointer rounded-[4px] bg-[var(--sniptale-color-surface-hover)] px-2.5 text-xs',
  'outline-none focus-visible:outline focus-visible:outline-1',
  'focus-visible:outline-[var(--sniptale-color-text-secondary)]',
].join(' ');

type TemplateSaveProps = {
  gradient: Gradient;
  anchor?: HTMLElement | null;
  resources: GradientTemplateResources;
  presetId?: string;
  initialName?: string;
  onClose: () => void;
  onSaved?: (id: string) => void;
};

function useTemplateFormPopover(
  form: RefObject<HTMLFormElement | null>,
  input: RefObject<HTMLInputElement | null>,
  anchor: HTMLElement | null | undefined,
  onClose: () => void
) {
  const latest = useRef(onClose);
  latest.current = onClose;
  useLayoutEffect(() => {
    const node = form.current;

    if (!node || !anchor) return;
    const view = node.ownerDocument.defaultView;
    const position = () => {
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(340, (view?.innerWidth ?? 1280) - 24);
      node.style.width = `${width}px`;
      const height = node.getBoundingClientRect().height;
      const left = Math.max(12, Math.min(rect.left, (view?.innerWidth ?? 1280) - width - 12));
      node.style.left = `${left}px`;
      const above = rect.top - height - 8;
      const below = Math.min((view?.innerHeight ?? 900) - height - 8, rect.bottom + 8);
      node.style.top = `${above >= 8 ? above : below}px`;
    };
    node.showPopover?.();
    position();
    input.current?.focus();
    const dismiss = (event: PointerEvent) => {
      const path = event.composedPath();
      if (path.includes(node) || path.includes(anchor)) return;
      latest.current();
    };
    node.ownerDocument.addEventListener('pointerdown', dismiss, true);
    view?.addEventListener('resize', position);
    node.ownerDocument.addEventListener('scroll', position, true);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(position);
    observer?.observe(node);
    return () => {
      node.ownerDocument.removeEventListener('pointerdown', dismiss, true);
      view?.removeEventListener('resize', position);
      node.ownerDocument.removeEventListener('scroll', position, true);
      observer?.disconnect();
      const tree = node.getRootNode();
      const focused =
        tree instanceof ShadowRoot ? tree.activeElement : node.ownerDocument.activeElement;
      const ownedFocus = focused instanceof Node && node.contains(focused);
      node.hidePopover?.();
      if (ownedFocus && anchor.isConnected) anchor.focus();
    };
  }, [anchor, form, input]);
}

function useTemplateSaveCommand(props: TemplateSaveProps) {
  const [name, setName] = useState(props.initialName ?? '');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [candidateId] = useState(createGradientPresetId);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const pending = useRef(false);
  const gradient = useRef(structuredClone(props.gradient));
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending.current || !name.trim()) return;
    pending.current = true;
    setBusy(true);
    setFailed(false);
    const operation = props.presetId
      ? props.resources.actions.onRename(props.presetId, name.trim())
      : props.resources.actions.onSave(name.trim(), gradient.current, candidateId);
    void operation
      .then((accepted) => {
        if (!mounted.current) return;
        if (accepted) {
          props.onSaved?.(props.presetId ?? candidateId);
          props.onClose();
        } else setFailed(true);
      })
      .catch(() => {
        if (mounted.current) setFailed(true);
      })
      .finally(() => {
        pending.current = false;
        if (mounted.current) setBusy(false);
      });
  };
  return { name, setName, busy, failed, gradient: gradient.current, submit };
}

function handleTemplateKeys(event: KeyboardEvent<HTMLFormElement>, onClose: () => void) {
  if (event.key === 'Escape') {
    event.stopPropagation();
    event.preventDefault();
    onClose();
  }
  if (event.key === 'Tab') {
    const controls = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled)'
      )
    );
    const tree = event.currentTarget.getRootNode();
    const active =
      tree instanceof ShadowRoot
        ? tree.activeElement
        : event.currentTarget.ownerDocument.activeElement;
    if (
      (event.shiftKey && active === controls[0]) ||
      (!event.shiftKey && active === controls.at(-1))
    ) {
      event.preventDefault();
      (event.shiftKey ? controls.at(-1) : controls[0])?.focus();
    }
  }
}

export function GradientTemplateSave(props: TemplateSaveProps) {
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const nameId = useId();
  const { name, setName, busy, failed, gradient, submit } = useTemplateSaveCommand(props);
  useTemplateFormPopover(form, input, props.anchor, props.onClose);

  return (
    <form
      ref={form}
      popover={props.anchor ? 'manual' : undefined}
      role="dialog"
      style={
        props.anchor
          ? { position: 'fixed', inset: 'auto', margin: 0, width: 'min(340px, calc(100vw - 24px))' }
          : undefined
      }
      className={formClass}
      data-picker-local-layer
      data-ui="shared.ui.paint-selector.template-save"
      aria-label={translate('highlighter.paintPicker.saveTemplate')}
      onKeyDown={(event) => handleTemplateKeys(event, props.onClose)}
      onSubmit={submit}
    >
      <div className="mb-1.5 flex h-6 items-center justify-between">
        <label htmlFor={nameId}>
          {translate(
            props.presetId
              ? 'highlighter.paintPicker.templateName'
              : 'highlighter.paintPicker.newTemplate'
          )}
        </label>
        <button
          type="button"
          aria-label={translate('highlighter.paintPicker.closeTemplate')}
          className={closeClass}
          onClick={props.onClose}
        >
          <X size={14} strokeWidth={1.75} />
        </button>
      </div>
      <div className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-1.5">
        <span
          className="h-8 w-8 shrink-0 overflow-hidden rounded-[3px]"
          aria-hidden="true"
          style={{
            backgroundImage: `${serializePaintToCss({ kind: 'gradient', gradient })}, ${checkerboard}`,
            backgroundSize: '100% 100%, 12px 12px',
          }}
        />
        <input
          ref={input}
          id={nameId}
          autoFocus
          required
          maxLength={80}
          value={name}
          readOnly={busy}
          aria-label={translate('highlighter.paintPicker.templateName')}
          placeholder={translate('highlighter.paintPicker.templateName')}
          className={nameClass}
          onChange={(event) => setName(event.target.value)}
        />
        <button
          type="submit"
          aria-busy={busy}
          aria-disabled={busy || !name.trim()}
          className={saveClass}
        >
          {translate('highlighter.paintPicker.save')}
        </button>
      </div>
      {failed ? (
        <p role="alert" className="mt-2 text-xs leading-4 text-[var(--sniptale-color-danger)]">
          {translate('highlighter.paintPicker.templateSaveError')}
        </p>
      ) : null}
    </form>
  );
}
