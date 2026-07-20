import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { AIModel } from '../../../contracts/settings';
import { getFilteredAIProviders, getSelectedAIModelLabel } from './helpers';
import type { AIModelSelectorProvider } from './helpers';

type EventWithinElementResolver = (event: MouseEvent, element: Element | null) => boolean;

export function createDismissStateArgs(args: {
  dropdownRef: RefObject<HTMLDivElement | null>;
  isEventWithinElement: EventWithinElementResolver | undefined;
  isOpen: boolean;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
  setSearchQuery: Dispatch<SetStateAction<string>>;
}) {
  return args.isEventWithinElement === undefined
    ? {
        dropdownRef: args.dropdownRef,
        isOpen: args.isOpen,
        setIsOpen: args.setIsOpen,
        setSearchQuery: args.setSearchQuery,
      }
    : {
        dropdownRef: args.dropdownRef,
        isEventWithinElement: args.isEventWithinElement,
        isOpen: args.isOpen,
        setIsOpen: args.setIsOpen,
        setSearchQuery: args.setSearchQuery,
      };
}

export function resolveModelSelectorViewState(args: {
  models: AIModel[];
  onSelect: (modelId: string | null) => void;
  providers: AIModelSelectorProvider[];
  searchQuery: string;
  selectedModelId: string | null;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
  setSearchQuery: Dispatch<SetStateAction<string>>;
}) {
  return {
    filteredProviders: getFilteredAIProviders(args.providers, args.models, args.searchQuery),
    handleSelect: (modelId: string) => {
      args.onSelect(modelId);
      args.setIsOpen(false);
      args.setSearchQuery('');
    },
    selectedLabel: getSelectedAIModelLabel(args.models, args.providers, args.selectedModelId),
  };
}
