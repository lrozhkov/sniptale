export const executableEntryFixtures = [
  {
    name: 'canonical imported predicate',
    source: `
      import { isExecutedAsScript } from '../shared.mjs';
      if (isExecutedAsScript(import.meta.url)) run();
    `,
  },
  {
    name: 'aliased imported predicate',
    source: `
      import { isExecutedAsScript as script } from '../shared.mjs';
      if (script(import.meta.url)) run();
    `,
  },
  {
    name: 'imported execution runner',
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
];

export const nonExecutableEntryFixtures = [
  {
    name: 'literal and comment mentions',
    source: `
      const example = 'isExecutedAsScript(import.meta.url)';
      // if (import.meta.url === \`file://\${process.argv[1]}\`) run();
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
    name: 'unrelated top-level arguments branch',
    source: `
      if (process.argv[1]) console.log(import.meta.url);
    `,
  },
];
