import { parseAgentToolingCliOptions, removeAgentTooling } from './agent-tooling.mjs';

const files = removeAgentTooling(parseAgentToolingCliOptions(process.argv.slice(2)));
console.log(`Removed optional agent tooling (${files.length} kit-owned paths).`);
