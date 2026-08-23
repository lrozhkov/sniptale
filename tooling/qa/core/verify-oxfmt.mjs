/**
 * Deterministic Oxfmt gate for staged, explicit, or repo-wide files.
 */

import fs from 'node:fs';

import {
  collectFormattableFiles,
  collectStagedFiles,
  fromRelativePath,
  isExecutedAsScript,
  isFormattableFile,
  resolveExplicitOrStagedFiles,
  runRepoNodeEntry,
  toRelativePath,
} from './shared.mjs';

const OXFMT_ENTRY = 'node_modules/oxfmt/bin/oxfmt';
const FORMATTER_MIGRATION_PATH = 'tooling/configs/qa/formatter-migration.data.json';
const MAX_ARGUMENT_CHARACTERS = 6_000;
const MAX_FILES_PER_INVOCATION = 100;
const OPERATIONAL_ARGS = [
  '--config=.oxfmtrc.json',
  '--ignore-path=.oxfmtignore',
  '--disable-nested-config',
];

function assertFormatterMigrationAuthority() {
  const evidence = JSON.parse(fs.readFileSync(fromRelativePath(FORMATTER_MIGRATION_PATH), 'utf8'));
  const installedVersion = JSON.parse(
    fs.readFileSync(fromRelativePath('node_modules/oxfmt/package.json'), 'utf8')
  ).version;
  if (
    evidence.schemaVersion !== 1 ||
    evidence.targetFormatter !== `oxfmt@${installedVersion}` ||
    evidence.canonicalAuthority !== '.oxfmtrc.json'
  ) {
    throw new Error('Formatter migration authority drifted from the installed Oxfmt toolchain.');
  }
}

function chunkFiles(files) {
  const chunks = [];
  let current = [];
  let characterCount = 0;

  for (const file of files) {
    const nextCharacterCount = characterCount + file.length + 1;
    if (
      current.length > 0 &&
      (current.length >= MAX_FILES_PER_INVOCATION || nextCharacterCount > MAX_ARGUMENT_CHARACTERS)
    ) {
      chunks.push(current);
      current = [];
      characterCount = 0;
    }
    current.push(file);
    characterCount += file.length + 1;
  }

  if (current.length > 0) {
    chunks.push(current);
  }
  return chunks;
}

function parseDifferentFiles(stdout) {
  return stdout
    .split(/\r?\n/u)
    .map((file) => file.trim())
    .filter(Boolean)
    .map(toRelativePath);
}

function runOxfmt(args, commandRunner) {
  const result = commandRunner(OXFMT_ENTRY, [...OPERATIONAL_ARGS, ...args], { stdio: 'pipe' });
  if (result.status != null && result.status <= 1) {
    return result;
  }

  throw new Error(result.stderr || result.stdout || 'Oxfmt failed without diagnostics');
}

function collectOxfmtResult(candidateFiles, commandRunner, { repositoryWide = false } = {}) {
  const checkedFiles = [...new Set(candidateFiles.filter(isFormattableFile))].sort();
  const changedFiles = [];

  if (repositoryWide) {
    const result = runOxfmt(['--list-different', '.'], commandRunner);
    return {
      checkedFiles,
      changedFiles: [...new Set(parseDifferentFiles(result.stdout))].sort(),
    };
  }

  for (const files of chunkFiles(checkedFiles)) {
    const result = runOxfmt(['--list-different', ...files], commandRunner);
    changedFiles.push(...parseDifferentFiles(result.stdout));
  }

  return {
    checkedFiles,
    changedFiles: [...new Set(changedFiles)].sort(),
  };
}

export function runFormatterCheck(candidateFiles, commandRunner = runRepoNodeEntry, options = {}) {
  assertFormatterMigrationAuthority();
  const { checkedFiles, changedFiles } = collectOxfmtResult(candidateFiles, commandRunner, options);
  return {
    checkedFiles,
    failures: changedFiles,
  };
}

export function runFormatterWrite(candidateFiles, commandRunner = runRepoNodeEntry, options = {}) {
  assertFormatterMigrationAuthority();
  const { checkedFiles, changedFiles } = collectOxfmtResult(candidateFiles, commandRunner, options);
  for (const files of chunkFiles(changedFiles)) {
    const result = runOxfmt(['--write', ...files], commandRunner);
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || 'Oxfmt write failed without diagnostics');
    }
  }

  return {
    checkedFiles,
    writtenFiles: changedFiles,
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const argv = process.argv.slice(2);
  const { explicitFiles, files, useStagedFiles } = resolveExplicitOrStagedFiles(argv, {
    collectDefaultFiles: collectFormattableFiles,
    collectStagedFiles,
  });

  const repositoryWide = explicitFiles.length === 0 && !useStagedFiles;
  if (argv.includes('--write')) {
    const { checkedFiles, writtenFiles } = runFormatterWrite(files, runRepoNodeEntry, {
      repositoryWide,
    });
    process.stdout.write(
      checkedFiles.length === 0
        ? 'Oxfmt skipped: no matching files\n'
        : `Oxfmt wrote ${writtenFiles.length} file(s)\n`
    );
    process.exit(0);
  }

  const { checkedFiles, failures } = runFormatterCheck(files, runRepoNodeEntry, {
    repositoryWide,
  });

  if (checkedFiles.length === 0) {
    process.stdout.write('Oxfmt skipped: no matching files\n');
    process.exit(0);
  }

  if (failures.length > 0) {
    process.stderr.write('Oxfmt formatting violations found:\n\n');
    for (const file of failures) {
      process.stderr.write(`- ${file}\n`);
    }
    process.exit(1);
  }

  process.stdout.write('Oxfmt passed\n');
}
