import { packAgentTooling } from './agent-tooling.mjs';

const result = await packAgentTooling();
console.log(
  `Packed optional agent tooling (${result.files.length} files) into ${result.archivePath}.`
);
