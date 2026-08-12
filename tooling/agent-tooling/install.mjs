import { installAgentTooling } from './agent-tooling.mjs';

const args = new Set(process.argv.slice(2));
const unsupported = [...args].filter((argument) => argument !== '--force');
if (unsupported.length > 0) throw new Error(`Unsupported argument: ${unsupported[0]}`);

const files = installAgentTooling({ force: args.has('--force') });
console.log(`Installed optional agent tooling (${files.length} files).`);
