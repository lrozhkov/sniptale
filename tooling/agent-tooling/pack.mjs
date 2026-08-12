import path from 'node:path';

import { packAgentTooling, repoRoot } from './agent-tooling.mjs';

if (process.argv.length > 2) throw new Error(`Unsupported argument: ${process.argv[2]}`);

const result = await packAgentTooling();
console.log(
  `Packed optional agent tooling (${result.files.length} files) to ${path.relative(repoRoot, result.destination)}.`
);
