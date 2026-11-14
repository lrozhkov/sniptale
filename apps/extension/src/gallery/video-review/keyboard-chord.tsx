import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus } from 'lucide-react';
import { ProductInput } from '@sniptale/ui/product-form-controls';
import { ProductDropdownMenu, ProductDropdownItem } from '@sniptale/ui/product-menus/dropdown';
import { useGlassSelectOverlay } from '@sniptale/ui/glass-select/overlay-state';
import {
  resolveThemeSafePortalTarget,
  useResolvedPortalTheme,
} from '@sniptale/ui/theme/safe-portal';
import {
  REVIEW_KEY_CATALOG,
  reviewChordKeys,
  reviewChordLabel,
} from '../../features/video/review/interaction-keys';
import { translate, useAppLocale } from '../../platform/i18n';
import { ReviewButton, reviewIconButtonClassName } from './controls';

function KeyChoice({
  value,
  excluded,
  onChange,
  adding = false,
}: {
  value: string;
  excluded: readonly string[];
  onChange(value: string): void;
  adding?: boolean;
}) {
  useAppLocale();
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(''),
    [active, setActive] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null),
    menuRef = useRef<HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null);
  const id = useId(),
    theme = useResolvedPortalTheme(containerRef.current);
  const { portalStyle } = useGlassSelectOverlay({
    portal: true,
    isOpen: open,
    setIsOpen: setOpen,
    containerRef,
    menuRef,
    menuWidth: 280,
  });
  const options = REVIEW_KEY_CATALOG.filter(
    (p) =>
      !excluded.includes(p.value) &&
      (!query ||
        `${p.label} ${p.value} ${p.search} ${keyAliases(p.value)}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()))
  );
  const chosen = REVIEW_KEY_CATALOG.find((p) => p.value === value);
  const choose = (key: string) => {
    onChange(key);
    setOpen(false);
    setQuery('');
    input.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (open)
      menuRef.current
        ?.querySelector<HTMLElement>(`[data-key-active="true"]`)
        ?.scrollIntoView({ block: 'nearest' });
  }, [open, active, query]);
  return (
    <div ref={containerRef} className="relative min-w-0 flex-1" data-floating-ui-owner-id={id}>
      <ProductInput
        ref={input}
        role="combobox"
        aria-label={translate(
          adding ? 'gallery.videoReview.addChordKey' : 'gallery.videoReview.chooseChordKey'
        )}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-activedescendant={open && options[active] ? `${id}-${active}` : undefined}
        value={open ? query : (chosen?.label ?? value)}
        placeholder={translate(
          adding ? 'gallery.videoReview.addChordKey' : 'gallery.videoReview.searchChordKey'
        )}
        className="w-full"
        onClick={() => {
          if (!open) {
            setQuery('');
            setActive(-1);
            setOpen(true);
          }
        }}
        onChange={(event) => {
          setQuery(event.currentTarget.value);
          setActive(0);
          setOpen(true);
        }}
        onBlur={(event) => {
          if (!menuRef.current?.contains(event.relatedTarget)) setOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
            setActive((i) =>
              options.length
                ? i < 0
                  ? event.key === 'ArrowDown'
                    ? 0
                    : options.length - 1
                  : (i + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
                : -1
            );
          } else if (event.key === 'Enter') {
            event.preventDefault();
            if (open && options[active]) choose(options[active]!.value);
            else if (!open) {
              setOpen(true);
              setQuery('');
              setActive(-1);
            }
          } else if (event.key === 'Escape' && open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          } else if (event.key === 'Tab') setOpen(false);
        }}
      />
      {open && containerRef.current
        ? createPortal(
            <div
              ref={menuRef}
              data-floating-ui-root="true"
              data-floating-ui-owned-by={id}
              data-theme={theme ?? undefined}
              style={{ ...portalStyle, colorScheme: theme ?? undefined }}
              onPointerDown={(event) => event.preventDefault()}
            >
              <ProductDropdownMenu
                role="listbox"
                id={id}
                aria-label={translate('gallery.videoReview.chooseChordKey')}
                className="max-h-64 overflow-y-auto"
              >
                {options.length ? (
                  options.map((p, index) => (
                    <div
                      key={p.value}
                      id={`${id}-${index}`}
                      role="option"
                      aria-selected={p.value === value}
                      data-key-active={index === active}
                      onPointerMove={() => setActive(index)}
                    >
                      <ProductDropdownItem
                        role="presentation"
                        tabIndex={-1}
                        selected={index === active || p.value === value}
                        onClick={() => choose(p.value)}
                      >
                        <span>{p.label}</span>
                        {['Cmd', 'Option'].includes(p.value) ? (
                          <span className="ml-auto text-xs text-[var(--sniptale-color-text-muted)]">
                            {translate('windowHeader.macos')}
                          </span>
                        ) : p.value === 'Win' ? (
                          <span className="ml-auto text-xs text-[var(--sniptale-color-text-muted)]">
                            {translate('windowHeader.windows')}
                          </span>
                        ) : null}
                      </ProductDropdownItem>
                    </div>
                  ))
                ) : (
                  <p className="px-2 py-2 text-xs text-[var(--sniptale-color-text-secondary)]">
                    {translate('gallery.videoReview.noChordKeys')}
                  </p>
                )}
              </ProductDropdownMenu>
            </div>,
            resolveThemeSafePortalTarget(containerRef.current)
          )
        : null}
    </div>
  );
}
function keyAliases(key: string): string {
  switch (key) {
    case 'Space':
      return translate('gallery.videoReview.keySearchSpace');
    case 'Enter':
      return translate('gallery.videoReview.keySearchEnter');
    case 'Escape':
      return translate('gallery.videoReview.keySearchEscape');
    case 'Delete':
    case 'Backspace':
      return translate('gallery.videoReview.keySearchDelete');
    case 'Ctrl':
      return translate('gallery.videoReview.keySearchCtrl');
    case 'Cmd':
      return translate('gallery.videoReview.keySearchCmd');
    case 'Win':
      return translate('gallery.videoReview.keySearchWin');
    default:
      return '';
  }
}
export function ReviewKeyboardChord({
  label,
  keys,
  onChange,
}: {
  label: string;
  keys?: readonly string[] | undefined;
  onChange(label: string, keys: string[]): void;
}) {
  const values = reviewChordKeys(label, keys);
  const change = (next: string[]) => {
    if (next.length && next.length <= 8) onChange(reviewChordLabel(next), next);
  };
  return (
    <div className="space-y-1.5" data-ui="gallery.videoReview.keyboardChord">
      <p className="text-xs text-[var(--sniptale-color-text-secondary)]">
        {translate('gallery.videoReview.keyCombination')}
      </p>
      {values.map((value, index) => (
        <div className="flex min-w-0 items-center gap-1" key={index}>
          <KeyChoice
            value={value}
            excluded={values.filter((_, i) => i !== index)}
            onChange={(v) => change(values.map((k, i) => (i === index ? v : k)))}
          />
          <ReviewButton
            label={translate('gallery.videoReview.removeChordKey')}
            className={reviewIconButtonClassName}
            disabled={values.length === 1}
            onClick={() => change(values.filter((_, i) => i !== index))}
          >
            <X size={14} />
          </ReviewButton>
        </div>
      ))}
      {values.length < 8 ? (
        <div className="flex min-w-0 items-center gap-1">
          <Plus
            size={14}
            aria-hidden="true"
            className="shrink-0 text-[var(--sniptale-color-text-secondary)]"
          />
          <KeyChoice
            value=""
            adding
            excluded={values}
            onChange={(value) => change([...values, value])}
          />
        </div>
      ) : null}
    </div>
  );
}
