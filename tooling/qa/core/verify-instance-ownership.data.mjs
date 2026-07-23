import { loadInstanceOwnershipInventory } from './verify-instance-ownership.inventory-owner.mjs';

export const OWNERSHIP_WAVES = loadInstanceOwnershipInventory();

export const OWNERSHIP_FACADE_FILES = new Set(
  OWNERSHIP_WAVES.filter((wave) => wave.rule === 'facade-default-owner').flatMap(
    (wave) => wave.files
  )
);

export const OWNERSHIP_STATE_FILES = new Set(
  OWNERSHIP_WAVES.filter((wave) => wave.rule === 'no-top-level-mutable-runtime-state').flatMap(
    (wave) => wave.files
  )
);
