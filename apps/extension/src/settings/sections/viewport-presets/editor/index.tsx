import type { FormEvent } from 'react';
import { ProductModal, ProductModalHeader } from '@sniptale/ui/product-modal';
import type { ViewportPreset } from '../../../../contracts/settings';
import { resolveViewportPresetEditorTitle } from './helpers';
import { useViewportPresetEditorState } from './state';
import { ViewportPresetEditorContent, ViewportPresetEditorFooter } from './views';

interface ViewportPresetEditorProps {
  isLoading?: boolean;
  isOpen: boolean;
  onClose: () => void;
  onSave: (label: string, width: number, height: number) => Promise<void>;
  preset?: ViewportPreset;
}

function createViewportPresetEditorStateArgs(args: ViewportPresetEditorProps) {
  return args.preset === undefined
    ? {
        isLoading: args.isLoading ?? false,
        isOpen: args.isOpen,
        onClose: args.onClose,
        onSave: args.onSave,
      }
    : {
        isLoading: args.isLoading ?? false,
        isOpen: args.isOpen,
        onClose: args.onClose,
        onSave: args.onSave,
        preset: args.preset,
      };
}

function createViewportPresetEditorFooterProps(args: {
  isSaving: boolean;
  isDisabled: boolean;
  label: string;
  onClose: () => void;
  onSubmit: (event: FormEvent) => Promise<void>;
  preset?: ViewportPreset;
}) {
  return {
    disabled: args.isDisabled,
    isSaving: args.isSaving,
    label: args.label,
    onClose: args.onClose,
    onSubmit: args.onSubmit,
    ...(args.preset === undefined ? {} : { preset: args.preset }),
  };
}

function renderViewportPresetEditorBody(args: {
  isOpen: boolean;
  onClose: () => void;
  preset?: ViewportPreset;
  state: ReturnType<typeof useViewportPresetEditorState>;
}) {
  return (
    <ProductModal
      isOpen={args.isOpen}
      width="420px"
      maxHeight="85vh"
      scrollable
      accent="compact"
      onClose={args.onClose}
      onKeyDown={args.state.handleKeyDown}
    >
      <ProductModalHeader
        compact
        title={resolveViewportPresetEditorTitle(args.preset)}
        onClose={args.onClose}
        disabled={args.state.isDisabled}
      />
      <ViewportPresetEditorContent
        height={args.state.height}
        isDisabled={args.state.isDisabled}
        label={args.state.label}
        onSubmit={args.state.handleSubmit}
        setHeight={args.state.setHeight}
        setLabel={args.state.setLabel}
        setWidth={args.state.setWidth}
        width={args.state.width}
      />
      <ViewportPresetEditorFooter
        {...createViewportPresetEditorFooterProps({
          isDisabled: args.state.isDisabled,
          isSaving: args.state.isSaving,
          label: args.state.label,
          onClose: args.onClose,
          onSubmit: args.state.handleSubmit,
          ...(args.preset === undefined ? {} : { preset: args.preset }),
        })}
      />
    </ProductModal>
  );
}

export function ViewportPresetEditor({
  isOpen,
  onClose,
  onSave,
  preset,
  isLoading = false,
}: ViewportPresetEditorProps) {
  const state = useViewportPresetEditorState(
    createViewportPresetEditorStateArgs(
      preset === undefined
        ? { isLoading, isOpen, onClose, onSave }
        : { isLoading, isOpen, onClose, onSave, preset }
    )
  );

  return renderViewportPresetEditorBody(
    preset === undefined ? { isOpen, onClose, state } : { isOpen, onClose, preset, state }
  );
}
