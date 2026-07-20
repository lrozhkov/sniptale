import { useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { AIModel } from '../../../contracts/settings';
import { useAIModelSelectorDismissState, useAIModelSelectorSearchFocus } from './hooks';
import { Dropdown, EmptyState, Trigger } from './parts';
import { createDismissStateArgs, resolveModelSelectorViewState } from './view-state';
import type { AIModelSelectorProvider } from './helpers';

type EventWithinElementResolver = (event: MouseEvent, element: Element | null) => boolean;
type AIModelSelectorViewState = ReturnType<typeof resolveModelSelectorViewState>;

export interface AIModelSelectorProps {
  disabled?: boolean;
  isEventWithinElement?: EventWithinElementResolver;
  models: AIModel[];
  onSelect: (modelId: string | null) => void;
  providers: AIModelSelectorProvider[];
  selectedModelId: string | null;
}

function renderAIModelSelectorDropdown(props: {
  isOpen: boolean;
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchQuery: string;
  selectedModelId: string | null;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  viewState: AIModelSelectorViewState;
}) {
  return props.isOpen ? (
    <Dropdown
      filteredProviders={props.viewState.filteredProviders}
      onSelect={props.viewState.handleSelect}
      searchInputRef={props.searchInputRef}
      searchQuery={props.searchQuery}
      selectedModelId={props.selectedModelId}
      setSearchQuery={props.setSearchQuery}
    />
  ) : null;
}

export function AIModelSelector(props: AIModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useAIModelSelectorDismissState(
    createDismissStateArgs({
      dropdownRef,
      isEventWithinElement: props.isEventWithinElement,
      isOpen,
      setIsOpen,
      setSearchQuery,
    })
  );
  useAIModelSelectorSearchFocus(isOpen, searchInputRef);

  if (props.models.length === 0) {
    return <EmptyState />;
  }

  const viewState = resolveModelSelectorViewState({
    models: props.models,
    onSelect: props.onSelect,
    providers: props.providers,
    searchQuery,
    selectedModelId: props.selectedModelId,
    setIsOpen,
    setSearchQuery,
  });

  return (
    <div className="relative flex min-w-0 items-center" ref={dropdownRef}>
      <Trigger
        disabled={props.disabled ?? false}
        isOpen={isOpen}
        onToggle={() => setIsOpen((current) => !current)}
        selectedLabel={viewState.selectedLabel}
      />
      {renderAIModelSelectorDropdown({
        isOpen,
        searchInputRef,
        searchQuery,
        selectedModelId: props.selectedModelId,
        setSearchQuery,
        viewState,
      })}
    </div>
  );
}
