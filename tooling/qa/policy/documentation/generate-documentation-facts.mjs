import fs from 'node:fs';
import path from 'node:path';

import {
  collectDocumentationFacts,
  renderDocumentationFacts,
} from './documentation-facts/check.mjs';
import { repoRoot } from '../../analysis/repository/shared-paths.mjs';

const facts = collectDocumentationFacts(repoRoot);
const destination = path.join(repoRoot, facts.policy.generatedDocument);
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, renderDocumentationFacts(repoRoot));
process.stdout.write(`Generated ${facts.policy.generatedDocument}\n`);
