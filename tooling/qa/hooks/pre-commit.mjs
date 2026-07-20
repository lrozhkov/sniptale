import { isExecutedAsScript, runCommand } from '../core/shared.mjs';

if (isExecutedAsScript(import.meta.url)) {
  const result = runCommand(process.execPath, ['tooling/qa/core/verify-task-artifacts.mjs'], {
    stdio: 'inherit',
  });
  process.exit(result.status ?? 1);
}
