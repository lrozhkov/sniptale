import { useMemo, useState, type FormEvent } from 'react';

import { translate } from '../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ProductField, ProductInput } from '@sniptale/ui/product-form-controls';
import {
  ProductModal,
  ProductModalBody,
  ProductModalFooter,
  ProductModalHeader,
} from '@sniptale/ui/product-modal';
import { aiSecretUnlockRuntime } from './runtime';

function readUnlockRequestId(): string | null {
  const requestId = new URL(globalThis.location.href).searchParams.get('requestId');
  return requestId && requestId.length > 0 ? requestId : null;
}

function closeUnlockWindow(): void {
  if (typeof globalThis.close === 'function') {
    globalThis.close();
  }
}

function closeUnlockWindowSoon(): void {
  globalThis.setTimeout(() => {
    closeUnlockWindow();
  }, 150);
}

async function cancelUnlockRequest(requestId: string | null): Promise<void> {
  if (!requestId) {
    closeUnlockWindow();
    return;
  }

  try {
    await aiSecretUnlockRuntime.cancelRequest(requestId);
  } catch {
    // The requester also has a timeout; cancel is an early failure signal only.
  }
  closeUnlockWindow();
}

function getUnlockSubmitError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : translate('settings.aiProviders.secretProtectionActionError');
}

function useAISecretUnlockForm(requestId: string | null) {
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState<string | null>(requestId ? null : 'Missing unlock request');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!requestId || !passphrase) {
      setError(translate('settings.aiProviders.secretProtectionPassphraseRequired'));
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const response = await aiSecretUnlockRuntime.submitPassphrase({ passphrase, requestId });
      if (!response.success || response.status !== 'completed') {
        setError(response.error ?? translate('settings.aiProviders.secretProtectionActionError'));
        setIsSubmitting(false);
        return;
      }
      closeUnlockWindowSoon();
    } catch (submitError) {
      setError(getUnlockSubmitError(submitError));
      setIsSubmitting(false);
    }
  };

  return { error, handleSubmit, isSubmitting, passphrase, setPassphrase };
}

type AISecretUnlockModalProps = {
  error: string | null;
  isSubmitting: boolean;
  onCancel: () => void;
  onPassphraseChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  passphrase: string;
  requestId: string | null;
};

function AISecretUnlockPassphraseField(
  props: Pick<
    AISecretUnlockModalProps,
    'error' | 'isSubmitting' | 'onPassphraseChange' | 'passphrase' | 'requestId'
  >
) {
  return (
    <ProductField
      error={props.error}
      label={translate('settings.aiProviders.secretProtectionPassphraseLabel')}
    >
      <ProductInput
        autoComplete="off"
        autoFocus
        disabled={props.isSubmitting || !props.requestId}
        onChange={(event) => props.onPassphraseChange(event.currentTarget.value)}
        type="password"
        value={props.passphrase}
      />
    </ProductField>
  );
}

function AISecretUnlockFooter(
  props: Pick<AISecretUnlockModalProps, 'isSubmitting' | 'onCancel' | 'requestId'>
) {
  return (
    <ProductModalFooter compact>
      <ProductActionButton
        compact
        disabled={props.isSubmitting}
        onClick={props.onCancel}
        tone="secondary"
      >
        {translate('common.actions.cancel')}
      </ProductActionButton>
      <ProductActionButton compact disabled={props.isSubmitting || !props.requestId} type="submit">
        {translate('settings.aiProviders.secretProtectionUnlockAction')}
      </ProductActionButton>
    </ProductModalFooter>
  );
}

function AISecretUnlockModal(props: AISecretUnlockModalProps) {
  return (
    <ProductModal
      accent="compact"
      closeOnBackdrop={false}
      maxWidth="420px"
      width="calc(100vw - 32px)"
    >
      <ProductModalHeader
        compact
        disabled={props.isSubmitting}
        onClose={props.onCancel}
        title={translate('settings.aiProviders.secretProtectionUnlockTitle')}
      />
      <ProductModalBody compact asForm className="space-y-4" onSubmit={props.onSubmit}>
        <AISecretUnlockPassphraseField
          error={props.error}
          isSubmitting={props.isSubmitting}
          onPassphraseChange={props.onPassphraseChange}
          passphrase={props.passphrase}
          requestId={props.requestId}
        />
        <AISecretUnlockFooter
          isSubmitting={props.isSubmitting}
          onCancel={props.onCancel}
          requestId={props.requestId}
        />
      </ProductModalBody>
    </ProductModal>
  );
}

export function AISecretUnlockPage() {
  const requestId = useMemo(readUnlockRequestId, []);
  const form = useAISecretUnlockForm(requestId);
  const handleCancel = () => {
    void cancelUnlockRequest(requestId);
  };

  return (
    <div
      className={
        'sniptale-extension-surface flex h-[100dvh] min-h-0 w-full items-center justify-center ' +
        'bg-[var(--sniptale-color-surface-canvas)] text-[var(--sniptale-color-text-primary)]'
      }
      data-ui="settings.ai-unlock.root"
    >
      <AISecretUnlockModal
        error={form.error}
        isSubmitting={form.isSubmitting}
        onCancel={handleCancel}
        onPassphraseChange={form.setPassphrase}
        onSubmit={form.handleSubmit}
        passphrase={form.passphrase}
        requestId={requestId}
      />
    </div>
  );
}
