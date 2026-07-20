import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { EXPECTED_SANDBOX_CSP, verifyReleaseArtifactFiles } from './artifact-security.mjs';
import {
  createTestLegalArtifactFiles,
  seedTestOssReleasePolicy,
} from './oss-release-policy.test-support';

const tempRoots: string[] = [];
const baseManifest = {
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self';",
    sandbox: EXPECTED_SANDBOX_CSP,
  },
  manifest_version: 3,
  optional_host_permissions: ['http://*/*', 'https://*/*'],
  permissions: ['storage'],
  web_accessible_resources: [
    {
      matches: ['http://*/*', 'https://*/*'],
      resources: ['fonts/manrope-latin-wght-normal.woff2'],
    },
  ],
  sandbox: { pages: ['apps/extension/src/effect-runtime-sandbox/index.html'] },
};
const basePolicy = {
  hostPermissions: [],
  optionalHostPermissions: [{ name: 'http://*/*' }, { name: 'https://*/*' }],
  permissions: [{ name: 'storage' }],
  webAccessibleResources: [
    {
      name: [
        'web_accessible_resources:',
        '{"resources":["fonts/manrope-latin-wght-normal.woff2"],',
        '"matches":["http://*/*","https://*/*"],"extensionIds":[],"useDynamicUrl":false}',
      ].join(''),
    },
  ],
};

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true }))
  );
});

async function createRepoRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sniptale-artifact-security-dynamic-'));
  tempRoots.push(root);
  await fs.mkdir(path.join(root, 'tooling/configs/qa'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'tooling/configs/qa/manifest-permissions.data.json'),
    JSON.stringify(basePolicy)
  );
  await seedTestOssReleasePolicy(root);

  return root;
}

function createFiles(
  text: string,
  options: {
    extensionHtml?: string;
    extensionPagePath?: string;
    sandboxHtml?: string;
    sandboxScriptText?: string;
  } = {}
) {
  return [
    ...createTestLegalArtifactFiles(),
    {
      contents: Buffer.from(JSON.stringify(baseManifest)),
      relativePath: 'manifest.json',
    },
    {
      contents: Buffer.from(text),
      relativePath: 'assets/popup.js',
    },
    ...(options.extensionHtml
      ? [
          {
            contents: Buffer.from(options.extensionHtml),
            relativePath: options.extensionPagePath ?? 'apps/extension/src/popup/index.html',
          },
        ]
      : []),
    {
      contents: Buffer.from(
        options.sandboxHtml ??
          '<!doctype html><script type="module" src="/assets/effect-runtime-sandbox.js"></script>'
      ),
      relativePath: 'apps/extension/src/effect-runtime-sandbox/index.html',
    },
    {
      contents: Buffer.from(options.sandboxScriptText ?? 'export const ok = true;'),
      relativePath: 'assets/effect-runtime-sandbox.js',
    },
  ];
}

async function expectVerifierRejects(text: string, message: string) {
  const repoRoot = await createRepoRoot();

  await expect(verifyReleaseArtifactFiles({ files: createFiles(text), repoRoot })).rejects.toThrow(
    message
  );
}

it('rejects direct Function constructors', async () => {
  for (const text of [
    'export const run = Function("return 1");',
    'z.config({ jitless: true }); export const run = Function("return 1");',
    'export const run = new Function("return 1");',
  ]) {
    await expectVerifierRejects(text, 'dynamic code execution');
  }
});

it('rejects Function constructors in the sandbox page script artifact', async () => {
  const repoRoot = await createRepoRoot();
  await expect(
    verifyReleaseArtifactFiles({
      files: createFiles('export const ok = true;', {
        extensionHtml: '<!doctype html><script type="module" src="/assets/popup.js"></script>',
        sandboxScriptText: 'export const run = new Function("return 1");',
      }),
      repoRoot,
    })
  ).rejects.toThrow('dynamic code execution');
});

it('rejects aliased Function constructors outside vetted Zod probes', async () => {
  for (const text of [
    'const F = Function; export const run = new F("return 1");',
    'const F = Function; export const run = F("return 1");',
    'try { const F = Function; new F(""); return true; } catch { return false; }',
  ]) {
    await expectVerifierRejects(text, 'aliased dynamic code execution');
  }
});

it('rejects source-shaped Zod compiler snippets outside the vetted jitless shape', async () => {
  await expectVerifierRejects(
    [
      'z.config({ jitless: true });',
      'class Doc { compile() { const F = Function; return new F("shape", "payload"); } }',
    ].join(''),
    'aliased dynamic code execution'
  );
});

it('rejects bundled Zod compiler snippets outside the vetted jitless shape', async () => {
  for (const text of [
    [
      'z.config({ jitless: true });',
      'class X { compile() { const F = Function, args = this?.args; return new F("return 1"); } }',
    ].join(''),
    [
      'z.config({ jitless: true });',
      'class X { compile() {',
      'const F = Function; const args = this?.args; const content = this?.content ?? [``];',
      'return new F("return 1");',
      '} }',
    ].join(''),
    [
      'z.config({ jitless: true });',
      'class X{compile(){let t=Function,n=this?.args,o=[...(this?.content??[""]).map(a=>`  ${a}`)];',
      'return new t("return 1")}}',
    ].join(''),
  ]) {
    await expectVerifierRejects(text, 'aliased dynamic code execution');
  }
});

it('rejects wrong-alias Zod compiler snippets', async () => {
  await expectVerifierRejects(
    [
      'z.config({ jitless: true });',
      'class X { compile() {',
      'const F = Function; const args = this?.args; const content = this?.content ?? [``];',
      'const lines = [...content.map((x) => `  ${x}`)]; const G = Function;',
      'return new G(...args, lines.join(`\\n`));',
      '} }',
    ].join(''),
    'aliased dynamic code execution'
  );
  await expectVerifierRejects(
    [
      'z.config({ jitless: true });',
      'class X{compile(){let t=Function,n=this?.args,o=[...(this?.content??[""]).map(a=>`  ${a}`)];',
      'let g=Function;return new g(...n,o.join(`\\n`))}}',
    ].join(''),
    'aliased dynamic code execution'
  );
});

it('rejects adjacent dynamic-code calls next to vetted Zod shapes', async () => {
  await expectVerifierRejects(
    [
      'z.config({ jitless: true });',
      'try { return Function(``), !0 } catch { return !1 }',
      'Function("return 1");',
    ].join(''),
    'dynamic code execution'
  );
  await expectVerifierRejects(
    [
      'z.config({ jitless: true });',
      'try { const F = Function; new F(""); return true; } catch { return false; }',
      'const F = Function; new F("return 1");',
    ].join(''),
    'aliased dynamic code execution'
  );
});

it('rejects adjacent dynamic-code calls next to vetted Zod compilers', async () => {
  await expectVerifierRejects(
    [
      'z.config({ jitless: true });',
      'class X{compile(){let t=Function,n=this?.args,o=[...(this?.content??[""]).map(a=>`  ${a}`)];',
      'return new t(...n,o.join(`\\n`));new t("return 1")}}',
    ].join(''),
    'aliased dynamic code execution'
  );
});

it('does not carry a Zod compiler alias beyond its lexical scope', async () => {
  const repoRoot = await createRepoRoot();
  await expect(
    verifyReleaseArtifactFiles({
      files: createFiles(
        [
          'z.config({ jitless: true });',
          'class X{compile(){let e=Function,t=this?.args,n=[...(this?.content??[``]).map(e=>`  ${e}`)];',
          'return new e(...t,n.join(`\\n`))}}',
          'const schema=e("$ZodType",()=>{});',
        ].join('')
      ),
      repoRoot,
    })
  ).resolves.toBeUndefined();
});

it('allows only vetted jitless Zod dynamic-code probes', async () => {
  const zodCompilerSnippet = [
    'class Doc{compile(){',
    'const F=Function;const args=this?.args;const content=this?.content??[``];',
    'const lines=[...content.map(line=>`  ${line}`)];',
    'return new F(...args,lines.join(`\\n`))',
    '}}',
  ].join('');

  const repoRoot = await createRepoRoot();
  await expect(
    verifyReleaseArtifactFiles({
      files: createFiles(
        [
          'z.config({ jitless: true });',
          'try { return Function(``), !0 } catch { return !1 }',
          'try { const F = Function; new F(""); return true; } catch { return false; }',
          zodCompilerSnippet,
          'class X{compile(){let t=Function,n=this?.args,o=[...(this?.content??[""]).map(a=>`  ${a}`)];',
          'return new t(...n,o.join(`\\n`))}}',
        ].join('')
      ),
      repoRoot,
    })
  ).resolves.toBeUndefined();
});
