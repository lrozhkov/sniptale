import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  generateDocsMoveManifest,
  validateDocsMoveManifest,
  writeDocsMoveManifest,
} from './docs-move-manifest.mjs';

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const mappingPath = option('--mapping');
const outputPath = option('--output');
const tree = option('--tree');
const validatePath = option('--validate');

if (validatePath) {
  const manifest = JSON.parse(readFileSync(resolve(validatePath), 'utf8'));
  const errors = validateDocsMoveManifest(process.cwd(), manifest);
  if (errors.length > 0) {
    process.stderr.write(`${errors.join('\n')}\n`);
    process.exit(1);
  }
  process.stdout.write('Docs move manifest: OK\n');
} else if (mappingPath && outputPath && tree) {
  const mapping = JSON.parse(readFileSync(resolve(mappingPath), 'utf8'));
  const manifest = generateDocsMoveManifest({ mapping, tree });
  writeDocsMoveManifest(resolve(outputPath), manifest);
  process.stdout.write(`${outputPath}\n`);
} else {
  process.stderr.write(
    'Usage: --tree <commit> --mapping <file> --output <file> | --validate <file>\n'
  );
  process.exit(2);
}
