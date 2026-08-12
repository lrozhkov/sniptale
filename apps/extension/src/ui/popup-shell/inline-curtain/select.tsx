import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { translate } from '../../../platform/i18n';
import { InlineCurtainNotice, InlineCurtainOptionList, type InlineCurtainOption } from './options';
import { renderSecondaryCurtainPanel } from './secondary-panel';
import {
  INLINE_CURTAIN_PANEL_CLASS_NAME,
  InlineCurtainPanelCloseButton,
  InlineCurtainTrigger,
  type InlineCurtainSecondaryAction,
} from './trigger';

const INLINE_CURTAIN_ROW_CLASS_NAME = 'mt-2 mr-1 min-w-0 rounded-[14px]';
type InlineCurtainSelectProps = {
  ariaLabel: string;
  emptyText?: string;
  label: string;
  notice?: string;
  onChange: (value: string) => void;
  onOpenChange?: (open: boolean) => void;
  options: InlineCurtainOption[];
  optionsPanel?: ReactNode;
  optionsFooter?: ReactNode;
  secondaryAction?: InlineCurtainSecondaryAction;
  selectedLabel?: string;
  value: string;
};

export function InlineCurtainSelect({
  ariaLabel,
  emptyText,
  label,
  notice,
  onChange,
  onOpenChange,
  options,
  optionsPanel,
  optionsFooter,
  secondaryAction,
  selectedLabel,
  value,
}: InlineCurtainSelectProps) {
  const [openPanel, setOpenPanel] = useState<'options' | 'secondary' | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();
  const valueLabel =
    selectedLabel ?? options.find((option) => option.value === value)?.label ?? emptyText ?? '';
  useDismissCurtainOnOutsidePointer({
    open: openPanel !== null,
    rootRef,
    setOpen: (open) => setOpenPanel(open ? openPanel : null),
  });
  useInlineCurtainLifecycle({ openPanel, panelId, rootRef, setOpenPanel, triggerRef });
  useLayoutEffect(() => onOpenChange?.(openPanel === 'options'), [onOpenChange, openPanel]);
  return (
    <div ref={rootRef} className={INLINE_CURTAIN_ROW_CLASS_NAME} data-open={openPanel !== null}>
      <InlineCurtainSelectTrigger
        ariaLabel={ariaLabel}
        label={label}
        openPanel={openPanel}
        panelId={panelId}
        {...(secondaryAction === undefined ? {} : { secondaryAction })}
        setOpenPanel={setOpenPanel}
        triggerRef={triggerRef}
        valueLabel={valueLabel}
      />
      <InlineCurtainSelectPanels
        activeValue={value}
        onChange={onChange}
        openPanel={openPanel}
        options={options}
        {...(optionsPanel === undefined ? {} : { optionsPanel })}
        {...(optionsFooter === undefined ? {} : { optionsFooter })}
        panelId={panelId}
        setOpenPanel={setOpenPanel}
        {...(emptyText === undefined ? {} : { emptyText })}
        {...(notice === undefined ? {} : { notice })}
        {...(secondaryAction === undefined ? {} : { secondaryAction })}
      />
    </div>
  );
}

function InlineCurtainSelectPanels({
  activeValue,
  emptyText,
  notice,
  onChange,
  openPanel,
  options,
  optionsPanel,
  optionsFooter,
  panelId,
  secondaryAction,
  setOpenPanel,
}: {
  activeValue: string;
  emptyText?: string;
  notice?: string;
  onChange: (value: string) => void;
  openPanel: 'options' | 'secondary' | null;
  options: InlineCurtainOption[];
  optionsPanel?: ReactNode;
  optionsFooter?: ReactNode;
  panelId: string;
  secondaryAction?: InlineCurtainSecondaryAction;
  setOpenPanel: (openPanel: 'options' | 'secondary' | null) => void;
}) {
  if (openPanel !== 'options') {
    return renderSecondaryCurtainPanel({
      openPanel,
      panelId,
      setOpenPanel,
      ...(secondaryAction === undefined ? {} : { secondaryAction }),
    });
  }

  if (optionsPanel !== undefined) {
    return (
      <InlineCurtainCustomOptionsPanel id={panelId} onClose={() => setOpenPanel(null)}>
        {optionsPanel}
      </InlineCurtainCustomOptionsPanel>
    );
  }

  return (
    <InlineCurtainPanel
      activeValue={activeValue}
      id={panelId}
      {...(emptyText === undefined ? {} : { emptyText })}
      {...(notice === undefined ? {} : { notice })}
      onChange={(nextValue) => {
        onChange(nextValue);
        setOpenPanel(null);
      }}
      options={options}
      {...(optionsFooter === undefined ? {} : { optionsFooter })}
    />
  );
}

function InlineCurtainCustomOptionsPanel({
  children,
  id,
  onClose,
}: {
  children: ReactNode;
  id: string;
  onClose(): void;
}) {
  return (
    <div id={id} role="dialog" aria-modal="false" className={INLINE_CURTAIN_PANEL_CLASS_NAME}>
      <InlineCurtainPanelCloseButton
        ariaLabel={translate('common.actions.close')}
        onClick={onClose}
      />
      <div className="pt-1">{children}</div>
    </div>
  );
}

function InlineCurtainSelectTrigger({
  ariaLabel,
  label,
  openPanel,
  panelId,
  secondaryAction,
  setOpenPanel,
  triggerRef,
  valueLabel,
}: {
  ariaLabel: string;
  label: string;
  openPanel: 'options' | 'secondary' | null;
  panelId: string;
  secondaryAction?: InlineCurtainSecondaryAction;
  setOpenPanel: (
    updater: (current: 'options' | 'secondary' | null) => 'options' | 'secondary' | null
  ) => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
  valueLabel: string;
}) {
  return (
    <InlineCurtainTrigger
      ariaControls={panelId}
      ariaExpanded={openPanel === 'options'}
      ariaLabel={ariaLabel}
      label={label}
      onClick={() => toggleCurtainPanel('options', setOpenPanel)}
      {...(secondaryAction === undefined ? {} : { secondaryAction })}
      {...createSecondaryClickProps(secondaryAction, setOpenPanel)}
      triggerRef={triggerRef}
      valueLabel={valueLabel}
    />
  );
}

function createSecondaryClickProps(
  secondaryAction: InlineCurtainSecondaryAction | undefined,
  setOpenPanel: (
    updater: (current: 'options' | 'secondary' | null) => 'options' | 'secondary' | null
  ) => void
): { onSecondaryClick?: () => void } {
  if (secondaryAction === undefined) {
    return {};
  }

  return {
    onSecondaryClick: () => toggleCurtainPanel('secondary', setOpenPanel),
  };
}

function useInlineCurtainLifecycle({
  openPanel,
  panelId,
  rootRef,
  setOpenPanel,
  triggerRef,
}: {
  openPanel: 'options' | 'secondary' | null;
  panelId: string;
  rootRef: RefObject<HTMLDivElement | null>;
  setOpenPanel: (panel: 'options' | 'secondary' | null) => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (!openPanel) {
      if (wasOpenRef.current) triggerRef.current?.focus();
      wasOpenRef.current = false;
      return;
    }
    wasOpenRef.current = true;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpenPanel(null);
    };
    document.addEventListener('keydown', handleKeyDown, true);
    queueMicrotask(() => {
      const panel = rootRef.current?.querySelector<HTMLElement>(`[id="${panelId}"]`);
      panel?.querySelector<HTMLElement>('button:not([disabled]), [tabindex="0"]')?.focus();
    });
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [openPanel, panelId, rootRef, setOpenPanel, triggerRef]);
}

function toggleCurtainPanel(
  nextPanel: 'options' | 'secondary',
  setOpenPanel: (
    updater: (current: 'options' | 'secondary' | null) => 'options' | 'secondary' | null
  ) => void
) {
  setOpenPanel((current) => (current === nextPanel ? null : nextPanel));
}

function useDismissCurtainOnOutsidePointer({
  open,
  rootRef,
  setOpen,
}: {
  open: boolean;
  rootRef: RefObject<HTMLDivElement | null>;
  setOpen: (open: boolean) => void;
}) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [open, rootRef, setOpen]);
}

function InlineCurtainPanel({
  activeValue,
  emptyText,
  id,
  notice,
  onChange,
  options,
  optionsFooter,
}: {
  activeValue: string;
  emptyText?: string;
  id: string;
  notice?: string;
  onChange: (value: string) => void;
  options: InlineCurtainOption[];
  optionsFooter?: ReactNode;
}) {
  return (
    <div id={id} role="listbox" className={INLINE_CURTAIN_PANEL_CLASS_NAME}>
      <InlineCurtainNotice {...(notice === undefined ? {} : { notice })} />
      <InlineCurtainOptionList
        activeValue={activeValue}
        {...(emptyText === undefined ? {} : { emptyText })}
        onChange={onChange}
        options={options}
      />
      {optionsFooter === undefined ? null : (
        <div className="mt-2 border-t border-[var(--sniptale-color-border-soft)] pt-2">
          {optionsFooter}
        </div>
      )}
    </div>
  );
}
