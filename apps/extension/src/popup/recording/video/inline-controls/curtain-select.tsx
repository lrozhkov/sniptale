import { useEffect, useId, useRef, useState, type MouseEvent, type RefObject } from 'react';
import {
  InlineCurtainNotice,
  InlineCurtainOptionList,
  type InlineCurtainOption,
} from './curtain-options';
import { useCurtainListPosition } from './curtain-position';
import { renderSecondaryCurtainPanel } from './curtain-secondary-panel';
import {
  INLINE_CURTAIN_PANEL_CLASS_NAME,
  InlineCurtainTrigger,
  type InlineCurtainSecondaryAction,
} from './curtain-trigger';

const INLINE_CURTAIN_ROW_CLASS_NAME = 'mt-2 mr-1 min-w-0 rounded-[14px]';
type InlineCurtainSelectProps = {
  ariaLabel: string;
  emptyText?: string;
  label: string;
  notice?: string;
  onChange: (value: string) => void;
  options: InlineCurtainOption[];
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
  options,
  secondaryAction,
  selectedLabel,
  value,
}: InlineCurtainSelectProps) {
  const [openPanel, setOpenPanel] = useState<'options' | 'secondary' | null>(null);
  const [anchorClientY, setAnchorClientY] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();
  const valueLabel =
    selectedLabel ?? options.find((option) => option.value === value)?.label ?? emptyText ?? '';
  useDismissCurtainOnOutsidePointer({
    open: openPanel !== null,
    rootRef,
    setOpen: (open) => setOpenPanel(open ? openPanel : null),
  });
  return (
    <div ref={rootRef} className={INLINE_CURTAIN_ROW_CLASS_NAME} data-open={openPanel !== null}>
      <InlineCurtainSelectTrigger
        ariaLabel={ariaLabel}
        label={label}
        openPanel={openPanel}
        panelId={panelId}
        {...(secondaryAction === undefined ? {} : { secondaryAction })}
        setAnchorClientY={setAnchorClientY}
        setOpenPanel={setOpenPanel}
        valueLabel={valueLabel}
      />
      <InlineCurtainSelectPanels
        activeValue={value}
        anchorClientY={anchorClientY}
        onChange={onChange}
        openPanel={openPanel}
        options={options}
        panelId={panelId}
        rootRef={rootRef}
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
  anchorClientY,
  emptyText,
  notice,
  onChange,
  openPanel,
  options,
  panelId,
  rootRef,
  secondaryAction,
  setOpenPanel,
}: {
  activeValue: string;
  anchorClientY: number | null;
  emptyText?: string;
  notice?: string;
  onChange: (value: string) => void;
  openPanel: 'options' | 'secondary' | null;
  options: InlineCurtainOption[];
  panelId: string;
  rootRef: RefObject<HTMLDivElement | null>;
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

  return (
    <InlineCurtainPanel
      activeValue={activeValue}
      anchorClientY={anchorClientY}
      id={panelId}
      triggerRef={rootRef}
      {...(emptyText === undefined ? {} : { emptyText })}
      {...(notice === undefined ? {} : { notice })}
      onChange={(nextValue) => {
        onChange(nextValue);
        setOpenPanel(null);
      }}
      options={options}
    />
  );
}

function InlineCurtainSelectTrigger({
  ariaLabel,
  label,
  openPanel,
  panelId,
  secondaryAction,
  setAnchorClientY,
  setOpenPanel,
  valueLabel,
}: {
  ariaLabel: string;
  label: string;
  openPanel: 'options' | 'secondary' | null;
  panelId: string;
  secondaryAction?: InlineCurtainSecondaryAction;
  setAnchorClientY: (anchorClientY: number | null) => void;
  setOpenPanel: (
    updater: (current: 'options' | 'secondary' | null) => 'options' | 'secondary' | null
  ) => void;
  valueLabel: string;
}) {
  return (
    <InlineCurtainTrigger
      ariaControls={panelId}
      ariaExpanded={openPanel === 'options'}
      ariaLabel={ariaLabel}
      label={label}
      onClick={(event) =>
        handleTriggerClick({ event, nextPanel: 'options', setAnchorClientY, setOpenPanel })
      }
      onPointerDown={(event) => setAnchorClientY(event.clientY)}
      {...(secondaryAction === undefined ? {} : { secondaryAction })}
      {...createSecondaryClickProps(secondaryAction, setAnchorClientY, setOpenPanel)}
      valueLabel={valueLabel}
    />
  );
}

function createSecondaryClickProps(
  secondaryAction: InlineCurtainSecondaryAction | undefined,
  setAnchorClientY: (anchorClientY: number | null) => void,
  setOpenPanel: (
    updater: (current: 'options' | 'secondary' | null) => 'options' | 'secondary' | null
  ) => void
): { onSecondaryClick?: (event: MouseEvent<HTMLButtonElement>) => void } {
  if (secondaryAction === undefined) {
    return {};
  }

  return {
    onSecondaryClick: (event) =>
      handleTriggerClick({ event, nextPanel: 'secondary', setAnchorClientY, setOpenPanel }),
  };
}

function handleTriggerClick({
  event,
  nextPanel,
  setAnchorClientY,
  setOpenPanel,
}: {
  event: MouseEvent<HTMLButtonElement>;
  nextPanel: 'options' | 'secondary';
  setAnchorClientY: (anchorClientY: number | null) => void;
  setOpenPanel: (
    updater: (current: 'options' | 'secondary' | null) => 'options' | 'secondary' | null
  ) => void;
}) {
  if (event.detail === 0) {
    setAnchorClientY(resolveElementCenterY(event.currentTarget));
  }
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

function resolveElementCenterY(element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  return rect.top + rect.height / 2;
}

function InlineCurtainPanel({
  activeValue,
  anchorClientY,
  emptyText,
  id,
  notice,
  onChange,
  options,
  triggerRef,
}: {
  activeValue: string;
  anchorClientY: number | null;
  emptyText?: string;
  id: string;
  notice?: string;
  onChange: (value: string) => void;
  options: InlineCurtainOption[];
  triggerRef: RefObject<HTMLDivElement | null>;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const activeOptionRef = useRef<HTMLButtonElement | null>(null);
  const firstOptionRef = useRef<HTMLButtonElement | null>(null);
  const listOffsetTop = useCurtainListPosition({
    activeOptionRef,
    anchorClientY,
    activeValue,
    firstOptionRef,
    listRef,
    panelRef,
    triggerRef,
  });

  return (
    <div ref={panelRef} id={id} className={INLINE_CURTAIN_PANEL_CLASS_NAME}>
      <InlineCurtainNotice {...(notice === undefined ? {} : { notice })} />
      <InlineCurtainOptionList
        activeOptionRef={activeOptionRef}
        activeValue={activeValue}
        {...(emptyText === undefined ? {} : { emptyText })}
        firstOptionRef={firstOptionRef}
        listOffsetTop={listOffsetTop}
        listRef={listRef}
        onChange={onChange}
        options={options}
      />
    </div>
  );
}
