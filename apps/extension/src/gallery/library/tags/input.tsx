import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEventHandler,
  type RefObject,
} from 'react';
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
      <div className="relative flex h-8 min-w-0 flex-1 items-center">
        <input
          aria-label={props.placeholder}
          autoFocus={props.autoFocus}
          ref={props.inputRef}
          aria-autocomplete="list"
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
            'h-full w-full pr-8 text-[13px] leading-[18px] font-medium'
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

function GalleryTagOptions(props: {
  activeIndex: number;
  canCreate: boolean;
  listId: string;
  onSelect: (tag: string) => void;
  suggestions: string[];
  value: string;
}) {
  return (
    <div
      aria-label={translate('gallery.app.tagOptionsLabel')}
      className="absolute left-0 top-[calc(100%+6px)] z-50 w-max min-w-full
        max-w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-[4px]
        border border-[var(--sniptale-color-border-soft)]
        bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_96%,transparent)]
        shadow-lg backdrop-blur-sm"
      id={props.listId}
      role="listbox"
    >
      <div className="max-h-48 overflow-y-auto p-1">
        {props.suggestions.map((tag, index) => (
          <button
            aria-selected={props.activeIndex === index}
            key={tag}
            role="option"
            type="button"
            onMouseDown={(event) => {
              event.preventDefault();
              props.onSelect(tag);
            }}
            className={cx(
              `flex w-full cursor-pointer items-center rounded-[4px] min-h-8 px-2.5 py-1 text-left
                text-[13px] leading-[18px] font-medium`,
              'text-[var(--sniptale-color-text-primary)] transition-colors',
              props.activeIndex === index ? tagOptionActiveClassName : tagOptionHoverClassName
            )}
          >
            <span className="truncate">{tag}</span>
          </button>
        ))}
      </div>
      {props.canCreate ? (
        <button
          aria-selected={props.activeIndex === props.suggestions.length}
          role="option"
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            props.onSelect(props.value);
          }}
          className={cx(
            `flex w-full cursor-pointer items-center gap-2 border-t min-h-8 px-2.5 py-1 text-left text-[13px]
              leading-[18px] font-medium`,
            'border-[var(--sniptale-color-border-soft)] text-[var(--sniptale-color-text-primary)]',
            props.activeIndex === props.suggestions.length
              ? tagOptionActiveClassName
              : tagOptionHoverClassName
          )}
        >
          <Plus className="h-4 w-4 shrink-0 text-[var(--sniptale-color-text-secondary)]" />
          <span className="truncate">
            {translate('gallery.app.createTag')} “{props.value.trim()}”
          </span>
        </button>
      ) : null}
    </div>
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
    <div className="relative min-w-0">
      <GalleryTagInputField
        autoFocus={autoFocus}
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

      {showOptions ? (
        <GalleryTagOptions
          activeIndex={activeIndex}
          canCreate={canCreate}
          listId={listId}
          onSelect={select}
          suggestions={suggestions}
          value={value}
        />
      ) : null}
    </div>
  );
}
