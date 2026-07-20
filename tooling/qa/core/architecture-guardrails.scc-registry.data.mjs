import fs from 'node:fs';

const registryUrl = new URL('./architecture-guardrails.scc-registry.data.json', import.meta.url);

export const SECOND_LEVEL_SCC_REGISTRY = JSON.parse(fs.readFileSync(registryUrl, 'utf8'));
