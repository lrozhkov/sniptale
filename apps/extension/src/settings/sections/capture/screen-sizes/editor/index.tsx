import type { FormEvent } from 'react';
import { ProductModal, ProductModalHeader } from '@sniptale/ui/product-modal';
import type { ViewportPreset } from '../../../../../contracts/settings';
import type { ViewportPresetDraft } from '../helpers';
import { resolveViewportPresetEditorTitle } from './helpers';
import { useViewportPresetEditorState } from './state';
import { ViewportPresetEditorContent, ViewportPresetEditorFooter } from './views';

interface ViewportPresetEditorProps {
  isLoading?: boolean;
  isOpen: boolean;
  onClose: () => void;
  onSave: (draft: ViewportPresetDraft) => Promise<void>;
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
      onClose={args.onClose}
      onKeyDown={args.state.handlers.handleKeyDown}
    >
      <ProductModalHeader
        compact
        title={resolveViewportPresetEditorTitle(args.preset)}
        onClose={args.onClose}
        disabled={args.state.status.isDisabled}
      />
      <ViewportPresetEditorContent
        height={args.state.form.height}
        isDisabled={args.state.status.isDisabled}
        label={args.state.form.label}
        onSubmit={args.state.handlers.handleSubmit}
        setHeight={args.state.form.setHeight}
        setLabel={args.state.form.setLabel}
        setTarget={args.state.form.setTarget}
        setWidth={args.state.form.setWidth}
        width={args.state.form.width}
        target={args.state.form.target}
      />
      <ViewportPresetEditorFooter
        {...createViewportPresetEditorFooterProps({
          isDisabled: args.state.status.isDisabled,
          isSaving: args.state.status.isSaving,
          label: args.state.form.label,
          onClose: args.onClose,
          onSubmit: args.state.handlers.handleSubmit,
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
