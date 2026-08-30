export const guardedExecutableFixtures = [
  {
    name: 'canonical imported predicate',
    source: `
      import { isExecutedAsScript } from '../shared.mjs';
      if (isExecutedAsScript(import.meta.url)) run();
    `,
  },
  {
    name: 'aliased imported predicate used by verify-test-coverage',
    source: `
      import { isExecutedAsScript as script } from '../shared.mjs';
      if (script(import.meta.url)) run();
    `,
  },
  {
    name: 'imported execution runner alias',
    source: `
      import { runIfExecutedAsScript as runWhenDirect } from '../audit-guardrail-shared.mjs';
      runWhenDirect(import.meta.url, { collectViolations });
    `,
  },
  {
    name: 'direct file URL template guard',
    source: `
      if (import.meta.url === \`file://\${process.argv[1]}\`) run();
    `,
  },
  {
    name: 'pathToFileURL guard',
    source: `
      import { pathToFileURL } from 'node:url';
      if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run();
    `,
  },
  {
    name: 'aliased pathToFileURL guard',
    source: `
      import { pathToFileURL as toFileUrl } from 'node:url';
      if (toFileUrl(process.argv[1]).href === import.meta.url) run();
    `,
  },
  {
    name: 'CommonJS require.main guard',
    fileName: 'fixture.cjs',
    source: `
      if (require.main === module) run();
    `,
  },
] as const;

export const generateDocsStyleSource = `
  const args = process.argv.slice(2);
  generateManifest(args);
`;

export const eagerExecutableFixtures = [
  {
    name: 'unrelated argv and import-meta branch remains eager but is not an entry guard',
    source: 'if (process.argv[1]) console.log(import.meta.url);',
  },
  { name: 'top-level stdout write', source: "process.stdout.write('ready');" },
  { name: 'top-level stderr write', source: "process.stderr.write('failed');" },
  { name: 'top-level process exit', source: 'process.exit(1);' },
  { name: 'top-level await', source: 'await run();' },
] as const;

export const silentModuleFixtures = [
  {
    name: 'literal and comment mentions',
    source: `
      const example = 'process.stdout.write and isExecutedAsScript(import.meta.url)';
      // if (import.meta.url === \`file://\${process.argv[1]}\`) run();
    `,
  },
  {
    name: 'embedded fixture source',
    source: `
      export const fixture = \`process.stderr.write('fixture'); await run();\`;
    `,
  },
  {
    name: 'pure re-export facade',
    source: `
      export * from './owner.mjs';
      export { run } from './owner.mjs';
    `,
  },
  {
    name: 'inert argv aliases',
    source: `
      export const args = process.argv.slice(2);
      export const computedArgs = process['argv'];
    `,
  },
  {
    name: 'import without invocation',
    source: `
      import { isExecutedAsScript as script } from '../shared.mjs';
      export { script };
    `,
  },
  {
    name: 'unimported lookalike helper',
    source: `
      function isExecutedAsScript() { return true; }
      if (isExecutedAsScript(import.meta.url)) run();
    `,
  },
  {
    name: 'helper call confined to an exported function',
    source: `
      import { isExecutedAsScript } from '../shared.mjs';
      export function runFromCaller() {
        if (isExecutedAsScript(import.meta.url)) run();
      }
    `,
  },
  {
    name: 'helper call confined to a function-valued condition',
    source: `
      import { isExecutedAsScript } from '../shared.mjs';
      if (() => isExecutedAsScript(import.meta.url)) run();
    `,
  },
  {
    name: 'eager-looking operations confined to a function',
    source: `
      const args = process.argv.slice(2);
      export async function runFromCaller() {
        process.stdout.write(args[1]);
        await run();
      }
    `,
  },
] as const;

export const runtimeParityEquivalentSource = `
  import path from 'node:path';
  import { fileURLToPath } from 'node:url';
  const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
  if (invokedPath === fileURLToPath(import.meta.url)) {
    process.stdout.write('OK');
  }
`;
