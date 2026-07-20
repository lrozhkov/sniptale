import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useMemo, useRef, useState } from 'react';
import { vi } from 'vitest';

import { estimateTokens } from '../../../../parser/dom-tree-parser/ai/format';
import { AIModalContent } from './body';
import { integrationTreeData } from './test-fixtures';

type BodyHarnessProps = {
  onClose?: () => void;
  onSubmit?: (...args: unknown[]) => void;
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const availableModels = [
  {
    id: 'model-1',
    providerId: 'provider-1',
    displayName: 'GPT 4.1',
    modelCode: 'gpt-4.1',
    systemPrompt: '',
  },
];

const providers = [
  {
    id: 'provider-1',
    name: 'OpenAI',
    connectionType: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    hasStoredApiKey: true,
    createdAt: 1,
  },
];

function createBodyState(args: {
  prompt: string;
  selectedData: string;
  selectedModelId: string | null;
  setPrompt: React.Dispatch<React.SetStateAction<string>>;
  setSelectedData: React.Dispatch<React.SetStateAction<string>>;
  setSelectedModelId: React.Dispatch<React.SetStateAction<string | null>>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  totalTokens: number;
}) {
  return {
    availableModels,
    editingTemplate: undefined,
    handleAddTemplate: vi.fn(),
    handleDeleteTemplate: vi.fn(async () => undefined),
    handleEditTemplate: vi.fn(),
    handleModelSelect: args.setSelectedModelId,
    handleResizeStart: vi.fn(),
    handleSaveTemplate: vi.fn(async () => undefined),
    handleSelectTemplate: vi.fn(async () => undefined),
    isEditorOpen: false,
    isResizing: false,
    prompt: args.prompt,
    providers,
    resizerRef: { current: null },
    selectedData: args.selectedData,
    selectedModelId: args.selectedModelId,
    setIsEditorOpen: vi.fn(),
    setPrompt: args.setPrompt,
    setSelectedData: args.setSelectedData,
    templates: [],
    templatesLoading: false,
    textareaRef: args.textareaRef,
    totalTokens: args.totalTokens,
  } as never;
}

function BodyHarness(props: BodyHarnessProps) {
  const [prompt, setPrompt] = useState('Summarize the selected field in detail');
  const [selectedData, setSelectedData] = useState('');
  const [selectedModelId, setSelectedModelId] = useState<string | null>('model-1');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const totalTokens = useMemo(
    () => estimateTokens(prompt) + estimateTokens(selectedData),
    [prompt, selectedData]
  );

  return (
    <>
      <button id="clear-model" type="button" onClick={() => setSelectedModelId(null)} />
      <AIModalContent
        isOpen
        isLoading={false}
        onClose={props.onClose ?? vi.fn()}
        onSubmit={(props.onSubmit ?? vi.fn()) as never}
        state={createBodyState({
          prompt,
          selectedData,
          selectedModelId,
          setPrompt,
          setSelectedData,
          setSelectedModelId,
          textareaRef,
          totalTokens,
        })}
        treeData={integrationTreeData}
      />
    </>
  );
}

function ensureHarnessRoot() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
}

export function getBodyHarnessContainer() {
  return container;
}

export async function clickBodyElement(selector: string) {
  await act(async () => {
    container
      ?.querySelector<HTMLElement>(selector)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

export async function renderBodyHarness(props: BodyHarnessProps = {}) {
  ensureHarnessRoot();

  await act(async () => {
    root?.render(<BodyHarness {...props} />);
  });
}

export function cleanupBodyHarness() {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
}
