import { ProductInput } from '@sniptale/ui/product-form-controls';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import {
  ProductModal,
  ProductModalHeader,
  ProductModalBody,
  ProductModalFooter,
} from '@sniptale/ui/product-modal';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { LoaderCircle } from 'lucide-react';
import { translate } from '../../../../platform/i18n';

export function ProjectNameDialog(props: {
  copy: boolean;
  projectName: string;
  onClose: () => void;
  onCreate: (name: string, copy: boolean) => Promise<void>;
  onVisibilityChange: (open: boolean) => void;
}) {
  const [name, setName] = useState(
    props.copy ? props.projectName + translate('videoEditor.app.projectCopySuffix') : ''
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const pending = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const nameId = useId();
  const title = translate(
    props.copy ? 'videoEditor.app.copyProjectAction' : 'videoEditor.app.newProjectAction'
  );
  const { onVisibilityChange } = props;
  useLayoutEffect(() => {
    const opener = document.activeElement;
    onVisibilityChange(true);
    root.current?.querySelector('[role="dialog"]')?.setAttribute('aria-modal', 'true');
    input.current?.focus();
    input.current?.select();
    return () => {
      onVisibilityChange(false);
      if (opener instanceof HTMLElement && opener.isConnected)
        opener.focus({ preventScroll: true });
    };
  }, [onVisibilityChange]);
  const close = () => {
    if (!pending.current) props.onClose();
  };
  const submit = async () => {
    if (pending.current || !name.trim()) return;
    pending.current = true;
    setBusy(true);
    setError(false);
    try {
      await props.onCreate(name.trim(), props.copy);
      props.onClose();
    } catch {
      setError(true);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <div ref={root} data-ui="video-editor.project-name-dialog">
      <ProductModal
        width="min(420px, calc(100vw - 32px))"
        labelledBy={titleId}
        onClose={close}
        closeOnBackdrop={false}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape') {
            event.preventDefault();
            close();
          }
          if (event.key !== 'Tab') return;
          const controls = [
            ...event.currentTarget.querySelectorAll<HTMLElement>(
              'button:not(:disabled),input:not(:disabled)'
            ),
          ];
          if (!controls.length) {
            event.preventDefault();
            return;
          }
          if (
            event.shiftKey
              ? document.activeElement === controls[0]
              : document.activeElement === controls.at(-1)
          ) {
            event.preventDefault();
            (event.shiftKey ? controls.at(-1) : controls[0])?.focus();
          }
        }}
      >
        <ProductModalHeader
          compact
          title={<span id={titleId}>{title}</span>}
          onClose={close}
          disabled={busy}
          closeTitle={translate('common.actions.cancel')}
        />
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <ProductModalBody compact>
            <label htmlFor={nameId} className="text-xs text-[var(--sniptale-color-text-secondary)]">
              {translate('videoEditor.app.projectNameLabel')}
            </label>
            <ProductInput
              ref={input}
              id={nameId}
              value={name}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
              className="sniptale-save-dialog-input w-full"
            />
            {error ? (
              <p role="alert" className="text-xs text-[var(--sniptale-color-text-danger)]">
                {translate('common.errors.actionFailed')}
              </p>
            ) : null}
          </ProductModalBody>
          <ProductModalFooter compact className="!justify-end !gap-2">
            <ProductActionButton compact tone="secondary" disabled={busy} onClick={close}>
              {translate('common.actions.cancel')}
            </ProductActionButton>
            <ProductActionButton compact type="submit" disabled={busy || !name.trim()}>
              {busy ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> : null}
              {title}
            </ProductActionButton>
          </ProductModalFooter>
        </form>
      </ProductModal>
    </div>
  );
}
