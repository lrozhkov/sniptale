import { createPortal } from 'react-dom';
import { resolvePortalTheme, resolveThemeSafePortalTarget } from '@sniptale/ui/theme/safe-portal';
import { mergeFloatingInteractionLayerStyle } from '@sniptale/ui/floating-interactions/placement';
import {
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import type { AIModel } from '../../../contracts/settings';
import {
  useAIModelSelectorDismissState,
  useAIModelSelectorSearchFocus,
  useAIModelSelectorMenuLayout,
} from './hooks';
import { Dropdown, EmptyState, Trigger } from './parts';
import { createDismissStateArgs, resolveModelSelectorViewState } from './view-state';
import type { AIModelSelectorProvider } from './helpers';

type EventWithinElementResolver = (event: MouseEvent, element: Element | null) => boolean;
type AIModelSelectorViewState = ReturnType<typeof resolveModelSelectorViewState>;

export interface AIModelSelectorProps {
  disabled?: boolean;
  /** Detach the settings catalog from its short, scrolling form body. */
  portalMenu?: boolean;
  isEventWithinElement?: EventWithinElementResolver;
  models: AIModel[];
  onSelect: (modelId: string | null) => void;
  /** Notifies an explicit menu opening without changing the accepted model. */
  onOpen?: (() => void) | undefined;
  providers: AIModelSelectorProvider[];
  selectedModelId: string | null;
}

function renderAIModelSelectorDropdown(props: {
  isOpen: boolean;
  menuStyle: CSSProperties;
  portalMenu: boolean;
  anchorRef: RefObject<HTMLDivElement | null>;
  menuRef: RefObject<HTMLDivElement | null>;
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchQuery: string;
  selectedModelId: string | null;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  viewState: AIModelSelectorViewState;
}) {
  if (!props.isOpen) return null;
  const dropdown = (
    <Dropdown
      style={
        props.portalMenu ? mergeFloatingInteractionLayerStyle(props.menuStyle) : props.menuStyle
      }
      filteredProviders={props.viewState.filteredProviders}
      onSelect={props.viewState.handleSelect}
      searchInputRef={props.searchInputRef}
      searchQuery={props.searchQuery}
      selectedModelId={props.selectedModelId}
      setSearchQuery={props.setSearchQuery}
    />
  );
  if (!props.portalMenu) return dropdown;
  return createPortal(
    <div ref={props.menuRef} data-theme={resolvePortalTheme(props.anchorRef.current) ?? undefined}>
      {dropdown}
    </div>,
    resolveThemeSafePortalTarget(props.anchorRef.current)
  );
}

export function AIModelSelector(props: AIModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useAIModelSelectorDismissState(
    createDismissStateArgs({
      dropdownRef,
      menuRef,
      isEventWithinElement: props.isEventWithinElement,
      isOpen,
      setIsOpen,
      setSearchQuery,
    })
  );
  useAIModelSelectorSearchFocus(isOpen, searchInputRef);
  const menuStyle = useAIModelSelectorMenuLayout(
    isOpen,
    dropdownRef,
    setIsOpen,
    setSearchQuery,
    props.portalMenu
  );

  if (props.models.length === 0) {
    return <EmptyState />;
  }

  const viewState = resolveModelSelectorViewState({
    models: props.models,
    onSelect: (modelId) => {
      props.onSelect(modelId);
      dropdownRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    },
    providers: props.providers,
    searchQuery,
    selectedModelId: props.selectedModelId,
    setIsOpen,
    setSearchQuery,
  });

  return (
    <div
      className="relative flex min-w-0 max-w-full items-center"
      ref={dropdownRef}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !isOpen || event.defaultPrevented) return;
        event.preventDefault();
        event.stopPropagation();
        setIsOpen(false);
        setSearchQuery('');
        dropdownRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
      }}
    >
      <Trigger
        disabled={props.disabled ?? false}
        isOpen={isOpen}
        onToggle={() => {
          if (!isOpen) props.onOpen?.();
          setIsOpen((current) => !current);
        }}
        selectedLabel={viewState.selectedLabel}
      />
      {renderAIModelSelectorDropdown({
        isOpen,
        menuStyle,
        portalMenu: props.portalMenu ?? false,
        anchorRef: dropdownRef,
        menuRef,
        searchInputRef,
        searchQuery,
        selectedModelId: props.selectedModelId,
        setSearchQuery,
        viewState,
      })}
    </div>
  );
}
