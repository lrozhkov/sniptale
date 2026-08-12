import { removeAgentTooling } from './agent-tooling.mjs';

const args = new Set(process.argv.slice(2));
const unsupported = [...args].filter((argument) => argument !== '--force');
if (unsupported.length > 0) throw new Error(`Unsupported argument: ${unsupported[0]}`);

const files = removeAgentTooling({ force: args.has('--force') });
console.log(`Removed optional agent tooling (${files.length} kit-owned paths).`);
