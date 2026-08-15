import { installAgentTooling, parseAgentToolingCliOptions } from './agent-tooling.mjs';

const files = installAgentTooling(parseAgentToolingCliOptions(process.argv.slice(2)));
console.log(`Installed optional agent tooling (${files.length} files).`);
