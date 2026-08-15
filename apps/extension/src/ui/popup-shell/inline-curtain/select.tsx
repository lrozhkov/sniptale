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
  InlineCurtainPanelHeader,
  InlineCurtainTrigger,
  type InlineCurtainSecondaryAction,
} from './trigger';

const INLINE_CURTAIN_ROW_CLASS_NAME = 'mt-2 mr-1 min-w-0 rounded-[14px]';
type InlineCurtainSelectProps = {
  ariaLabel: string;
  description: string;
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
  description,
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
      {openPanel ? (
        <button
          type="button"
          aria-label={translate('common.actions.close')}
          className={[
            'absolute inset-0 z-10 cursor-default',
            'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_82%,transparent)]',
            'backdrop-blur-[4px]',
          ].join(' ')}
          data-ui="popup.inline-curtain.backdrop"
          onClick={() => setOpenPanel(null)}
        />
      ) : null}
      <InlineCurtainSelectPanels
        activeValue={value}
        description={description}
        label={label}
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
  description,
  emptyText,
  notice,
  onChange,
  openPanel,
  options,
  optionsPanel,
  optionsFooter,
  label,
  panelId,
  secondaryAction,
  setOpenPanel,
}: {
  activeValue: string;
  description: string;
  emptyText?: string;
  notice?: string;
  onChange: (value: string) => void;
  openPanel: 'options' | 'secondary' | null;
  options: InlineCurtainOption[];
  optionsPanel?: ReactNode;
  optionsFooter?: ReactNode;
  label: string;
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
      <InlineCurtainCustomOptionsPanel
        description={description}
        id={panelId}
        onClose={() => setOpenPanel(null)}
        title={label}
      >
        {optionsPanel}
      </InlineCurtainCustomOptionsPanel>
    );
  }

  return (
    <InlineCurtainPanel
      activeValue={activeValue}
      description={description}
      id={panelId}
      {...(emptyText === undefined ? {} : { emptyText })}
      {...(notice === undefined ? {} : { notice })}
      onClose={() => setOpenPanel(null)}
      onChange={(nextValue) => {
        onChange(nextValue);
        setOpenPanel(null);
      }}
      options={options}
      title={label}
      {...(optionsFooter === undefined ? {} : { optionsFooter })}
    />
  );
}

function InlineCurtainCustomOptionsPanel({
  children,
  description,
  id,
  onClose,
  title,
}: {
  children: ReactNode;
  description: string;
  id: string;
  onClose(): void;
  title: string;
}) {
  return (
    <div id={id} role="dialog" aria-modal="false" className={INLINE_CURTAIN_PANEL_CLASS_NAME}>
      <InlineCurtainPanelHeader
        action="back"
        actionAriaLabel={translate('popup.common.curtainBack')}
        description={description}
        onAction={onClose}
        title={title}
      />
      <div>{children}</div>
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
  description,
  emptyText,
  id,
  notice,
  onClose,
  onChange,
  options,
  optionsFooter,
  title,
}: {
  activeValue: string;
  description: string;
  emptyText?: string;
  id: string;
  notice?: string;
  onClose(): void;
  onChange: (value: string) => void;
  options: InlineCurtainOption[];
  optionsFooter?: ReactNode;
  title: string;
}) {
  return (
    <div id={id} role="dialog" aria-modal="false" className={INLINE_CURTAIN_PANEL_CLASS_NAME}>
      <InlineCurtainPanelHeader
        action="back"
        actionAriaLabel={translate('popup.common.curtainBack')}
        description={description}
        onAction={onClose}
        title={title}
      />
      <InlineCurtainNotice {...(notice === undefined ? {} : { notice })} />
      <div role="listbox">
        <InlineCurtainOptionList
          activeValue={activeValue}
          {...(emptyText === undefined ? {} : { emptyText })}
          onChange={onChange}
          options={options}
        />
      </div>
      {optionsFooter === undefined ? null : (
        <div className="mt-2 border-t border-[var(--sniptale-color-border-soft)] pt-2">
          {optionsFooter}
        </div>
      )}
    </div>
  );
}
