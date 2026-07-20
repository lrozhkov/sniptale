import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

import { translate } from '../../../../platform/i18n';
import type { AiProvidersSectionState } from '../controller/types';
import { AIProvidersSecretProtectionCard } from './secret-protection-card';
import { createMockSecretProtectionState } from './test-support';

function renderCard(secretProtection: AiProvidersSectionState['secretProtection']) {
  return renderToStaticMarkup(
    <AIProvidersSecretProtectionCard state={{ secretProtection } as AiProvidersSectionState} />
  );
}

it('renders the default transparent protection state', () => {
  const markup = renderCard(createMockSecretProtectionState());
  const transparentDescription = translate(
    'settings.aiProviders.secretProtectionTransparentDescription'
  );
  const transparentDescriptionEn = translate(
    'settings.aiProviders.secretProtectionTransparentDescription',
    'en'
  );
  const transparentStatus = translate('settings.aiProviders.secretProtectionOffStatus');
  const transparentStatusEn = translate('settings.aiProviders.secretProtectionOffStatus', 'en');

  expect(markup).toContain(translate('settings.aiProviders.secretProtectionTitle'));
  expect(markup).toContain(transparentStatus);
  expect(markup).toContain(transparentDescription);
  expect(transparentDescriptionEn).toContain('profile dump can recover provider keys');
  expect(transparentStatusEn).toContain('recoverable from profile storage');
  expect(markup).toContain(translate('settings.aiProviders.secretProtectionTransparentMode'));
  expect(markup).not.toContain(
    translate('settings.aiProviders.secretProtectionPassphraseDescription')
  );
});

it('renders locked passphrase actions', () => {
  const state = {
    ...createMockSecretProtectionState(),
    status: { isEnabled: true, isUnlocked: false, mode: 'passphrase' as const },
    handleOpenUnlockDialog: vi.fn(),
  };

  const markup = renderCard(state);
  const passphraseDescription = translate(
    'settings.aiProviders.secretProtectionPassphraseDescription'
  );
  const passphraseDescriptionEn = translate(
    'settings.aiProviders.secretProtectionPassphraseDescription',
    'en'
  );

  expect(markup).toContain(translate('settings.aiProviders.secretProtectionLockedStatus'));
  expect(markup).toContain(passphraseDescription);
  expect(passphraseDescriptionEn).toContain('storage dump cannot decrypt them without it');
  expect(markup).not.toContain(
    translate('settings.aiProviders.secretProtectionTransparentDescription')
  );
  expect(markup).toContain(translate('settings.aiProviders.secretProtectionUnlockAction'));
  expect(markup).toContain(translate('settings.aiProviders.secretProtectionChangeAction'));
});
