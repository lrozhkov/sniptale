import { Sparkles } from 'lucide-react';
import type { Dispatch, MouseEvent as ReactMouseEvent, SetStateAction } from 'react';
import type { Ref, RefObject } from 'react';
import { translate } from '../../../platform/i18n';
import { ProductInput } from '@sniptale/ui/product-form-controls';
import {
  ProductDropdownItem,
  ProductDropdownMenu,
  ProductDropdownSectionLabel,
} from '@sniptale/ui/product-menus/dropdown';
import type { getFilteredAIProviders } from './helpers';

export function EmptyState() {
  return (
    <div
      className="flex items-center gap-2 rounded-[12px] border border-dashed
        border-[var(--sniptale-color-border-soft)] px-3 py-2 text-xs
        text-[var(--sniptale-color-text-muted)]"
    >
      <Sparkles className="h-3.5 w-3.5" />
      {translate('aiModal.modelNotSelected')}
    </div>
  );
}

export function Trigger(props: {
  disabled: boolean;
  isOpen: boolean;
  onToggle: () => void;
  selectedLabel: string | null;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        if (!props.disabled) {
          props.onToggle();
        }
      }}
      className="inline-flex max-w-full items-center gap-2 rounded-[12px] border
        border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)] px-3 py-2
        text-xs text-[var(--sniptale-color-text-secondary)] transition
        hover:border-[var(--sniptale-color-border-strong)] disabled:cursor-not-allowed disabled:opacity-50"
      aria-expanded={props.isOpen}
      disabled={props.disabled}
    >
      <Sparkles className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">
        {props.selectedLabel || translate('aiModal.modelUnsetOption')}
      </span>
    </button>
  );
}

export function Dropdown(props: {
  filteredProviders: ReturnType<typeof getFilteredAIProviders>;
  onSelect: (modelId: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchQuery: string;
  selectedModelId: string | null;
  setSearchQuery: Dispatch<SetStateAction<string>>;
}) {
  return (
    <ProductDropdownMenu className="sniptale-dropdown-up mt-2 min-w-[16rem]">
      <DropdownSearchField
        searchInputRef={props.searchInputRef}
        searchQuery={props.searchQuery}
        setSearchQuery={props.setSearchQuery}
      />

      {props.filteredProviders.length === 0 ? (
        <div className="px-3 py-2 text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('aiModal.modelsNotFound')}
        </div>
      ) : (
        <DropdownProviderSections
          filteredProviders={props.filteredProviders}
          onSelect={props.onSelect}
          selectedModelId={props.selectedModelId}
        />
      )}
    </ProductDropdownMenu>
  );
}

function DropdownSearchField(props: {
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchQuery: string;
  setSearchQuery: Dispatch<SetStateAction<string>>;
}) {
  return (
    <div className="px-1 pb-2">
      <ProductInput
        ref={props.searchInputRef as Ref<HTMLInputElement>}
        type="text"
        value={props.searchQuery}
        onChange={(event) => props.setSearchQuery(event.target.value)}
        placeholder={translate('aiModal.modelSearchPlaceholder')}
        style={{ height: '2rem', width: '100%' }}
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  );
}

function handleDropdownModelSelect(
  event: ReactMouseEvent,
  modelId: string,
  onSelect: (modelId: string) => void
) {
  event.preventDefault();
  event.stopPropagation();
  onSelect(modelId);
}

function DropdownProviderSections(props: {
  filteredProviders: ReturnType<typeof getFilteredAIProviders>;
  onSelect: (modelId: string) => void;
  selectedModelId: string | null;
}) {
  return props.filteredProviders.map(({ provider, models }) => (
    <div key={provider.id}>
      <ProductDropdownSectionLabel className="px-3 pt-1 text-[11px] uppercase tracking-[0.08em]">
        {provider.name}
      </ProductDropdownSectionLabel>
      {models.map((model) => (
        <ProductDropdownItem
          key={model.id}
          onMouseDown={(event) => handleDropdownModelSelect(event, model.id, props.onSelect)}
          selected={model.id === props.selectedModelId}
          className="cursor-pointer"
        >
          <span className="flex-1 truncate">{model.displayName}</span>
          {model.id === props.selectedModelId ? <CheckIcon /> : null}
        </ProductDropdownItem>
      ))}
    </div>
  ));
}

function CheckIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
