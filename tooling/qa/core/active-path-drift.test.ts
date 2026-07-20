import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  isDataCarrierFile,
  isFormattableFile,
  isIgnoredRelativePath,
  isTokenBudgetFile,
  repoRoot,
} from './shared.mjs';
import { LOGGING_ALLOWLISTED_FILES } from './verify-logging.mjs';
import { LOCAL_STORAGE_OWNER_FILES } from '../policy/browser-adapters-owners.mjs';
import { ALLOWED_DIRECT_MESSAGE_FILES } from '../policy/messaging.mjs';
import { SECURITY_DATA_TRIGGER_PATTERNS } from './verify-focused.config.mjs';

function expectPathsToExist(paths: Iterable<string>) {
  for (const relativePath of paths) {
    expect(fs.existsSync(path.join(repoRoot, relativePath)), relativePath).toBe(true);
  }
}

function expectActiveWorkflowDocPaths() {
  const codeQuality = fs.readFileSync(path.join(repoRoot, 'docs/tooling/code-quality.md'), 'utf8');
  const repoAuditSkill = fs.readFileSync(
    path.join(repoRoot, '.agents/skills/repo-audit/SKILL.md'),
    'utf8'
  );

  expect(codeQuality).toContain('tooling/configs/qa/quality-baseline.json');
  expect(codeQuality).toContain('tooling/configs/qa/validation-manifest.json');
  expect(codeQuality).not.toContain('tooling/qa/core/quality-baseline.json');
  expect(codeQuality).not.toContain('tooling/qa/core/validation-manifest.json');

  expect(repoAuditSkill).toContain('tooling/configs/qa/validation-manifest.json');
  expect(repoAuditSkill).not.toContain('tooling/qa/core/validation-manifest.json');
}

function expectArchitectureDocPaths() {
  const implementationRules = fs.readFileSync(
    path.join(repoRoot, 'docs/engineering/implementation-rules.md'),
    'utf8'
  );
  const runtimeContexts = fs.readFileSync(
    path.join(repoRoot, 'docs/architecture/runtime-contexts.md'),
    'utf8'
  );
  const sharedTopology = fs.readFileSync(
    path.join(repoRoot, 'docs/architecture/shared-topology.md'),
    'utf8'
  );

  expect(implementationRules).toContain('@sniptale/platform/observability/logger');
  expect(implementationRules).toContain('Retired broad shared facades');
  expect(implementationRules).toContain('exact package export or concrete app owner');
  expect(implementationRules).toContain('app-core contracts');
  expect(implementationRules).toContain('@sniptale/ui');
  expect(implementationRules).toContain('must not be reintroduced');
  expect(implementationRules).not.toContain('src/shared/logger.ts');
  expect(implementationRules).not.toContain('src/shared/types.ts');
  expect(implementationRules).not.toContain('src/shared/storage.ts');
  expect(implementationRules).not.toContain('src/shared/db.ts');
  expect(implementationRules).not.toContain('src/shared/video-types.ts');

  expect(runtimeContexts).toContain('packages/runtime-contracts');
  expect(runtimeContexts).toContain('apps/extension/src/composition/persistence');
  expect(runtimeContexts).toContain('packages/ui');
  expect(runtimeContexts).not.toContain('src/shared/types.ts');
  expect(runtimeContexts).not.toContain('src/shared/storage.ts');
  expect(runtimeContexts).not.toContain('src/shared/db.ts');
  expect(runtimeContexts).not.toContain('src/shared/theme.ts');

  expect(sharedTopology).toContain('packages/foundation');
  expect(sharedTopology).toContain('packages/runtime-contracts');
  expect(sharedTopology).toContain('packages/platform');
  expect(sharedTopology).toContain('packages/ui');
  expect(sharedTopology).not.toContain('packages/legacy-shared');
}

function expectFocusedTriggerPaths() {
  const focusedConfig = fs.readFileSync(
    path.join(repoRoot, 'tooling/qa/core/verify-focused.config.mjs'),
    'utf8'
  );
  expect(focusedConfig).toContain('DESIGN.md');
  expect(focusedConfig).toContain(
    'apps/extension/src/background/media/video/runtime/offscreen-document-dto.ts'
  );
  expect(focusedConfig).not.toContain(['docs/design', 'ux-ui-concept'].join('/'));

  const i18nHelpers = fs.readFileSync(
    path.join(repoRoot, 'tooling/qa/core/verify-i18n.helpers.mjs'),
    'utf8'
  );
  const qualityConfig = fs.readFileSync(
    path.join(repoRoot, 'tooling/qa/core/quality.config.mjs'),
    'utf8'
  );
  const retiredQualityGateRoot = ['scripts', 'quality-gates'].join('/');
  expect(focusedConfig).not.toContain(retiredQualityGateRoot);
  expect(i18nHelpers).not.toContain(retiredQualityGateRoot);
  expect(qualityConfig).not.toContain(retiredQualityGateRoot);

  expect(
    SECURITY_DATA_TRIGGER_PATTERNS.some((pattern) =>
      pattern.test('tooling/configs/qa/security-network-ownership.data.json')
    )
  ).toBe(true);
  expect(focusedConfig).not.toContain(
    'tooling/qa/guards/security/security-network-ownership.data.json'
  );
}

function expectRetiredRootDocs() {
  const repositoryOverview = fs.readFileSync(
    path.join(repoRoot, 'docs/architecture/repository-overview.md'),
    'utf8'
  );

  expect(repositoryOverview).toContain('`tooling/test`');
  expect(repositoryOverview).not.toContain('`tests` - repo-owned e2e tests');
}

describe('active QA policy path integrity', () => {
  it('keeps active allowlists aligned with real canonical owner paths', () => {
    expectPathsToExist(LOCAL_STORAGE_OWNER_FILES);
    expectPathsToExist(LOGGING_ALLOWLISTED_FILES);
    expectPathsToExist(ALLOWED_DIRECT_MESSAGE_FILES);
  });

  it('keeps active policy guidance aligned with canonical index entrypoints', () => {
    const loggingPolicy = fs.readFileSync(
      path.join(repoRoot, 'tooling/qa/core/verify-logging.mjs'),
      'utf8'
    );
    const messagingPolicy = fs.readFileSync(
      path.join(repoRoot, 'tooling/qa/policy/messaging.mjs'),
      'utf8'
    );

    expect(loggingPolicy).toContain('@sniptale/platform/observability/logger');
    expect(loggingPolicy).not.toContain('src/shared/logger.ts');
    expect(messagingPolicy).toContain('apps/extension/src/platform/runtime-messaging/index.ts');
    expect(messagingPolicy).not.toContain('src/shared/runtime-messaging.ts');
  });

  it('keeps focused trigger paths on active tooling/qa owners', () => {
    expectFocusedTriggerPaths();
  });

  it('keeps tooling configs visible to diff scope while excluding size gates', () => {
    const configPath = 'tooling/configs/qa/manifest-permissions.data.json';

    expect(isIgnoredRelativePath(configPath)).toBe(false);
    expect(isFormattableFile(configPath)).toBe(false);
    expect(isDataCarrierFile(configPath)).toBe(true);
    expect(isTokenBudgetFile(configPath)).toBe(false);
  });

  it('keeps review skills visible to diff fingerprints and QA partitioning', () => {
    expect(isIgnoredRelativePath('.agents/skills/topology-plan-review/SKILL.md')).toBe(false);
  });
});

describe('active workflow doc path integrity', () => {
  it('uses current manifest and tracing entrypoint paths in active docs and skills', () => {
    expectActiveWorkflowDocPaths();
  });

  it('keeps architecture docs aligned with canonical shared index facades', () => {
    expectArchitectureDocPaths();
  });

  it('keeps active architecture docs off retired root guidance', () => {
    expectRetiredRootDocs();
  });
});
