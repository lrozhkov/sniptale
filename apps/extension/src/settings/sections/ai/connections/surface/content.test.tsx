// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
vi.mock('./chrome-ai-card', () => ({ AIProvidersChromeAiCard: () => <div>chrome-ai</div> }));
vi.mock('../../../../secret-protection/context', () => ({
  SettingsSecretProtectionParticipantSummary: () => <div>ai-protection-summary</div>,
}));
vi.mock('./cards', () => ({ AIProvidersProvidersCard: () => <div>providers</div> }));
vi.mock('./models-card', () => ({ AIProvidersModelsCard: () => <div>models</div> }));
vi.mock('./modals', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./modals')>()),
  AIProvidersSectionModals: () => null,
}));
import { AIProvidersSectionContent } from './content';
import type { AiProvidersSectionState } from '../controller/types';
import { createMockAiProvidersSectionState } from './test-support';

function createState(): AiProvidersSectionState {
  return createMockAiProvidersSectionState();
}

it.each([
  ['integrations', ['providers', 'models', 'ai-protection-summary'], ['chrome-ai']],
  ['chrome-ai', ['chrome-ai'], ['providers', 'models', 'ai-protection-summary']],
] as const)('renders only the %s subpage content', (view, visible, hidden) => {
  const node = document.createElement('div');
  const root = createRoot(node);
  act(() => root.render(<AIProvidersSectionContent state={createState()} view={view} />));
  visible.forEach((text) => expect(node.textContent).toContain(text));
  hidden.forEach((text) => expect(node.textContent).not.toContain(text));
  expect(node.querySelector('textarea')).toBeNull();
  act(() => root.unmount());
});
