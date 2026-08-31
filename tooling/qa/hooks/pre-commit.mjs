import { isExecutedAsScript } from '../runtime/process/shared-cli.mjs';
import { runCommand } from '../runtime/process/shared-process.mjs';

if (isExecutedAsScript(import.meta.url)) {
  const result = runCommand(
    process.execPath,
    ['tooling/qa/composition/closeout/verify-task-artifacts.mjs'],
    {
      stdio: 'inherit',
    }
  );
  process.exit(result.status ?? 1);
}
