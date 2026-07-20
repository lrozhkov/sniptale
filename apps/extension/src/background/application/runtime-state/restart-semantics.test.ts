import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, it } from 'vitest';

import { getPolicyStateDescriptor } from '../../routing-contracts/policy-state';
import { runtimeAuthorityRestartSemantics } from './restart-semantics';

const backgroundRoot = new URL('../../', import.meta.url);
const privilegedMemoryOwnerPattern = /createPrivilegedSyncMemoryDomain\s*</;
const privilegedMemoryFactoryModule =
  'routing-contracts/capabilities/privileged-authority/state.ts';

function collectProductionSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectProductionSources(path);
    }
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) {
      return [];
    }
    return [path];
  });
}

function collectPrivilegedMemoryOwnerModules(): string[] {
  return collectProductionSources(backgroundRoot.pathname)
    .map((path) => relative(backgroundRoot.pathname, path))
    .filter((path) => path !== privilegedMemoryFactoryModule)
    .filter((path) =>
      privilegedMemoryOwnerPattern.test(readFileSync(join(backgroundRoot.pathname, path), 'utf8'))
    )
    .map((path) => `apps/extension/src/background/${path}`)
    .sort();
}

it('keeps MV3 restart semantics explicit for in-memory authority owners', () => {
  expect(runtimeAuthorityRestartSemantics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ authority: 'AI secret unlock requests' }),
      expect.objectContaining({ authority: 'Debugger activation proofs' }),
      expect.objectContaining({ authority: 'HAR active sessions and timers' }),
      expect.objectContaining({ authority: 'HAR start capabilities' }),
      expect.objectContaining({ authority: 'LLM session tokens' }),
      expect.objectContaining({ authority: 'Popup tab-route capabilities' }),
      expect.objectContaining({ authority: 'Content privileged action capabilities' }),
      expect.objectContaining({ authority: 'Gallery image update capabilities' }),
      expect.objectContaining({ authority: 'Web snapshot staged blobs' }),
      expect.objectContaining({ authority: 'Recording download staged chunks' }),
      expect.objectContaining({ authority: 'Popup export staged archives' }),
      expect.objectContaining({ authority: 'Video recording control lease' }),
      expect.objectContaining({ authority: 'Project export ledger and capabilities' }),
    ])
  );

  for (const entry of runtimeAuthorityRestartSemantics) {
    expect(entry.restartBehavior, entry.authority).not.toHaveLength(0);
    expect(existsSync(join(process.cwd(), entry.ownerModule)), entry.authority).toBe(true);
    expect(existsSync(join(process.cwd(), entry.proofModule)), entry.authority).toBe(true);
  }
});

it('covers every production privileged memory-domain owner', () => {
  expect(runtimeAuthorityRestartSemantics.map((entry) => entry.ownerModule).sort()).toEqual(
    expect.arrayContaining(collectPrivilegedMemoryOwnerModules())
  );
});

it('documents AI unlock restart recovery semantics explicitly', () => {
  expect(runtimeAuthorityRestartSemantics).toContainEqual({
    authority: 'AI secret unlock requests',
    ownerModule: 'apps/extension/src/background/ai/settings/secret-unlock-route.ts',
    proofModule: 'apps/extension/src/background/ai/settings/secret-unlock-route.lifecycle.test.ts',
    restartBehavior:
      'Pending unlock request metadata is recovered from session storage; decrypted key material ' +
      'remains memory-only and reports restart-required after restart.',
    restartClass: 'reconstructible',
  });
});

it('documents content privileged action restart semantics explicitly', () => {
  expect(runtimeAuthorityRestartSemantics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        authority: 'Content privileged action activation keys',
        restartClass: 'disposable-fail-closed',
      }),
      expect.objectContaining({
        authority: 'Content privileged action runtime proofs',
        restartClass: 'disposable-fail-closed',
      }),
    ])
  );
});

it('links tab-mode runtime state restart semantics to its policy-state descriptor', () => {
  const semantics = runtimeAuthorityRestartSemantics.find(
    (entry) => entry.authority === 'Tab-mode runtime state'
  );

  expect(semantics).toEqual(
    expect.objectContaining({
      ownerModule: 'apps/extension/src/background/application/runtime-state/index.ts',
      proofModule: 'apps/extension/src/background/application/runtime-state/index.test.ts',
      restartClass: 'reconstructible',
    })
  );
  expect(getPolicyStateDescriptor('tab-mode-runtime-state')).toEqual(
    expect.objectContaining({
      ownerModule: semantics?.ownerModule,
      proofModules: [semantics?.proofModule],
      restartClass: semantics?.restartClass,
      storageClass: 'memory-only',
    })
  );
});
