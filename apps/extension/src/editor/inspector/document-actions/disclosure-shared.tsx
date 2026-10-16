import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  loadEditorDocumentActionsDisclosureState,
  saveEditorDocumentActionsDisclosureState,
} from '../../persistence/ui-state/document-disclosure';
import { toast } from '@sniptale/ui/product-feedback/toast-service';

const disclosureButtonClassName = [
  'flex w-full items-center justify-between gap-3 rounded-[4px] border border-transparent',
  'bg-transparent min-h-8 px-2 py-0 text-left transition',
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_82%,transparent)]',
  'focus-visible:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_82%,transparent)]',
].join(' ');

const disclosureSummaryClassName = [
  'inline-flex min-h-6 max-w-full items-center text-[12px] font-normal',
  'text-[color:var(--sniptale-color-text-secondary)]',
].join(' ');

const disclosureStateClassName = [
  'flex items-center text-[color:var(--sniptale-color-text-secondary)]',
].join(' ');

const disclosureMetaClassName = [
  'flex shrink-0 items-center gap-2',
  'text-[color:var(--sniptale-color-text-secondary)]',
].join(' ');

export const disclosureContentClassName = 'sniptale-parameter-stack px-2 pb-1 pt-2';

const logger = createLogger({ namespace: 'EditorDocumentActionsDisclosure' });

async function loadDisclosureState(storageKey: string): Promise<boolean> {
  try {
    return await loadEditorDocumentActionsDisclosureState(storageKey);
  } catch (error) {
    logger.error('Failed to load disclosure preference', error, { storageKey });
    return false;
  }
}

async function saveDisclosureState(storageKey: string, isOpen: boolean): Promise<void> {
  try {
    await saveEditorDocumentActionsDisclosureState(storageKey, isOpen);
  } catch (error) {
    logger.error('Failed to save disclosure preference', error, { isOpen, storageKey });
    toast.error(translate('common.states.error'));
  }
}

export function usePersistentDisclosureState(storageKey: string, initialValue = false) {
  const [isOpen, setIsOpen] = useState(initialValue);
  const interactedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    void loadDisclosureState(storageKey).then((nextState) => {
      if (!cancelled && !interactedRef.current) {
        setIsOpen(nextState);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  const toggle = () => {
    interactedRef.current = true;
    setIsOpen((current) => {
      const nextState = !current;
      void saveDisclosureState(storageKey, nextState);
      return nextState;
    });
  };

  return { isOpen, toggle };
}

function DisclosureState(props: { isOpen: boolean }) {
  return (
    <span className={disclosureStateClassName}>
      {props.isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
    </span>
  );
}

export function DisclosureButton(props: {
  description?: string;
  icon: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  summary?: string | null;
  title: string;
}) {
  return (
    <ProductActionButton
      compact
      tone="secondary"
      type="button"
      data-ui="editor.file-actions.disclosure"
      className={disclosureButtonClassName}
      onClick={props.onToggle}
      aria-expanded={props.isOpen}
    >
      <span className="flex min-w-0 flex-1 items-center gap-3">
        <span
          className={
            'flex h-4 w-4 shrink-0 items-center justify-center ' +
            'text-[color:var(--sniptale-color-text-secondary)]'
          }
        >
          {props.icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium text-[color:var(--sniptale-color-text-primary)]">
            {props.title}
          </span>
          {props.description ? (
            <span className="mt-0.5 block text-[12px] text-[color:var(--sniptale-color-text-secondary)]">
              {props.description}
            </span>
          ) : null}
        </span>
      </span>
      <span className={disclosureMetaClassName}>
        {props.summary ? <span className={disclosureSummaryClassName}>{props.summary}</span> : null}
        <DisclosureState isOpen={props.isOpen} />
      </span>
    </ProductActionButton>
  );
}
