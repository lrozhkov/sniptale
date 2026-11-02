import type { AIModel, AIProvider } from '../../../../../contracts/settings';
import type { ChromeAiAvailability } from '@sniptale/platform/browser/chrome-ai';

type ProviderModalState = { open: boolean; provider?: AIProvider | null };
type ModelModalState = { open: boolean; model?: AIModel | null; initialProviderId?: string };

export type AiProvidersDeleteState =
  | { type: 'provider'; item: AIProvider }
  | { type: 'model'; item: AIModel }
  | null;

interface AiProvidersChromeAiState {
  availability: ChromeAiAvailability;
  enabled: boolean;
  error: string | null;
  handleTest: () => Promise<void>;
  handleToggle: () => Promise<void>;
  isChecking: boolean;
  isSettingUp: boolean;
  setupProgress: number | null;
  testStatus: 'idle' | 'running' | 'success' | 'error';
}

interface AiProvidersModalsState {
  provider: ProviderModalState;
  model: ModelModalState;
  confirmDelete: AiProvidersDeleteState;
  openProviderModal: (provider?: AIProvider) => void;
  closeProviderModal: () => void;
  openModelModal: (model?: AIModel, initialProviderId?: string) => void;
  closeModelModal: () => void;
  setConfirmDelete: (value: AiProvidersDeleteState) => void;
}

export interface AiProvidersSectionState {
  catalogActions: {
    clearProviderSecret: (providerId: string) => Promise<void>;
    deleteModel: () => Promise<void>;
    deleteProvider: () => Promise<void>;
    moveModel: (modelId: string, beforeModelId: string | null) => Promise<boolean>;
  };
  chromeAi: AiProvidersChromeAiState;
  secretProtection: { ensureUnlocked: () => Promise<void> };
  providers: AIProvider[];
  models: AIModel[];
  catalogModels: AIModel[];
  isLoading: boolean;
  modelOptions: { value: string; label: string }[];
  modals: AiProvidersModalsState;
  reloadData: () => Promise<void>;
  getProviderName: (providerId: string) => string;
}
