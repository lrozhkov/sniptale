import type { KeyboardEvent, RefObject } from 'react';
import { ProductModal } from '@sniptale/ui/product-modal';
import type { CommandPaletteAction, LocalizedCommandPaletteGroup } from './types';
import { CommandPaletteBody, CommandPaletteHeader, CommandPaletteTitle } from './sections';

type CommandPaletteSurfaceProps = {
  isOpen: boolean;
  dataUi: string;
  titleId: string;
  title: string;
  actionError: string | null;
  query: string;
  inputRef: RefObject<HTMLInputElement | null>;
  flatActions: readonly CommandPaletteAction[];
  groups: LocalizedCommandPaletteGroup[];
  flatActionIds: readonly string[];
  selectedIndex: number;
  onClose: () => void;
  onQueryChange: (value: string) => void;
  onHoverAction: (actionId: string) => void;
  onSelectAction: (action: CommandPaletteAction) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
};

function CommandPaletteSurfaceContent(props: CommandPaletteSurfaceProps) {
  return (
    <div data-ui={props.dataUi} className="flex flex-col">
      <CommandPaletteTitle titleId={props.titleId} title={props.title} />
      <CommandPaletteHeader
        query={props.query}
        inputRef={props.inputRef}
        onClose={props.onClose}
        onQueryChange={props.onQueryChange}
      />
      <CommandPaletteActionError message={props.actionError} />
      <CommandPaletteBody
        title={props.title}
        groups={props.groups}
        flatActions={props.flatActions}
        flatActionIds={props.flatActionIds}
        selectedIndex={props.selectedIndex}
        onHoverAction={props.onHoverAction}
        onSelectAction={props.onSelectAction}
      />
    </div>
  );
}

export function CommandPaletteSurface(props: CommandPaletteSurfaceProps) {
  return (
    <ProductModal
      isOpen={props.isOpen}
      onClose={props.onClose}
      width="100%"
      maxWidth="640px"
      role="dialog"
      labelledBy={props.titleId}
      onKeyDown={props.onKeyDown}
      dialogClassName="max-w-[min(640px,calc(100vw-32px))] overflow-hidden"
    >
      <CommandPaletteSurfaceContent {...props} />
    </ProductModal>
  );
}

function CommandPaletteActionError({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }

  return (
    <div
      role="status"
      data-ui="shared.ui.command-palette.action-error"
      className={[
        'mx-4 mt-3 rounded-lg border px-3 py-2 text-xs leading-5',
        'border-[color:color-mix(in_srgb,var(--sniptale-color-danger)_28%,transparent)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-danger)_8%,transparent)]',
        'text-[var(--sniptale-color-danger)]',
      ].join(' ')}
    >
      {message}
    </div>
  );
}
