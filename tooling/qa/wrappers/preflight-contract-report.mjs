import fs from 'node:fs';

import { QUALITY_LIMITS } from '../core/quality.config.mjs';
import { fromRelativePath } from '../core/shared.mjs';

const BOUNDARY_TARGET_PATTERN = /^(?:apps\/extension\/src|packages\/[^/]+\/src)\//u;
const BOUNDARY_ROLE_TOKENS = [
  'contracts',
  'custom-shapes',
  'db',
  'effect-bundle',
  'effect-runtime',
  'file-actions',
  'import',
  'llm',
  'parser',
  'runtime',
  'storage',
  'transport',
  'web-snapshot',
  'zip',
];
const TEST_FILE_PATTERN = /\.(?:test|spec)\.(?:ts|tsx)$/u;

function isBoundaryTarget(file) {
  return (
    BOUNDARY_TARGET_PATTERN.test(file) && BOUNDARY_ROLE_TOKENS.some((token) => file.includes(token))
  );
}

export function collectContractChecklist(context) {
  if (!context.codeFiles.some(isBoundaryTarget)) {
    return [];
  }

  const sharedContracts = context.codeFiles.filter((file) =>
    /^apps\/extension\/src\/(?:contracts|composition\/persistence|features)\//u.test(file)
  );
  const runtimeBoundaries = context.codeFiles.filter((file) =>
    /^(?:src\/(?:background|content|offscreen)|apps\/extension\/src\/web-snapshot-viewer)\//u.test(
      file
    )
  );
  const importBoundaries = context.codeFiles.filter((file) =>
    /(?:import|zip|file-actions|custom-shapes|effect-bundle|effect-runtime|web-snapshot)/u.test(
      file
    )
  );

  return [
    'owner seam / boundary: name the runtime or import owner before editing',
    `public/shared contracts touched: ${sharedContracts.join(', ') || 'none detected'}`,
    `runtime/import boundary files: ${[...runtimeBoundaries, ...importBoundaries].join(', ') || 'none detected'}`,
    'negative/failure proof: malformed, stale/replay/duplicate, cancellation, rollback if applicable',
    'user-visible acceptance proof: roundtrip or UI workflow for the changed owner seam',
  ];
}

export function collectTransitiveConsumerHints(context) {
  const hints = [];

  if (
    context.codeFiles.some((file) =>
      /^(?:apps\/extension\/src\/contracts\/messaging|packages\/runtime-contracts\/src\/messaging)\//u.test(
        file
      )
    )
  ) {
    hints.push('messaging contracts: check runtime route maps, sender policies, and callsites');
  }
  if (
    context.codeFiles.some((file) =>
      /^apps\/extension\/src\/composition\/persistence\/(?:storage|db)\//u.test(file)
    )
  ) {
    hints.push('storage/db contracts: check bootstrap, clone/delete, backup/restore, settings UI');
  }
  if (
    context.codeFiles.some((file) =>
      /^apps\/extension\/src\/(?:effect-runtime-sandbox|features\/video\/project\/effect-bundle)\//u.test(
        file
      )
    )
  ) {
    hints.push(
      'EffectV1 contracts: check bundle import, snapshot materialization, preview, audio, and export'
    );
  }
  if (
    context.codeFiles.some((file) =>
      /^apps\/extension\/src\/editor\/lib\/file-actions\//u.test(file)
    )
  ) {
    hints.push('editor file-actions: check sidebar/action-rail callers and import roundtrip tests');
  }
  if (
    context.codeFiles.some((file) =>
      /^apps\/extension\/src\/content\/logic\/web-snapshot\//u.test(file)
    )
  ) {
    hints.push('web-snapshot: check popup export, staged transfer, background save, viewer tests');
  }

  return [...new Set(hints)];
}

export function collectTypecheckBlastRadius(context) {
  const hints = [];

  if (
    context.codeFiles.some((file) =>
      /^(?:apps\/extension\/src\/contracts\/messaging|packages\/runtime-contracts\/src\/messaging)\//u.test(
        file
      )
    )
  ) {
    hints.push('messaging contracts can fan out into background/content/popup/offscreen routers');
  }
  if (
    context.codeFiles.some(
      (file) =>
        (/^apps\/extension\/src\/(?:contracts|features|foundation|platform|ui|workflows)\//u.test(
          file
        ) &&
          /(?:types|index)\.(?:ts|tsx)$/u.test(file)) ||
        /^packages\/[^/]+\/src\/.*(?:types|index)\.(?:ts|tsx)$/u.test(file)
    )
  ) {
    hints.push('shared type/barrel exports can trigger broad transitive typecheck fallout');
  }
  if (
    context.codeFiles.some((file) =>
      /^apps\/extension\/src\/features\/video\/project\//u.test(file)
    )
  ) {
    hints.push('video project types can fan out into editor, renderer, offscreen export, tests');
  }
  if (
    context.codeFiles.some((file) =>
      /^apps\/extension\/src\/features\/editor\/document\//u.test(file)
    )
  ) {
    hints.push(
      'editor document types can fan out into editor, scenario capture, autosave, imports'
    );
  }

  return [...new Set(hints)];
}

export function collectTargetTestSizeWarnings(targetFiles) {
  const warningLimit = Math.floor(QUALITY_LIMITS.maxFileLines * 0.9);
  return targetFiles
    .filter((file) => TEST_FILE_PATTERN.test(file))
    .map((file) => {
      const absolutePath = fromRelativePath(file);
      try {
        return { file, lines: fs.readFileSync(absolutePath, 'utf8').split(/\r?\n/u).length };
      } catch (error) {
        if (
          error &&
          typeof error === 'object' &&
          (error.code === 'ENOENT' || error.code === 'EISDIR')
        ) {
          return null;
        }
        throw error;
      }
    })
    .filter((entry) => entry && entry.lines >= warningLimit)
    .map(
      (entry) =>
        `${entry.file}: ${entry.lines} lines; split boundary/roundtrip/fixture cases owner-locally`
    );
}
