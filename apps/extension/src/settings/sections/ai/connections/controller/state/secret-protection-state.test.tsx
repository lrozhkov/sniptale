// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { useAiSecretProtectionDataState } from './secret-protection-state';

it('owns the secret-protection status projection', () => {
  let latest: ReturnType<typeof useAiSecretProtectionDataState> | undefined;
  function Harness() {
    latest = useAiSecretProtectionDataState();
    return null;
  }
  const root = createRoot(document.createElement('div'));
  act(() => root.render(<Harness />));
  expect(latest?.secretProtectionStatus).toMatchObject({ isEnabled: false, isUnlocked: true });
  act(() =>
    latest?.setSecretProtectionStatus({
      isEnabled: true,
      isUnlocked: false,
      mode: 'passphrase',
    })
  );
  expect(latest?.secretProtectionStatus).toMatchObject({ isEnabled: true, isUnlocked: false });
  act(() => root.unmount());
});
