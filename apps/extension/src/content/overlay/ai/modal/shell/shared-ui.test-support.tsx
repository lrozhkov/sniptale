import React from 'react';

function MockProductActionButton(
  props: React.PropsWithChildren<React.ButtonHTMLAttributes<HTMLButtonElement>>
) {
  return (
    <button type={props.type ?? 'button'} onClick={props.onClick} disabled={props.disabled}>
      {props.children}
    </button>
  );
}

function MockProductField(props: React.PropsWithChildren<{ label: React.ReactNode }>) {
  return (
    <label>
      <span>{props.label}</span>
      {props.children}
    </label>
  );
}

function MockProductKeyboardHint(props: React.PropsWithChildren<{ shortcut: string }>) {
  return <span data-shortcut={props.shortcut}>{props.children}</span>;
}

function MockProductModal(
  props: React.PropsWithChildren<{
    dialogClassName?: string;
    onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
  }>
) {
  return (
    <div
      className={props.dialogClassName}
      data-ui="ai-modal.product-modal"
      onKeyDown={props.onKeyDown}
      tabIndex={0}
    >
      {props.children}
    </div>
  );
}

function MockProductModalHeader(props: { onClose?: () => void; title: React.ReactNode }) {
  return (
    <div>
      <span>{props.title}</span>
      <button type="button" onClick={props.onClose}>
        close
      </button>
    </div>
  );
}

function MockProductModalBody(props: React.PropsWithChildren<{ className?: string }>) {
  return <div className={props.className}>{props.children}</div>;
}

function MockProductModalFooter(props: React.PropsWithChildren) {
  return <div>{props.children}</div>;
}

function createMockProductTextarea() {
  return React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
    function ProductTextarea(props, ref) {
      return <textarea ref={ref} {...props} />;
    }
  );
}

function createMockAIModelSelector(aiModelSelectorMock: (props: unknown) => void) {
  return function MockAIModelSelector(props: {
    models: Array<{ displayName: string; id: string }>;
    onSelect: (modelId: string | null) => void;
    selectedModelId: string | null;
  }) {
    aiModelSelectorMock(props);

    if (props.models.length === 0) {
      return <div data-ui="ai-model-selector.empty">empty-selector</div>;
    }

    return (
      <button
        type="button"
        aria-expanded="false"
        data-ui="ai-model-selector.trigger"
        onClick={() => props.onSelect(props.models[0]?.id ?? null)}
      >
        {props.models.find((model) => model.id === props.selectedModelId)?.displayName ??
          'unset-model'}
      </button>
    );
  };
}

export function createSharedUiTestMock(aiModelSelectorMock: (props: unknown) => void) {
  return {
    AIModelSelector: createMockAIModelSelector(aiModelSelectorMock),
    ProductActionButton: MockProductActionButton,
    ProductField: MockProductField,
    ProductKeyboardHint: MockProductKeyboardHint,
    ProductModal: MockProductModal,
    ProductModalBody: MockProductModalBody,
    ProductModalFooter: MockProductModalFooter,
    ProductModalHeader: MockProductModalHeader,
    ProductTextarea: createMockProductTextarea(),
  };
}
