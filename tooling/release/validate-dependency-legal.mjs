import { pathToFileURL } from 'node:url';

import { validateDependencyLegalClosure } from './dependency-legal/validation.mjs';

function rootFromArguments(arguments_) {
  const rootIndex = arguments_.indexOf('--root');
  return rootIndex >= 0 && arguments_[rootIndex + 1] ? arguments_[rootIndex + 1] : process.cwd();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = await validateDependencyLegalClosure(rootFromArguments(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify({ errors })}\n`);
}
