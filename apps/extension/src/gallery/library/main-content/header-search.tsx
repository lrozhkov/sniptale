import { CommandPressScope, useCommandPress } from '@sniptale/ui/control-language/press';
import { getGalleryPrimaryShortcut, getGalleryShortcutTitle } from '../keyboard/shortcut-labels';
import { Search, X } from 'lucide-react';
import { useContext, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react';
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
  const localInput = useRef<HTMLInputElement>(null);
  const inputRef = props.searchNavigation?.inputRef ?? localInput;
  const scoped = useContext(CommandPressScope);
  const clear = useCommandPress({
    enabled: scoped,
    onPointerDown: (event) => event.preventDefault(),
    onClick: () => {
      props.onSearchCommit('');
      inputRef.current?.focus();
    },
  });
  const clearIcon = <X size={14} aria-hidden="true" />;

  return (
    <div className="sniptale-inspector-search" data-ui="gallery.header.search">
      <Search size={14} aria-hidden="true" />
      <input
        type="search"
        ref={inputRef}
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
      />
      {props.search ? (
        <button
          {...clear.props}
          type="button"
          data-ui="gallery.header.clearSearch"
          data-command-press={scoped ? '' : undefined}
          data-pressing={clear.pressed ? 'true' : undefined}
          aria-label={translate('gallery.app.clearSearch')}
          title={translate('gallery.app.clearSearch')}
          className="sniptale-field-clear"
        >
          {scoped ? <span className="sniptale-command-content">{clearIcon}</span> : clearIcon}
        </button>
      ) : null}
    </div>
  );
}
