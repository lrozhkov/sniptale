import { describe, expect, it } from 'vitest';

import { createTempRoot, writeJson, writeFile } from '../../../../test-support/test-helpers';
import { collectFetchOwnershipViolations } from './check.mjs';

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

function verifyEveryRetiredPatternSecretHeader() {
  for (const header of ['Authorization', 'Cookie', 'X-API-Key']) {
    expect(
      collectViolations({
        fileContents: `await fetch(url, { headers: { "${header}": "secret" } });\n`,
        policy: { secretHeaderOwners: [] },
        relativePath: 'apps/extension/src/settings/example.ts',
      })
    ).toEqual([expect.objectContaining({ rule: 'fetch-secret-header-outside-owner' })]);
  }
}

function verifyAllowedSecretHeaderOwner() {
  expect(
    collectViolations({
      fileContents:
        'import { postJsonWithTimeout } from "./http";\n' +
        'await postJsonWithTimeout({ headers: { Authorization: "Bearer secret" } });\n',
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
      fileContents:
        'import { postJsonWithTimeout } from "./http";\n' +
        'await postJsonWithTimeout({ headers: { Authorization: "Bearer secret" } });\n',
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
      rule: 'security-policy-secret-header-owner-missing-target',
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

  it('subsumes every secret header formerly matched by the retired pattern scan', () => {
    verifyEveryRetiredPatternSecretHeader();
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

  it.each([
    [
      'aliased headers object',
      'const headers = { Authorization: token }; fetch(url, { headers });\n',
    ],
    [
      'computed static header',
      "const AUTH = 'Authorization'; fetch(url, { headers: { [AUTH]: token } });\n",
    ],
    [
      'Headers mutation',
      "const headers = new Headers(); headers.set('Authorization', token); fetch(url, { headers });\n",
    ],
    ['case-normalized API key', 'fetch(url, { headers: { AUTHORIZATION: token } });\n'],
    ['hyphen-normalized API key', "fetch(url, { headers: { 'x-Api-Key': token } });\n"],
  ])('flags secret headers through %s', (_label, fileContents) => {
    expect(
      collectViolations({
        fileContents,
        policy: { secretHeaderOwners: [] },
        relativePath: 'apps/extension/src/settings/example.ts',
      })
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'fetch-secret-header-outside-owner' }),
      ])
    );
  });

  it.each([
    [
      'aliased credentials',
      "const credentials = 'include'; const init = { credentials }; fetch(url, init);\n",
    ],
    ['Request constructor', "fetch(new Request(url, { credentials: 'include' }));\n"],
    [
      'aliased fetch',
      "const request = fetch; const init = { credentials: 'include' }; request(url, init);\n",
    ],
    ['quoted property', "fetch(url, { 'credentials': 'include' });\n"],
  ])('flags credential inclusion through %s', (_label, fileContents) => {
    expect(
      collectViolations({
        fileContents,
        policy: { credentialedFetchOwners: [], secretHeaderOwners: [] },
        relativePath: 'apps/extension/src/settings/example.ts',
      })
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'fetch-credentialed-request-outside-owner' }),
      ])
    );
  });

  it.each([
    ['renderTable({ headers: { Authorization: "column" } });\n'],
    ['createForm({ credentials: "include" });\n'],
    ['const note = "fetch(url, { credentials: include })";\n'],
  ])('ignores a non-network object or source-text mention', (fileContents) => {
    expect(
      collectViolations({
        fileContents,
        policy: { credentialedFetchOwners: [], secretHeaderOwners: [] },
        relativePath: 'apps/extension/src/settings/example.ts',
      })
    ).toEqual([]);
  });

  it('rejects an existing but stale owner entitlement', () => {
    expect(
      collectViolations({
        fileContents: 'export const safe = true;\n',
        policy: {
          secretHeaderOwners: [
            {
              file: 'apps/extension/src/settings/example.ts',
              owner: 'stale-owner',
              justification: 'Fixture stale owner.',
              reviewNote: 'Must contain the classified sink.',
            },
          ],
        },
        relativePath: 'apps/extension/src/settings/example.ts',
      })
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: 'fetch-secret-header-owner-stale' })])
    );
  });
});
