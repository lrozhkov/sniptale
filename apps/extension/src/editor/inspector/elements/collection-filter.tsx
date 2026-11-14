import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, Search } from 'lucide-react';
import { useCompactSelectController } from '@sniptale/ui/compact-inspector-controls/select-controller';
import { useFloatingSurfaceWheelContainment } from '@sniptale/ui/floating-interactions/wheel';
import { mergeFloatingInteractionLayerStyle } from '@sniptale/ui/floating-interactions/placement';
import {
  FLOATING_INTERACTION_OWNED_BY_ATTRIBUTE,
  FLOATING_INTERACTION_OWNER_ID_ATTRIBUTE,
} from '@sniptale/ui/floating-interactions/ownership';
import { CompactSelectTrigger } from '../../../ui/compact-inspector-controls/select-trigger';
import { translate } from '../../../platform/i18n';

type CollectionOption = { value: string; label: string; prefix?: string };
type CollectionSelect = ReturnType<typeof useCompactSelectController<string>>;

function handleCollectionSearchKeyDown(
  event: KeyboardEvent<HTMLInputElement>,
  options: CollectionOption[],
  actions: CollectionSelect['actions']
) {
  if (event.nativeEvent.isComposing) return;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    actions.focusOption(event.key === 'ArrowDown' ? 0 : options.length - 1);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    actions.closeAndFocusTrigger();
  } else if (event.key === 'Enter') {
    event.preventDefault();
    if (options.length === 1 && options[0]) actions.selectOption(options[0]);
  }
  event.stopPropagation();
}

function CollectionSearchPopup({
  id,
  value,
  options,
  query,
  setQuery,
  input,
  select,
}: {
  id: string;
  value: string;
  options: CollectionOption[];
  query: string;
  setQuery(value: string): void;
  input: RefObject<HTMLInputElement | null>;
  select: CollectionSelect;
}) {
  const menuRef = useFloatingSurfaceWheelContainment(select.refs.menuRef);
  const maxHeight = select.placement.menuStyle.maxHeight;
  const availableHeight = typeof maxHeight === 'number' ? `${maxHeight}px` : (maxHeight ?? '256px');
  return (
    <div
      ref={menuRef}
      data-theme={select.placement.portalTheme ?? undefined}
      data-floating-ui-root="true"
      data-sniptale-activation-bridge="defer"
      {...{ [FLOATING_INTERACTION_OWNED_BY_ATTRIBUTE]: id }}
      style={mergeFloatingInteractionLayerStyle({
        ...select.placement.menuStyle,
        maxHeight: `min(256px, ${availableHeight})`,
      })}
      className={[
        'fixed z-[2147483647] flex max-h-64 flex-col overflow-hidden rounded-[4px] border',
        'border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-canvas)]',
        'p-1 shadow-[var(--sniptale-shadow-floating-strong)]',
      ].join(' ')}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          select.actions.closeAndFocusTrigger();
        }
      }}
    >
      <label className="flex h-8 shrink-0 items-center gap-2 px-2 text-[var(--sniptale-color-text-secondary)]">
        <Search size={14} aria-hidden="true" />
        <input
          ref={input}
          type="search"
          value={query}
          aria-label={translate('editor.elements.searchCollections')}
          placeholder={translate('editor.elements.searchCollections')}
          className={[
            'min-w-0 flex-1 bg-transparent text-xs',
            'text-[var(--sniptale-color-text-primary)] outline-none placeholder:!opacity-100',
          ].join(' ')}
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={(event) => handleCollectionSearchKeyDown(event, options, select.actions)}
        />
      </label>
      <div
        id={id}
        role="listbox"
        aria-label={translate('editor.elements.collectionFilter')}
        className="min-h-0 overflow-y-auto overscroll-contain [scrollbar-width:thin]"
      >
        {options.map((option, index) => (
          <button
            key={option.value}
            type="button"
            role="option"
            aria-selected={option.value === value}
            ref={(node) => {
              select.refs.optionRefs.current[index] = node;
            }}
            title={option.prefix ? `${option.label} · ${option.prefix}` : option.label}
            className={[
              'my-px flex min-h-8 w-full items-center gap-2 rounded-[4px] px-2 text-left text-xs',
              'hover:bg-[var(--sniptale-color-surface-hover)]',
              'focus-visible:bg-[var(--sniptale-color-surface-hover)] focus-visible:outline-none',
            ].join(' ')}
            onClick={() => select.actions.selectOption(option)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowUp' && index === 0) {
                event.preventDefault();
                event.stopPropagation();
                input.current?.focus();
              } else select.keyboard.handleOptionKeyDown(event, index);
            }}
          >
            <span className="min-w-0 flex-1 break-words">{option.label}</span>
            <Check
              size={14}
              aria-hidden="true"
              className={
                option.value === value
                  ? 'shrink-0 text-[var(--sniptale-color-accent)]'
                  : 'invisible shrink-0'
              }
            />
          </button>
        ))}
        {!options.length ? (
          <p className="p-2 text-xs text-[var(--sniptale-color-text-secondary)]">
            {translate('editor.elements.emptySearch')}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Searches only the collection metadata already loaded by the catalog session. */
export function ElementCollectionFilter({
  value,
  options,
  onChange,
}: {
  value: string;
  options: CollectionOption[];
  onChange(value: string): void;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const needle = query.trim().toLocaleLowerCase();
  const filtered = options.filter(
    (option) =>
      !needle || `${option.label} ${option.prefix ?? ''}`.toLocaleLowerCase().includes(needle)
  );
  const select = useCompactSelectController({ value, options: filtered, onChange, ref: null });
  useLayoutEffect(() => {
    if (select.state.open) input.current?.focus();
    else setQuery('');
  }, [select.state.open, select.placement.portalTarget]);
  return (
    <div
      ref={select.refs.containerRef}
      className="min-w-0 flex-1"
      data-ui="editor.elements.collection"
      {...{ [FLOATING_INTERACTION_OWNER_ID_ATTRIBUTE]: id }}
    >
      <CompactSelectTrigger
        className={[
          '!h-8 !rounded-[4px] !px-2',
          'focus-visible:!border-[var(--sniptale-color-border-strong)]',
          select.state.open ? '!border-[var(--sniptale-color-border-strong)]' : '',
        ].join(' ')}
        aria-label={translate('editor.elements.collectionFilter')}
        menuId={id}
        open={select.state.open}
        selectedOption={
          options.find((option) => option.value === value) ?? {
            value,
            label: value.replace(/^(local|remote):/u, ''),
          }
        }
        triggerRef={select.refs.setTriggerRefs}
        onClick={() =>
          select.state.open
            ? select.actions.closeAndFocusTrigger()
            : select.actions.openMenu(undefined, false)
        }
        onKeyDown={(event) => {
          if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
            event.preventDefault();
            event.stopPropagation();
            select.actions.openMenu(undefined, false);
          } else select.keyboard.handleTriggerKeyDown(event);
        }}
      />
      {select.state.open && select.placement.portalTarget
        ? createPortal(
            <CollectionSearchPopup
              id={id}
              value={value}
              options={filtered}
              query={query}
              setQuery={setQuery}
              input={input}
              select={select}
            />,
            select.placement.portalTarget
          )
        : null}
    </div>
  );
}
