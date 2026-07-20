import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import { createTempRoot, writeJson, writeFile } from '../../core/test-helpers';
import { collectFetchOwnershipViolations } from './verify-fetch-ownership.mjs';

function collectViolations(params: {
  fileContents: string;
  policy: {
    credentialedFetchOwners?: Array<{
      file: string;
      justification: string;
      owner: string;
      reviewNote: string;
    }>;
    secretHeaderOwners?: Array<{
      file: string;
      justification: string;
      owner: string;
      reviewNote: string;
    }>;
  };
  relativePath: string;
}) {
  const root = createTempRoot('verify-fetch-ownership-');
  const policyPath = 'tooling/configs/qa/security-network-ownership.data.json';
  writeJson(root, policyPath, params.policy);
  const file = writeFile(root, params.relativePath, params.fileContents);

  return collectFetchOwnershipViolations([file], {
    policyPath,
    rootDir: root,
  });
}

function verifySecretHeaderViolation() {
  expect(
    collectViolations({
      fileContents: 'await fetch(url, { headers: { Authorization: "Bearer secret" } });\n',
      policy: {
        secretHeaderOwners: [],
      },
      relativePath: 'apps/extension/src/settings/example.ts',
    })
  ).toEqual([
    expect.objectContaining({
      rule: 'fetch-secret-header-outside-owner',
      file: 'apps/extension/src/settings/example.ts',
    }),
  ]);
}

function verifyAllowedSecretHeaderOwner() {
  expect(
    collectViolations({
      fileContents: 'await postJsonWithTimeout({ headers: { Authorization: "Bearer secret" } });\n',
      policy: {
        secretHeaderOwners: [
          {
            file: 'apps/extension/src/background/ai/llm/transport/request.ts',
            owner: 'background-llm-transport',
            justification: 'Canonical secret-bearing network transport.',
            reviewNote: 'Keep Authorization header assembly here.',
          },
        ],
      },
      relativePath: 'apps/extension/src/background/ai/llm/transport/request.ts',
    })
  ).toEqual([]);
}

function verifySecretHeaderHelperViolation() {
  expect(
    collectViolations({
      fileContents: 'await postJsonWithTimeout({ headers: { Authorization: "Bearer secret" } });\n',
      policy: {
        secretHeaderOwners: [],
      },
      relativePath: 'apps/extension/src/settings/example.ts',
    })
  ).toEqual([
    expect.objectContaining({
      rule: 'fetch-secret-header-outside-owner',
      file: 'apps/extension/src/settings/example.ts',
    }),
  ]);
}

function verifyUnrelatedCookieDescriptorAllowance() {
  expect(
    collectViolations({
      fileContents:
        "Object.defineProperty(document, 'cookie', { get() { throw new Error('denied'); } });\n",
      policy: { secretHeaderOwners: [] },
      relativePath: 'apps/extension/src/effect-runtime-sandbox/runtime-execution.ts',
    })
  ).toEqual([]);
}

function verifyCredentialedFetchViolation() {
  expect(
    collectViolations({
      fileContents: 'await fetch(url, { credentials: "include" });\n',
      policy: {
        credentialedFetchOwners: [],
        secretHeaderOwners: [],
      },
      relativePath: 'apps/extension/src/content/parser/export-manager/download.ts',
    })
  ).toEqual([
    expect.objectContaining({
      rule: 'fetch-credentialed-request-outside-owner',
      file: 'apps/extension/src/content/parser/export-manager/download.ts',
    }),
  ]);
}

function verifyAllowedCredentialedFetchOwner() {
  expect(
    collectViolations({
      fileContents: 'await fetch(url, { credentials: "include" });\n',
      policy: {
        credentialedFetchOwners: [
          {
            file: 'apps/extension/src/content/parser/export-manager/download.ts',
            owner: 'content-export-manager',
            justification: 'Canonical same-origin export download owner.',
            reviewNote: 'Keep credentialed same-origin downloads here.',
          },
        ],
        secretHeaderOwners: [],
      },
      relativePath: 'apps/extension/src/content/parser/export-manager/download.ts',
    })
  ).toEqual([]);
}

function verifyMissingPolicyTargetViolation() {
  expect(
    collectViolations({
      fileContents: 'await fetch(url, { headers: { Authorization: "Bearer secret" } });\n',
      policy: {
        secretHeaderOwners: [
          {
            file: 'apps/extension/src/background/ai/llm/missing.ts',
            owner: 'background-llm-transport',
            justification: 'Canonical secret-bearing network transport.',
            reviewNote: 'Keep Authorization header assembly here.',
          },
        ],
      },
      relativePath: 'apps/extension/src/background/ai/llm/transport/request.ts',
    })
  ).toEqual([
    expect.objectContaining({
      rule: 'security-policy-fetch-ownership-missing-target',
      file: 'tooling/configs/qa/security-network-ownership.data.json',
    }),
    expect.objectContaining({
      rule: 'fetch-secret-header-outside-owner',
      file: 'apps/extension/src/background/ai/llm/transport/request.ts',
    }),
  ]);
}

describe('verify-fetch-ownership', () => {
  it('flags secret-bearing fetch headers outside the transport owner', () => {
    verifySecretHeaderViolation();
  });

  it('allows secret-bearing fetch headers inside the approved transport owner', () => {
    verifyAllowedSecretHeaderOwner();
  });

  it('flags secret-bearing helper requests outside the transport owner', () => {
    verifySecretHeaderHelperViolation();
  });

  it('ignores non-request cookie denial descriptors', () => {
    verifyUnrelatedCookieDescriptorAllowance();
  });

  it('flags credentialed fetches outside the approved export/network owners', () => {
    verifyCredentialedFetchViolation();
  });

  it('allows credentialed fetches inside the approved export/network owners', () => {
    verifyAllowedCredentialedFetchOwner();
  });

  it('flags stale allowlist targets so the registry cannot silently drift', () => {
    verifyMissingPolicyTargetViolation();
  });

  it('keeps CodeQL credentialed fetch owners aligned with the security registry', () => {
    const policy = JSON.parse(
      fs.readFileSync('tooling/configs/qa/security-network-ownership.data.json', 'utf8')
    );
    const qll = fs.readFileSync('tooling/qa/codeql/lib/SniptaleOwnership.qll', 'utf8');

    for (const owner of policy.credentialedFetchOwners) {
      expect(qll).toContain(`"${owner.file}"`);
    }
  });
});
