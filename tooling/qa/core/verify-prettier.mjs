/**
 * Deterministic Prettier gate for staged or repo-wide files.
 */

import fs from 'node:fs/promises';
import prettier from 'prettier';

import {
  collectFormattableFiles,
  collectStagedFiles,
  fromRelativePath,
  isExecutedAsScript,
  isFormattableFile,
  resolveExplicitOrStagedFiles,
} from './shared.mjs';

async function collectPrettierResult(candidateFiles, handleFormattedFile) {
  const uniqueFiles = [...new Set(candidateFiles.filter(isFormattableFile))];
  const changedFiles = [];

  for (const file of uniqueFiles) {
    const absolutePath = fromRelativePath(file);
    const fileInfo = await prettier.getFileInfo(absolutePath, {
      ignorePath: fromRelativePath('.prettierignore'),
    });
    if (fileInfo.ignored || fileInfo.inferredParser == null) {
      continue;
    }

    const source = await fs.readFile(absolutePath, 'utf8');
    const config = (await prettier.resolveConfig(absolutePath)) ?? {};
    const formatted = await prettier.format(source, {
      ...config,
      filepath: absolutePath,
    });

    if (formatted !== source) {
      await handleFormattedFile({ file, absolutePath, formatted });
      changedFiles.push(file);
    }
  }

  return {
    checkedFiles: uniqueFiles,
    changedFiles,
  };
}

export async function runPrettierCheck(candidateFiles) {
  const { checkedFiles, changedFiles } = await collectPrettierResult(candidateFiles, () => {});
  return {
    checkedFiles,
    failures: changedFiles,
  };
}

export async function runPrettierWrite(candidateFiles) {
  const { checkedFiles, changedFiles } = await collectPrettierResult(
    candidateFiles,
    async ({ absolutePath, formatted }) => {
      await fs.writeFile(absolutePath, formatted);
    }
  );

  return {
    checkedFiles,
    writtenFiles: changedFiles,
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const argv = process.argv.slice(2);
  const { files } = resolveExplicitOrStagedFiles(argv, {
    collectDefaultFiles: collectFormattableFiles,
    collectStagedFiles,
  });

  const { checkedFiles, failures } = await runPrettierCheck(files);

  if (checkedFiles.length === 0) {
    process.stdout.write('Prettier skipped: no matching files\n');
    process.exit(0);
  }

  if (failures.length > 0) {
    process.stderr.write('Prettier formatting violations found:\n\n');
    for (const file of failures) {
      process.stderr.write(`- ${file}\n`);
    }
    process.exit(1);
  }

  process.stdout.write('Prettier passed\n');
}
