import { Check } from 'lucide-react';
import { createPortal } from 'react-dom';
import type {
  CSSProperties,
  KeyboardEvent,
  MouseEvent,
  MutableRefObject,
  PointerEvent,
  ReactNode,
} from 'react';
import type { AppTheme } from '@sniptale/ui/theme/types';
import { mergeFloatingInteractionLayerStyle } from '@sniptale/ui/floating-interactions/placement';
import { cx } from './shared';
import type { CompactSelectOption } from '@sniptale/ui/compact-inspector-controls/select-types';

interface CompactSelectMenuProps<T extends string> {
  menuClassName?: string | undefined;
  menuId: string;
  onOptionKeyDown: (event: KeyboardEvent<HTMLButtonElement>, index: number) => void;
  onSelect: (option: CompactSelectOption<T>) => void;
  optionRefs: MutableRefObject<Array<HTMLButtonElement | null>>;
  options: readonly CompactSelectOption<T>[];
  portalTarget: DocumentFragment | HTMLElement | ShadowRoot;
  menuRef: MutableRefObject<HTMLDivElement | null>;
  style: CSSProperties;
  theme: AppTheme | null;
  value: T | '';
}

function stopCompactSelectMenuEventPropagation(
  event: PointerEvent<HTMLDivElement> | MouseEvent<HTMLDivElement>
) {
  event.stopPropagation();
  event.nativeEvent.stopImmediatePropagation();
}

export function CompactSelectMenu<T extends string>({
  menuClassName,
  menuId,
  menuRef,
  onOptionKeyDown,
  onSelect,
  optionRefs,
  options,
  portalTarget,
  style,
  theme,
  value,
}: CompactSelectMenuProps<T>): ReactNode {
  return createPortal(
    <div
      id={menuId}
      ref={menuRef}
      role="listbox"
      data-theme={theme ?? undefined}
      data-floating-ui-root="true"
      style={mergeFloatingInteractionLayerStyle(style)}
      onPointerDown={stopCompactSelectMenuEventPropagation}
      onMouseDown={stopCompactSelectMenuEventPropagation}
      onClick={stopCompactSelectMenuEventPropagation}
      className={cx(
        'fixed z-[2147483647] max-h-52 overflow-y-auto overscroll-contain rounded-[9px] border p-1',
        'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_86%,transparent)]',
        'bg-[color:var(--sniptale-color-surface-canvas)]',
        'shadow-[var(--sniptale-shadow-floating-strong)]',
        menuClassName
      )}
    >
      {options.map((option, index) => (
        <CompactSelectMenuOption
          key={option.value}
          index={index}
          onOptionKeyDown={onOptionKeyDown}
          onSelect={onSelect}
          option={option}
          optionRefs={optionRefs}
          selected={option.value === value}
        />
      ))}
    </div>,
    portalTarget
  );
}

function CompactSelectMenuOption<T extends string>({
  index,
  onOptionKeyDown,
  onSelect,
  option,
  optionRefs,
  selected,
}: {
  index: number;
  onOptionKeyDown: (event: KeyboardEvent<HTMLButtonElement>, index: number) => void;
  onSelect: (option: CompactSelectOption<T>) => void;
  option: CompactSelectOption<T>;
  optionRefs: MutableRefObject<Array<HTMLButtonElement | null>>;
  selected: boolean;
}) {
  return (
    <button
      ref={(node) => {
        optionRefs.current[index] = node;
      }}
      data-selected={selected || undefined}
      title={option.label}
      type="button"
      role="option"
      aria-selected={selected}
      disabled={option.disabled}
      onPointerDown={handleOptionPointerDown}
      onClick={(event) => handleOptionClick(event, option, onSelect)}
      onKeyDown={(event) => onOptionKeyDown(event, index)}
      className={getOptionClassName(selected, option.disabled === true)}
    >
      <CompactSelectMenuOptionContent option={option} selected={selected} />
    </button>
  );
}

function CompactSelectMenuOptionContent<T extends string>({
  option,
  selected,
}: {
  option: CompactSelectOption<T>;
  selected: boolean;
}) {
  return (
    <>
      {option.icon ? (
        <span className="shrink-0 text-[color:var(--sniptale-color-text-muted)]">
          {option.icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{option.label}</span>
        {option.description ? <CompactSelectMenuOptionDescription option={option} /> : null}
      </span>
      <span
        className={cx(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
          selected ? 'opacity-100' : 'opacity-0'
        )}
        aria-hidden="true"
      >
        <Check size={13} strokeWidth={2.3} />
      </span>
    </>
  );
}

function CompactSelectMenuOptionDescription<T extends string>({
  option,
}: {
  option: CompactSelectOption<T>;
}) {
  return (
    <span className="block truncate text-[11px] font-medium text-[color:var(--sniptale-color-text-muted)]">
      <span title={option.description}>{option.description}</span>
    </span>
  );
}

function handleOptionPointerDown(event: PointerEvent<HTMLButtonElement>) {
  event.preventDefault();
  event.stopPropagation();
}

function handleOptionClick<T extends string>(
  event: MouseEvent<HTMLButtonElement>,
  option: CompactSelectOption<T>,
  onSelect: (option: CompactSelectOption<T>) => void
) {
  event.preventDefault();
  event.stopPropagation();
  onSelect(option);
}

function getOptionClassName(selected: boolean, disabled: boolean): string {
  return cx(
    'flex min-h-8 w-full items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-left',
    'text-[12px] font-semibold text-[color:var(--sniptale-color-text-primary)]',
    'transition',
    'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-border-subtle)_52%,transparent)]',
    'focus-visible:outline-none',
    'focus-visible:bg-[color:color-mix(in_srgb,var(--sniptale-color-border-subtle)_62%,transparent)]',
    selected &&
      [
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_18%,transparent)]',
        'text-[color:var(--sniptale-color-accent)]',
      ].join(' '),
    disabled && 'cursor-not-allowed opacity-45'
  );
}
