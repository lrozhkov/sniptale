import { useId, useLayoutEffect, useRef, useState, type ComponentProps } from 'react';
import { createPortal } from 'react-dom';
import {
  resolveThemeSafePortalTarget,
  useResolvedPortalTheme,
} from '@sniptale/ui/theme/safe-portal';
import {
  ProductModal,
  ProductModalBody,
  ProductModalFooter,
  ProductModalHeader,
} from '@sniptale/ui/product-modal';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { CompactInput, CompactSelect } from '../../chrome/ui';
import {
  useEditorVectorLibrarySession,
  useEditorVectorLibrarySnapshot,
} from '../../application/vector-elements/context';
import { editorVectorErrorMessage } from './catalog';
import { translate } from '../../../platform/i18n';

const message = (
  key: keyof (typeof import('../../../platform/i18n/catalogs/en.json'))['editor']['elements']
) => translate(`editor.elements.${key}`);

function ImportDestinationFields({
  collections,
  destination,
  setDestination,
  name,
  setName,
  valid,
  disabled,
}: {
  collections: readonly { id: string; name: string }[];
  destination: string;
  setDestination(value: string): void;
  name: string;
  setName(value: string): void;
  valid: boolean;
  disabled: boolean;
}) {
  return (
    <>
      <label className="block space-y-1 text-xs">
        <span>{message('importTo')}</span>
        <CompactSelect
          aria-label={message('importTo')}
          value={destination}
          disabled={disabled}
          onChange={setDestination}
          options={[
            { value: '', label: message('newImportCollection') },
            ...collections.map((collection) => ({
              value: collection.id,
              label: collection.name,
            })),
          ]}
        />
      </label>
      {!destination ? (
        <label className="block space-y-1 text-xs">
          <span>{message('collectionName')}</span>
          <CompactInput
            aria-label={message('collectionName')}
            value={name}
            maxLength={120}
            disabled={disabled}
            aria-invalid={!valid}
            autoFocus
            onChange={(event) => setName(event.currentTarget.value)}
          />
          {!valid ? (
            <span className="block text-[var(--sniptale-color-danger)]">
              {message('importNameInvalid')}
            </span>
          ) : null}
        </label>
      ) : null}
    </>
  );
}

function ImportFailureResults({
  errorCode,
  imports,
}: {
  errorCode: string | null;
  imports: readonly { name: string; accepted: number; declined: number }[];
}) {
  return (
    <div className="space-y-2 text-xs">
      <p role="alert" className="text-[var(--sniptale-color-danger)]">
        {editorVectorErrorMessage(errorCode)}
      </p>
      {imports.map((result, index) => (
        <p
          key={`${result.name}:${index}`}
          className="break-words text-[var(--sniptale-color-text-secondary)]"
        >
          {result.name}: {message('accepted')} {result.accepted} · {message('declined')}{' '}
          {result.declined}
        </p>
      ))}
    </div>
  );
}

type ImportDialogContentProps = ComponentProps<typeof ImportDestinationFields> & {
  files: readonly File[];
  titleId: string;
  errorCode: string | null;
  imports: ComponentProps<typeof ImportFailureResults>['imports'];
  failed: boolean;
  submitting: boolean;
  busy: boolean;
  onClose(): void;
  onSubmit(): void;
};

function ImportDialogContent({
  files,
  titleId,
  errorCode,
  imports,
  failed,
  submitting,
  busy,
  onClose,
  onSubmit,
  ...fields
}: ImportDialogContentProps) {
  return (
    <ProductModal
      onClose={onClose}
      closeOnBackdrop={!submitting}
      role="presentation"
      width="420px"
      maxWidth="calc(100vw - 32px)"
      maxHeight="calc(100vh - 32px)"
      scrollable
    >
      <ProductModalHeader
        compact
        title={<span id={titleId}>{message('importDestinationTitle')}</span>}
        onClose={onClose}
        disabled={submitting}
        closeTitle={message('close')}
      />
      <ProductModalBody compact className="space-y-3">
        <p className="break-words text-xs text-[var(--sniptale-color-text-secondary)]">
          {files.map((file) => file.name).join(', ')}
        </p>
        <ImportDestinationFields {...fields} />
        {failed ? <ImportFailureResults errorCode={errorCode} imports={imports} /> : null}
      </ProductModalBody>
      <ProductModalFooter compact>
        <ProductActionButton tone="secondary" compact disabled={submitting} onClick={onClose}>
          {message('cancel')}
        </ProductActionButton>
        <ProductActionButton
          tone="primary"
          compact
          disabled={!fields.valid || busy || fields.disabled}
          onClick={onSubmit}
        >
          {message(submitting ? 'loading' : 'importConfirm')}
        </ProductActionButton>
      </ProductModalFooter>
    </ProductModal>
  );
}

interface ImportDialogProps {
  files: readonly File[];
  anchor: HTMLElement | null;
  onClose(): void;
}

function useImportDialog({ files, anchor, onClose }: ImportDialogProps) {
  const session = useEditorVectorLibrarySession();
  const state = useEditorVectorLibrarySnapshot();
  const collections = state.local.collections.filter((collection) => !collection.deleted);
  const selectedId = state.collection.startsWith('local:') ? state.collection.slice(6) : '';
  const [destination, setDestination] = useState(
    collections.some((collection) => collection.id === selectedId) ? selectedId : ''
  );
  const [name, setName] = useState(
    (files[0]?.name.replace(/\.(?:svg|json)$/iu, '') ?? '').slice(0, 120)
  );
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const theme = useResolvedPortalTheme(anchor);
  const titleId = useId();
  const valid = destination
    ? collections.some((collection) => collection.id === destination)
    : name.trim().length > 0 && name.trim().length <= 120;
  const close = () => {
    if (!inFlight.current) onClose();
  };
  useLayoutEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
      if (anchor?.isConnected) anchor.focus({ preventScroll: true });
    };
  }, [anchor]);
  const submit = async () => {
    if (inFlight.current || !valid || failed) return;
    inFlight.current = true;
    setSubmitting(true);
    const completed = await session.importFiles(
      files,
      destination || undefined,
      destination ? undefined : name.trim()
    );
    inFlight.current = false;
    setSubmitting(false);
    if (completed) onClose();
    else setFailed(true);
  };
  const content: ImportDialogContentProps = {
    files,
    titleId,
    errorCode: state.errorCode,
    imports: state.imports,
    failed,
    submitting,
    busy: state.busy,
    onClose: close,
    onSubmit: () => void submit(),
    collections,
    destination,
    setDestination,
    name,
    setName,
    valid,
    disabled: submitting || failed,
  };
  return { dialog, theme, content };
}

/** Keeps chosen files private to the pending import until the user accepts a destination. */
export function EditorElementsImportDialog(props: ImportDialogProps) {
  const { dialog, theme, content } = useImportDialog(props);
  return createPortal(
    <dialog
      ref={dialog}
      data-theme={theme ?? undefined}
      aria-labelledby={content.titleId}
      className={[
        'm-0 h-screen max-h-none w-screen max-w-none border-0 bg-transparent p-0',
        'text-[var(--sniptale-color-text-primary)]',
      ].join(' ')}
      onCancel={(event) => {
        event.preventDefault();
        content.onClose();
      }}
      onKeyDown={(event) => event.stopPropagation()}
      onKeyUp={(event) => event.stopPropagation()}
    >
      <ImportDialogContent {...content} />
    </dialog>,
    resolveThemeSafePortalTarget(props.anchor)
  );
}
