import { useContext } from 'react';
import { CommandPressScope, useCommandPress } from '@sniptale/ui/control-language/press';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ChevronDown, X } from 'lucide-react';
import type { CSSProperties, Dispatch, MouseEvent as ReactMouseEvent, SetStateAction } from 'react';
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
      className={[
        'sniptale-ai-model-selector-missing flex items-center gap-2 rounded-[12px] border',
        'border-[var(--sniptale-color-danger)] px-3 py-2 text-xs',
        'text-[var(--sniptale-color-danger)]',
      ].join(' ')}
    >
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
  const compact = useContext(CommandPressScope);
  const press = useCommandPress({
    enabled: compact,
    disabled: props.disabled,
    onClick: props.onToggle,
  });
  const content = (
    <>
      <span className="min-w-0 flex-1 truncate text-left">
        {props.selectedLabel || translate('aiModal.modelUnsetOption')}
      </span>
      <ChevronDown
        aria-hidden
        className={[
          'sniptale-select-chevron shrink-0',
          props.isOpen ? 'sniptale-select-chevron-open' : '',
        ].join(' ')}
      />
    </>
  );
  return (
    <button
      type="button"
      data-invalid={!props.selectedLabel || undefined}
      {...press.props}
      data-command-press={compact ? '' : undefined}
      data-pressing={press.pressed ? 'true' : undefined}
      title={props.selectedLabel || translate('aiModal.modelUnsetOption')}
      className={[
        'sniptale-ai-model-selector-trigger sniptale-select sniptale-select-sm !font-normal',
        props.isOpen ? 'sniptale-select-open' : '',
        props.disabled ? 'sniptale-select-disabled' : '',
      ].join(' ')}
      aria-expanded={props.isOpen}
      disabled={props.disabled}
    >
      {compact ? (
        <span className="sniptale-command-content min-w-0 w-full">{content}</span>
      ) : (
        content
      )}
    </button>
  );
}

export function Dropdown(props: {
  style: CSSProperties;
  filteredProviders: ReturnType<typeof getFilteredAIProviders>;
  onSelect: (modelId: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchQuery: string;
  selectedModelId: string | null;
  setSearchQuery: Dispatch<SetStateAction<string>>;
}) {
  const compact = useContext(CommandPressScope);
  return (
    <ProductDropdownMenu
      style={props.style}
      className={[
        compact ? 'sniptale-compact-workspace' : '',
        '!flex !flex-col !min-w-0 !rounded-[4px] !p-[5px]',
        '!bg-[rgb(from_var(--sniptale-color-surface-panel)_r_g_b_/_1)]',
      ].join(' ')}
    >
      <DropdownSearchField
        searchInputRef={props.searchInputRef}
        searchQuery={props.searchQuery}
        setSearchQuery={props.setSearchQuery}
      />

      <div className="min-h-0 overflow-y-auto overflow-x-hidden">
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
      </div>
    </ProductDropdownMenu>
  );
}

function DropdownSearchField(props: {
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchQuery: string;
  setSearchQuery: Dispatch<SetStateAction<string>>;
}) {
  return (
    <div className="group/clearable relative shrink-0 px-1 pb-2">
      <ProductInput
        ref={props.searchInputRef as Ref<HTMLInputElement>}
        type="text"
        className="!rounded-[4px] !pr-8 !text-[13px] !leading-[18px] !font-normal"
        value={props.searchQuery}
        onChange={(event) => props.setSearchQuery(event.target.value)}
        aria-label={translate('aiModal.modelSearchPlaceholder')}
        placeholder={translate('aiModal.modelSearchPlaceholder')}
        style={{ height: '2rem', width: '100%' }}
        onClick={(event) => event.stopPropagation()}
      />
      {props.searchQuery ? (
        <ContentToolbarButton
          tone="close"
          title={translate('shared.ui.clearField').replace(
            '{field}',
            translate('aiModal.modelSearchPlaceholder')
          )}
          className={[
            '!absolute right-2 top-1 !h-6 !w-6 !min-w-6 !p-0 opacity-0 pointer-events-none',
            'group-hover/clearable:opacity-100 group-hover/clearable:pointer-events-auto',
            'group-focus-within/clearable:opacity-100 group-focus-within/clearable:pointer-events-auto',
          ].join(' ')}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => {
            const input = props.searchInputRef.current;
            if (!input || input.matches(':disabled') || input.readOnly) return;
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
              input,
              ''
            );
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.focus();
          }}
        >
          <X size={14} aria-hidden="true" />
        </ContentToolbarButton>
      ) : null}
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
  const compact = useContext(CommandPressScope);
  return props.filteredProviders.map(({ provider, models }) => (
    <div key={provider.id} className="flex min-w-0 flex-col gap-0.5">
      <ProductDropdownSectionLabel
        className={
          compact
            ? '!px-2 !py-1 !text-[12px] !leading-4 !font-medium !normal-case !tracking-normal [overflow-wrap:anywhere]'
            : 'px-2 py-1 text-xs [overflow-wrap:anywhere]'
        }
      >
        {provider.name}
      </ProductDropdownSectionLabel>
      {models.map((model) => (
        <ModelOption
          key={model.id}
          id={model.id}
          label={model.displayName}
          selected={model.id === props.selectedModelId}
          onSelect={props.onSelect}
        />
      ))}
    </div>
  ));
}

function ModelOption(props: {
  id: string;
  label: string;
  selected: boolean;
  onSelect(id: string): void;
}) {
  const compact = useContext(CommandPressScope);
  const mouseDown = (event: ReactMouseEvent) =>
    handleDropdownModelSelect(event, props.id, props.onSelect);
  const content = (
    <>
      <span className="flex-1 truncate">{props.label}</span>
      {props.selected ? <CheckIcon /> : null}
    </>
  );
  return compact ? (
    <ContentToolbarButton
      tone="property"
      active={props.selected}
      aria-pressed={props.selected}
      onMouseDown={mouseDown}
      onClick={(event) => {
        if (event.detail === 0) handleDropdownModelSelect(event, props.id, props.onSelect);
      }}
      title={props.label}
      className="!h-8 !min-h-8 !w-full !justify-start !gap-2 !rounded-[4px] !px-2 !font-normal"
    >
      {content}
    </ContentToolbarButton>
  ) : (
    <ProductDropdownItem
      onMouseDown={mouseDown}
      onClick={(event) => {
        if (event.detail === 0) handleDropdownModelSelect(event, props.id, props.onSelect);
      }}
      title={props.label}
      selected={props.selected}
      className={[
        '!min-h-8 !rounded-[4px] !px-2 !py-1.5 !text-[13px] !leading-[18px]',
        '!font-normal !shadow-none cursor-pointer',
      ].join(' ')}
    >
      {content}
    </ProductDropdownItem>
  );
}

function CheckIcon() {
  return (
    <svg
      className="h-3.5 w-3.5 shrink-0 text-[var(--sniptale-color-accent)]"
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
