import path from 'node:path';
import { pathToFileURL } from 'node:url';

function optionKey(option) {
  return (
    option.key ??
    option.name.replace(/^-+/u, '').replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())
  );
}

function optionDisplay(option) {
  const names = [option.name, ...(option.aliases ?? [])].join(', ');
  if (option.kind === 'value') return `${names} <value>`;
  if (option.kind === 'many') return `${names} <value...>`;
  return names;
}

export function formatCommandHelp({ command, description = '', options = [], usage = '' }) {
  const lines = [`Usage: ${usage || command}`];
  if (description) lines.push('', description);
  const visibleOptions = [
    ...options,
    { name: '--help', aliases: ['-h'], kind: 'flag', description: 'Show this help.' },
  ];
  if (visibleOptions.length > 0) {
    lines.push('', 'Options:');
    const labels = visibleOptions.map(optionDisplay);
    const width = Math.max(...labels.map((label) => label.length));
    visibleOptions.forEach((option, index) => {
      lines.push(`  ${labels[index].padEnd(width)}  ${option.description ?? ''}`.trimEnd());
    });
  }
  return `${lines.join('\n')}\n`;
}

function buildOptionLookup(options) {
  const lookup = new Map();
  for (const option of options) {
    if (!option.name?.startsWith('-')) throw new Error('CLI option names must start with "-"');
    for (const name of [option.name, ...(option.aliases ?? [])]) {
      if (lookup.has(name)) throw new Error(`Duplicate CLI option definition: ${name}`);
      lookup.set(name, option);
    }
  }
  return lookup;
}

function splitDirectValue(argument) {
  if (!argument.startsWith('--')) return { name: argument, value: null };
  const separator = argument.indexOf('=');
  if (separator === -1) return { name: argument, value: null };
  return { name: argument.slice(0, separator), value: argument.slice(separator + 1) };
}

function safeArgumentLabel(argument) {
  if (!argument.startsWith('-')) return '<positional>';
  return argument.split('=', 1)[0];
}

function consumeOption({ argv, cursor, option, direct, contract, help, values, seen }) {
  const key = optionKey(option);
  if (seen.has(key) && !option.repeatable) {
    throw new Error(`Duplicate option for ${contract.command}: ${direct.name}\n${help}`);
  }
  seen.add(key);
  if (option.kind === 'flag') {
    if (direct.value !== null) {
      throw new Error(`Option ${direct.name} does not accept a value\n${help}`);
    }
    values[key] = true;
    return cursor;
  }

  const collected = direct.value === null ? [] : [direct.value];
  if (option.kind === 'value') {
    if (collected.length > 0) {
      values[key] = collected[0];
      return cursor;
    }
    const valueCursor = cursor + 1;
    if (valueCursor >= argv.length || argv[valueCursor].startsWith('-')) {
      throw new Error(`Missing value for ${direct.name}\n${help}`);
    }
    values[key] = argv[valueCursor];
    return valueCursor;
  }
  if (option.kind !== 'many') throw new Error(`Unsupported CLI option kind for ${option.name}`);
  while (cursor + 1 < argv.length && !argv[cursor + 1].startsWith('-')) {
    cursor += 1;
    collected.push(argv[cursor]);
  }
  if (collected.length === 0) throw new Error(`Missing value for ${direct.name}\n${help}`);
  values[key] = option.repeatable ? [...(values[key] ?? []), ...collected] : collected;
  return cursor;
}

/** Parse one wrapper command against an explicit schema and reject every undeclared token. */
export function parseStrictArguments(argv = [], contract) {
  const help = formatCommandHelp(contract);
  const helpOption = {
    name: '--help',
    aliases: ['-h'],
    kind: 'flag',
    key: 'help',
  };
  const options = [...(contract.options ?? []), helpOption];
  const lookup = buildOptionLookup(options);
  const values = {};
  const seen = new Set();

  for (let cursor = 0; cursor < argv.length; cursor += 1) {
    const argument = argv[cursor];
    const direct = splitDirectValue(argument);
    const option = lookup.get(direct.name);
    if (!option) {
      throw new Error(
        `Unknown argument for ${contract.command}: ${safeArgumentLabel(argument)}\n${help}`
      );
    }

    cursor = consumeOption({ argv, cursor, option, direct, contract, help, values, seen });
  }

  for (const option of contract.options ?? []) {
    if (option.required && values[optionKey(option)] == null) {
      throw new Error(`Missing required option ${option.name}\n${help}`);
    }
  }

  return { help, values };
}

export function parseFilesArgument(argv) {
  const index = argv.indexOf('--files');
  if (index === -1) {
    return [];
  }

  const files = [];
  for (let cursor = index + 1; cursor < argv.length; cursor += 1) {
    const value = argv[cursor];
    if (!value || value.startsWith('--')) {
      break;
    }
    files.push(value);
  }
  return files;
}

export function getOptionValue(argv, optionName) {
  const directPrefix = `${optionName}=`;
  const directMatch = argv.find((argument) => argument.startsWith(directPrefix));
  if (directMatch) {
    return directMatch.slice(directPrefix.length);
  }

  const index = argv.indexOf(optionName);
  if (index === -1 || index === argv.length - 1) {
    return null;
  }
  return argv[index + 1];
}

export function isExecutedAsScript(importMetaUrl) {
  if (!process.argv[1]) {
    return false;
  }

  return importMetaUrl === pathToFileURL(path.resolve(process.argv[1])).href;
}

export function printViolations(header, violations) {
  process.stderr.write(`${header}\n\n`);
  for (const violation of violations) {
    const lineLabel = violation.line != null ? `:${violation.line}` : '';
    process.stderr.write(`- ${violation.file}${lineLabel} ${violation.message}\n`);
  }
}

export function resolveExplicitOrStagedFiles(
  argv,
  { collectDefaultFiles, collectStagedFiles } = {}
) {
  const explicitFiles = parseFilesArgument(argv);
  const useStagedFiles = argv.includes('--staged') && explicitFiles.length === 0;

  if (explicitFiles.length > 0) {
    return {
      explicitFiles,
      files: explicitFiles,
      useStagedFiles,
    };
  }

  if (useStagedFiles) {
    return {
      explicitFiles,
      files: collectStagedFiles(),
      useStagedFiles,
    };
  }

  return {
    explicitFiles,
    files: collectDefaultFiles(),
    useStagedFiles,
  };
}

export function emitCommandResult(result, successMessage) {
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  process.stdout.write(successMessage);
}
