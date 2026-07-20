import { useMemo, useState } from 'react';
import { Tag } from 'lucide-react';
import { translate } from '../../../platform/i18n';

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

interface GalleryTagInputProps {
  allTags: string[];
  compact?: boolean;
  excludeTags?: string[];
  onChange: (value: string) => void;
  onSubmit: (tag?: string) => void;
  placeholder: string;
  value: string;
}

function GalleryTagInputField(props: {
  compact: boolean;
  onChange: (value: string) => void;
  onFocusChange: (focused: boolean) => void;
  onSubmit: () => void;
  placeholder: string;
  value: string;
}) {
  return (
    <div
      className={cx(
        'flex min-w-0 items-center gap-2 rounded-[16px] border border-[var(--sniptale-color-border-soft)]',
        'bg-[var(--sniptale-color-surface-panel)] transition',
        'focus-within:border-[var(--sniptale-color-border-accent-strong)]',
        props.compact ? 'px-2 py-1.5' : 'px-3 py-2.5'
      )}
    >
      <GalleryTagInputFieldBody {...props} />
    </div>
  );
}

function GalleryTagInputFieldBody(props: {
  compact: boolean;
  onChange: (value: string) => void;
  onFocusChange: (focused: boolean) => void;
  onSubmit: () => void;
  placeholder: string;
  value: string;
}) {
  return (
    <>
      <Tag
        className={cx(
          'shrink-0 text-[var(--sniptale-color-text-muted)]',
          props.compact ? 'h-3.5 w-3.5' : 'h-4 w-4'
        )}
      />
      <input
        value={props.value}
        onBlur={() => {
          window.setTimeout(() => props.onFocusChange(false), 120);
        }}
        onChange={(event) => props.onChange(event.target.value)}
        onFocus={() => props.onFocusChange(true)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            props.onSubmit();
          }
        }}
        placeholder={props.placeholder}
        className={cx(
          'min-w-0 flex-1 bg-transparent outline-none placeholder:text-[var(--sniptale-color-text-muted)]',
          props.compact ? 'text-xs' : 'text-sm'
        )}
      />
      <GalleryTagInputSubmitButton compact={props.compact} onSubmit={props.onSubmit} />
    </>
  );
}

function GalleryTagInputSubmitButton(props: { compact: boolean; onSubmit: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onSubmit}
      className={cx(
        'shrink-0 rounded-full border border-[var(--sniptale-color-border-soft)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_76%,transparent)]',
        'font-medium text-[var(--sniptale-color-text-primary)] transition',
        'hover:border-[var(--sniptale-color-border-strong)]',
        props.compact ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-sm'
      )}
    >
      {translate('common.actions.add')}
    </button>
  );
}

function GalleryTagSuggestionList(props: {
  onFocusChange: (focused: boolean) => void;
  onSubmit: (tag?: string) => void;
  suggestions: string[];
}) {
  return (
    <div
      className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 overflow-hidden rounded-[16px]
            border border-[var(--sniptale-color-border-soft)]
            bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_96%,transparent)]
            shadow-lg backdrop-blur-sm"
    >
      {props.suggestions.map((tag) => (
        <button
          key={tag}
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            props.onSubmit(tag);
            props.onFocusChange(false);
          }}
          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm
                text-[var(--sniptale-color-text-primary)] transition
                hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_42%,transparent)]"
        >
          <span className="truncate">{tag}</span>
          <span className="text-xs text-[var(--sniptale-color-text-muted)]">
            {translate('gallery.preview.suggestionLabel')}
          </span>
        </button>
      ))}
    </div>
  );
}

export function GalleryTagInput({
  allTags,
  compact = false,
  excludeTags = [],
  onChange,
  onSubmit,
  placeholder,
  value,
}: GalleryTagInputProps) {
  const [focused, setFocused] = useState(false);
  const normalizedValue = value.trim().toLowerCase();
  const suggestions = useMemo(() => {
    return allTags
      .filter((tag) => !excludeTags.includes(tag))
      .filter((tag) => (normalizedValue ? tag.toLowerCase().includes(normalizedValue) : true))
      .slice(0, 6);
  }, [allTags, excludeTags, normalizedValue]);
  const showSuggestions = focused && suggestions.length > 0;

  return (
    <div className="relative min-w-0">
      <GalleryTagInputField
        compact={compact}
        onChange={onChange}
        onFocusChange={setFocused}
        onSubmit={() => onSubmit()}
        placeholder={placeholder}
        value={value}
      />
      {showSuggestions ? (
        <GalleryTagSuggestionList
          onFocusChange={setFocused}
          onSubmit={onSubmit}
          suggestions={suggestions}
        />
      ) : null}
    </div>
  );
}
