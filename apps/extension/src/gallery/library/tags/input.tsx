import { useId, useMemo, useState, type KeyboardEventHandler } from 'react';
import { Plus, Tag } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import { getControlPrimaryButtonClassName } from '@sniptale/ui/control-language';

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

interface GalleryTagInputProps {
  allTags: string[];
  compact?: boolean;
  excludeTags?: string[];
  explicitSubmit?: boolean;
  onChange: (value: string) => void;
  onSubmit: (tag?: string) => void;
  placeholder: string;
  value: string;
}

function GalleryTagInputField(props: {
  compact: boolean;
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
        'flex min-w-0 items-center gap-2 rounded-[8px] border border-[var(--sniptale-color-border-soft)]',
        'bg-[var(--sniptale-color-surface-panel)] transition-colors',
        'focus-within:border-[var(--sniptale-color-border-accent-strong)]',
        props.compact ? 'h-8 px-2.5' : 'min-h-10 px-3 py-2'
      )}
    >
      <Tag
        aria-hidden="true"
        className={cx(
          'shrink-0 text-[var(--sniptale-color-text-muted)]',
          props.compact ? 'h-3.5 w-3.5' : 'h-4 w-4'
        )}
      />
      <input
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
          props.compact ? 'text-xs' : 'text-sm'
        )}
      />
      {props.showSubmit ? (
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={props.onSubmit}
          className={cx(
            getControlPrimaryButtonClassName({ density: 'compact' }),
            '!h-6 !min-h-6 !rounded-[6px] !px-2 text-xs'
          )}
        >
          {translate('gallery.app.apply')}
        </button>
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
        max-w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-[8px]
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
              'flex w-full cursor-pointer items-center rounded-[6px] px-2.5 py-2 text-left text-sm',
              'text-[var(--sniptale-color-text-primary)] transition-colors',
              props.activeIndex === index
                ? 'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_54%,transparent)]'
                : 'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_42%,transparent)]'
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
            'flex w-full cursor-pointer items-center gap-2 border-t px-3 py-2.5 text-left text-sm',
            'border-[var(--sniptale-color-border-soft)] text-[var(--sniptale-color-text-primary)]',
            props.activeIndex === props.suggestions.length
              ? 'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_54%,transparent)]'
              : 'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_42%,transparent)]'
          )}
        >
          <Plus className="h-4 w-4 shrink-0 text-[var(--sniptale-color-accent-emphasis)]" />
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
  compact = false,
  excludeTags = [],
  explicitSubmit = false,
  onChange,
  onSubmit,
  placeholder,
  value,
}: GalleryTagInputProps) {
  const listId = useId();
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

  const submit = (tag: string) => {
    const nextTag = tag.trim();
    if (!nextTag) return;
    onSubmit(nextTag);
    setFocused(false);
    setActiveIndex(-1);
  };

  const select = (tag: string) => {
    const nextTag = tag.trim();
    if (!nextTag) return;
    if (explicitSubmit) {
      onChange(nextTag);
      setFocused(false);
      setActiveIndex(-1);
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
        compact={compact}
        listId={listId}
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        onChange={(nextValue) => {
          setActiveIndex(-1);
          onChange(nextValue);
        }}
        onFocus={() => setFocused(true)}
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
