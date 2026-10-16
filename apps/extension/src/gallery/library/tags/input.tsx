import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEventHandler,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import {
  resolveThemeSafePortalTarget,
  useResolvedPortalTheme,
} from '@sniptale/ui/theme/safe-portal';
import { resolveCompactSelectMenuStyle } from '@sniptale/ui/compact-inspector-controls/select-helpers';
import { bindFloatingInteractionPositionListeners } from '@sniptale/ui/floating-interactions/placement';
import { useFloatingSurfaceWheelContainment } from '@sniptale/ui/floating-interactions/wheel';
import { Plus, Tag } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { InspectorFieldClear } from '../../../ui/compact-inspector-controls/text-field';

const tagOptionActiveClassName =
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-text-secondary)_18%,var(--sniptale-color-surface-panel))]';
const tagOptionHoverClassName =
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-text-secondary)_12%,var(--sniptale-color-surface-panel))]';

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

interface GalleryTagInputProps {
  allTags: string[];
  autoFocus?: boolean;
  compact?: boolean;
  excludeTags?: string[];
  explicitSubmit?: boolean;
  onChange: (value: string) => void;
  onSubmit: (tag?: string) => void;
  placeholder: string;
  value: string;
}

function GalleryTagInputField(props: {
  autoFocus: boolean;
  activeOptionId: string | undefined;
  explicitSubmit: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  listId: string;
  onBlur: () => void;
  onChange: (value: string) => void;
  onFocus: () => void;
  onKeyDown: KeyboardEventHandler<HTMLInputElement>;
  onSubmit: () => void;
  placeholder: string;
  showOptions: boolean;
  showSubmit: boolean;
  value: string;
}) {
  return (
    <div
      className={cx(
        'flex min-w-0 items-center gap-2 rounded-[4px] border border-[var(--sniptale-color-border-soft)]',
        'bg-[var(--sniptale-color-surface-panel)] transition-colors',
        'focus-within:border-[var(--sniptale-color-border-accent-strong)]',
        'h-8 px-2.5'
      )}
    >
      <Tag
        aria-hidden="true"
        className={cx('shrink-0 text-[var(--sniptale-color-text-muted)]', 'h-4 w-4')}
      />
      <div
        className={cx(
          'relative flex h-8 items-center',
          props.explicitSubmit
            ? 'w-[calc(12ch+2rem)] shrink-0 text-[13px] font-normal'
            : 'min-w-0 flex-1'
        )}
        style={{ fontFamily: 'var(--sniptale-font-document-sans)' }}
      >
        <input
          aria-label={props.placeholder}
          autoFocus={props.autoFocus}
          ref={props.inputRef}
          aria-autocomplete="list"
          aria-activedescendant={props.activeOptionId}
          aria-controls={props.listId}
          aria-expanded={props.showOptions}
          role="combobox"
          value={props.value}
          onBlur={props.onBlur}
          onChange={(event) => props.onChange(event.target.value)}
          onFocus={props.onFocus}
          onKeyDown={props.onKeyDown}
          placeholder={props.placeholder}
          className={cx(
            'min-w-0 flex-1 bg-transparent outline-none placeholder:text-[var(--sniptale-color-text-muted)]',
            'h-full w-full pr-8 text-[13px] leading-[18px] font-normal'
          )}
        />
        {props.value.length > 0 ? (
          <InspectorFieldClear label={props.placeholder} target={props.inputRef} />
        ) : null}
      </div>
      {props.showSubmit ? (
        <ProductActionButton
          tone="secondary"
          compact
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={props.onSubmit}
        >
          {translate('gallery.app.apply')}
        </ProductActionButton>
      ) : null}
    </div>
  );
}

function isTagAnchorVisible(anchor: HTMLElement) {
  const rect = anchor.getBoundingClientRect();
  if (!anchor.isConnected || rect.bottom <= 0 || rect.top >= window.innerHeight) return false;
  for (let parent = anchor.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    if (!/(auto|scroll|hidden|clip)/.test(style.overflowY)) continue;
    const bounds = parent.getBoundingClientRect();
    if (bounds.height > 0 && (rect.bottom <= bounds.top || rect.top >= bounds.bottom)) return false;
    if (parent.matches('dialog[open]')) break;
  }
  return true;
}

function useTagOptionsLayer({
  activeIndex,
  anchor,
  canCreate,
  onAnchorHidden,
  suggestionCount,
}: {
  activeIndex: number;
  anchor: HTMLDivElement;
  canCreate: boolean;
  onAnchorHidden: () => void;
  suggestionCount: number;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const wheelRef = useFloatingSurfaceWheelContainment(menuRef);
  const theme = useResolvedPortalTheme(anchor);
  const [style, setStyle] = useState(() => resolveCompactSelectMenuStyle(anchor));
  useLayoutEffect(() => {
    const updatePosition = () => {
      if (!isTagAnchorVisible(anchor)) {
        onAnchorHidden();
        return;
      }
      setStyle(resolveCompactSelectMenuStyle(anchor));
    };
    const unbind = bindFloatingInteractionPositionListeners(anchor, updatePosition);
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updatePosition);
    observer?.observe(anchor);
    return () => {
      observer?.disconnect();
      unbind?.();
    };
  }, [anchor, onAnchorHidden]);
  useLayoutEffect(() => {
    menuRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, canCreate, suggestionCount]);
  return { wheelRef, theme, style, portalTarget: resolveThemeSafePortalTarget(anchor) };
}

function GalleryTagOptions(props: {
  activeIndex: number;
  anchor: HTMLDivElement;
  canCreate: boolean;
  listId: string;
  onAnchorHidden: () => void;
  onSelect: (tag: string) => void;
  suggestions: string[];
  value: string;
}) {
  const { wheelRef, theme, style, portalTarget } = useTagOptionsLayer({
    activeIndex: props.activeIndex,
    anchor: props.anchor,
    canCreate: props.canCreate,
    onAnchorHidden: props.onAnchorHidden,
    suggestionCount: props.suggestions.length,
  });
  const createLabel = `${translate('gallery.app.createTag')} “${props.value.trim()}”`;
  return createPortal(
    <div
      aria-label={translate('gallery.app.tagOptionsLabel')}
      className="flex flex-col gap-0.5 overflow-y-auto overscroll-contain rounded-[4px] p-[5px]
        border border-[var(--sniptale-color-border-soft)]
        bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_96%,transparent)]
        shadow-lg backdrop-blur-sm"
      data-floating-ui-root="true"
      data-floating-ui-owned-by={props.listId}
      data-theme={theme ?? undefined}
      id={props.listId}
      ref={wheelRef}
      role="listbox"
      style={{
        ...style,
        position: 'fixed',
        zIndex: 2147483647,
        colorScheme: theme ?? undefined,
        fontFamily: 'var(--sniptale-font-interface)',
      }}
    >
      {props.suggestions.map((tag, index) => (
        <button
          aria-selected={props.activeIndex === index}
          id={`${props.listId}-option-${index}`}
          key={tag}
          role="option"
          tabIndex={-1}
          title={tag}
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            props.onSelect(tag);
          }}
          className={cx(
            `flex w-full shrink-0 cursor-pointer items-center rounded-[4px] min-h-8 px-2 py-1 text-left
                text-[13px] leading-[18px] font-normal`,
            'text-[var(--sniptale-color-text-primary)] transition-colors',
            props.activeIndex === index ? tagOptionActiveClassName : tagOptionHoverClassName
          )}
        >
          <span className="truncate">{tag}</span>
        </button>
      ))}
      {props.canCreate ? (
        <button
          aria-selected={props.activeIndex === props.suggestions.length}
          id={`${props.listId}-option-${props.suggestions.length}`}
          role="option"
          tabIndex={-1}
          title={createLabel}
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            props.onSelect(props.value);
          }}
          className={cx(
            `flex w-full shrink-0 cursor-pointer items-center gap-2 rounded-[4px] border-t
              min-h-8 px-2 py-1 text-left text-[13px] leading-[18px] font-normal`,
            'border-[var(--sniptale-color-border-soft)] text-[var(--sniptale-color-text-primary)]',
            props.activeIndex === props.suggestions.length
              ? tagOptionActiveClassName
              : tagOptionHoverClassName
          )}
        >
          <Plus className="h-4 w-4 shrink-0 text-[var(--sniptale-color-text-secondary)]" />
          <span className="truncate">{createLabel}</span>
        </button>
      ) : null}
    </div>,
    portalTarget
  );
}

export function GalleryTagInput({
  allTags,
  autoFocus = false,
  excludeTags = [],
  explicitSubmit = false,
  onChange,
  onSubmit,
  placeholder,
  value,
}: GalleryTagInputProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const blurTimeoutRef = useRef<number | null>(null);
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const normalizedValue = value.trim().toLowerCase();
  const suggestions = useMemo(
    () =>
      allTags
        .filter((tag) => !excludeTags.includes(tag))
        .filter((tag) => (normalizedValue ? tag.toLowerCase().includes(normalizedValue) : true)),
    [allTags, excludeTags, normalizedValue]
  );
  const canCreate =
    normalizedValue.length > 0 && !allTags.some((tag) => tag.toLowerCase() === normalizedValue);
  const optionCount = suggestions.length + (canCreate ? 1 : 0);
  const showOptions = focused && optionCount > 0;

  useEffect(
    () => () => {
      if (blurTimeoutRef.current !== null) window.clearTimeout(blurTimeoutRef.current);
    },
    []
  );

  const closeOptions = () => {
    inputRef.current?.blur();
    setFocused(false);
    setActiveIndex(-1);
  };

  const submit = (tag: string) => {
    const nextTag = tag.trim();
    if (!nextTag) return;
    onSubmit(nextTag);
    closeOptions();
  };

  const select = (tag: string) => {
    const nextTag = tag.trim();
    if (!nextTag) return;
    if (explicitSubmit) {
      onChange(nextTag);
      closeOptions();
      return;
    }
    submit(nextTag);
  };

  const submitOption = (index: number, inputValue: string) => {
    if (index >= 0 && index < suggestions.length) {
      select(suggestions[index] ?? '');
      return;
    }
    if (!explicitSubmit) submit(inputValue);
  };

  return (
    <div className="relative min-w-0" ref={anchorRef} data-floating-ui-owner-id={listId}>
      <GalleryTagInputField
        activeOptionId={
          showOptions && activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined
        }
        autoFocus={autoFocus}
        explicitSubmit={explicitSubmit}
        inputRef={inputRef}
        listId={listId}
        onBlur={() => {
          blurTimeoutRef.current = window.setTimeout(() => setFocused(false), 120);
        }}
        onChange={(nextValue) => {
          setActiveIndex(-1);
          onChange(nextValue);
        }}
        onFocus={() => {
          if (blurTimeoutRef.current !== null) window.clearTimeout(blurTimeoutRef.current);
          blurTimeoutRef.current = null;
          setFocused(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && optionCount > 0) {
            event.preventDefault();
            setFocused(true);
            setActiveIndex((current) => (current + 1) % optionCount);
          } else if (event.key === 'ArrowUp' && optionCount > 0) {
            event.preventDefault();
            setFocused(true);
            setActiveIndex((current) => (current <= 0 ? optionCount - 1 : current - 1));
          } else if (event.key === 'Escape') {
            if (showOptions) {
              event.preventDefault();
              event.stopPropagation();
            }
            setFocused(false);
            setActiveIndex(-1);
          } else if (event.key === 'Enter') {
            event.preventDefault();
            submitOption(activeIndex, event.currentTarget.value);
          }
        }}
        onSubmit={() => submit(value)}
        placeholder={placeholder}
        showOptions={showOptions}
        showSubmit={explicitSubmit && normalizedValue.length > 0}
        value={value}
      />

      {showOptions && anchorRef.current ? (
        <GalleryTagOptions
          activeIndex={activeIndex}
          anchor={anchorRef.current}
          canCreate={canCreate}
          listId={listId}
          onAnchorHidden={() => setFocused(false)}
          onSelect={select}
          suggestions={suggestions}
          value={value}
        />
      ) : null}
    </div>
  );
}
