import fs from 'node:fs';
import path from 'node:path';

import { collectDocumentationFacts, renderDocumentationFacts } from './documentation-facts.mjs';
import { repoRoot } from './shared.mjs';

const facts = collectDocumentationFacts(repoRoot);
const destination = path.join(repoRoot, facts.policy.generatedDocument);
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, renderDocumentationFacts(repoRoot));
process.stdout.write(`Generated ${facts.policy.generatedDocument}\n`);
