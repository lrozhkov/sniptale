import { getGalleryPrimaryShortcut, getGalleryShortcutTitle } from '../keyboard/shortcut-labels';
import { Search, X } from 'lucide-react';
import { useRef, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { translate } from '../../../platform/i18n';
import type { FolderFilter } from '../types';

export interface GallerySearchNavigation {
  inputRef: RefObject<HTMLInputElement | null>;
  onExit(): void;
}

export function GalleryHeaderSearchField(props: {
  folderFilter: FolderFilter;
  trashMode?: boolean;
  search: string;
  searchNavigation?: GallerySearchNavigation;
  onSearchChange: Dispatch<SetStateAction<string>>;
  onSearchCommit: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className="flex h-8 w-36 min-w-0 shrink-0 items-center gap-1.5 rounded-[8px] border
        border-[var(--sniptale-color-border-soft)]
        bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_78%,transparent)]
        px-1.5 transition-[width,border-color,background-color] duration-200 ease-out
        focus-within:w-48 focus-within:border-[var(--sniptale-color-border-accent-strong)]
        motion-reduce:transition-none"
      data-ui="gallery.header.search"
    >
      <Search
        className="ml-1 h-4 w-4 shrink-0 text-[var(--sniptale-color-text-muted)]"
        aria-hidden="true"
      />
      <input
        ref={props.searchNavigation?.inputRef ?? inputRef}
        aria-label={translate(
          props.trashMode ? 'gallery.app.trashSearchLabel' : 'gallery.app.searchLabel'
        )}
        title={getGalleryShortcutTitle(
          translate(props.trashMode ? 'gallery.app.trashSearchLabel' : 'gallery.app.searchLabel'),
          getGalleryPrimaryShortcut('F')
        )}
        value={props.search}
        onChange={(event) => props.onSearchChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !event.nativeEvent.isComposing && props.searchNavigation) {
            event.preventDefault();
            event.stopPropagation();
            if (!event.repeat) props.searchNavigation.onExit();
            return;
          }
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.preventDefault();
            props.onSearchCommit(event.currentTarget.value);
          }
        }}
        placeholder={
          props.trashMode
            ? translate('gallery.app.trashSearchPlaceholder')
            : props.folderFilter === 'scenario'
              ? translate('gallery.app.scenarioSearchPlaceholder')
              : translate('gallery.app.searchPlaceholder')
        }
        className="min-w-0 flex-1 bg-transparent text-sm text-[var(--sniptale-color-text-primary)]
          outline-none placeholder:text-[var(--sniptale-color-text-muted)]
          focus:placeholder:text-transparent"
      />
      {props.search ? (
        <button
          type="button"
          data-ui="gallery.header.clearSearch"
          aria-label={translate('gallery.app.clearSearch')}
          title={translate('gallery.app.clearSearch')}
          onClick={() => {
            props.onSearchCommit('');
            (props.searchNavigation?.inputRef ?? inputRef).current?.focus();
          }}
          className="sniptale-dismiss-button flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center
            rounded-[6px]  transition-colors
            focus-visible:outline-none focus-visible:ring-2
            focus-visible:ring-[var(--sniptale-color-accent)]"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
