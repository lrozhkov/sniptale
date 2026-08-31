import { isWhitespace, readIdentifierAt } from './artifact-security-source-text.mjs';

function stripWhitespaceWithMap(text, start, end) {
  const chars = [];
  const map = [];
  for (let index = start; index < end; index += 1) {
    if (isWhitespace(text[index] ?? '')) {
      continue;
    }

    chars.push(text[index]);
    map.push(index);
  }

  return { map, text: chars.join('') };
}

function hasZodJitlessMarker(text) {
  const stripped = stripWhitespaceWithMap(text, 0, text.length).text;

  return stripped.includes('jitless:true') || stripped.includes('jitless:!0');
}

function hasAllowedDirectZodProbe(text, matchIndex) {
  const start = Math.max(0, matchIndex - 40);
  const end = Math.min(text.length, matchIndex + 80);
  const snippet = stripWhitespaceWithMap(text, start, end);

  for (const pattern of [
    'try{returnFunction(``),!0}catch',
    'try{returnFunction(""),!0}catch',
    "try{returnFunction(''),!0}catch",
  ]) {
    const patternIndex = snippet.text.indexOf(pattern);
    if (patternIndex === -1) {
      continue;
    }

    const callIndex = patternIndex + pattern.indexOf('Function');
    if (snippet.map[callIndex] === matchIndex) {
      return true;
    }
  }

  return false;
}

function isAllowedNewProbeCall(snippet, cursor, alias, argument, matchIndex) {
  for (const suffix of ['returntrue}catch', 'returntrue;}catch']) {
    const call = `new${alias}(${argument});${suffix}`;
    if (
      snippet.text.startsWith(call, cursor) &&
      snippet.map[cursor + 'new'.length] === matchIndex
    ) {
      return true;
    }
  }

  for (const suffix of ['return!0}catch', 'return!0;}catch']) {
    const call = `new${alias}(${argument});${suffix}`;
    if (
      snippet.text.startsWith(call, cursor) &&
      snippet.map[cursor + 'new'.length] === matchIndex
    ) {
      return true;
    }
  }

  return false;
}

function isAllowedReturnProbeCall(snippet, cursor, alias, argument, matchIndex) {
  for (const suffix of [',!0}catch', ',!0;}catch']) {
    const call = `returnnew${alias}(${argument})${suffix}`;
    if (
      snippet.text.startsWith(call, cursor) &&
      snippet.map[cursor + 'returnnew'.length] === matchIndex
    ) {
      return true;
    }
  }

  return false;
}

function hasAllowedAliasedZodProbe(text, matchIndex) {
  const start = Math.max(0, matchIndex - 80);
  const end = Math.min(text.length, matchIndex + 120);
  const snippet = stripWhitespaceWithMap(text, start, end);

  for (const declarationKind of ['const', 'let', 'var']) {
    const declarationStart = snippet.text.indexOf(`try{${declarationKind}`);
    if (declarationStart === -1) {
      continue;
    }

    const aliasStart = declarationStart + `try{${declarationKind}`.length;
    const alias = readIdentifierAt(snippet.text, aliasStart);
    if (!alias) {
      continue;
    }

    let cursor = alias.end;
    if (snippet.text.slice(cursor, cursor + '=Function'.length) !== '=Function') {
      continue;
    }
    cursor += '=Function'.length;
    if (snippet.text[cursor] === ';') {
      cursor += 1;
    }

    for (const argument of ['``', '""', "''"]) {
      if (
        isAllowedNewProbeCall(snippet, cursor, alias.value, argument, matchIndex) ||
        isAllowedReturnProbeCall(snippet, cursor, alias.value, argument, matchIndex)
      ) {
        return true;
      }
    }
  }

  return false;
}

function hasAllowedSourceZodCompiler(snippet, matchIndex, alias) {
  const compileIndex = snippet.text.indexOf('compile(){');
  const aliasDeclaration = `const${alias}=Function;`;
  const aliasIndex = snippet.text.indexOf(aliasDeclaration, compileIndex);
  const argsIndex = snippet.text.indexOf(
    'constargs=this?.args;',
    aliasIndex + aliasDeclaration.length
  );
  const contentIndex = snippet.text.indexOf('constcontent=this?.content??[``];', argsIndex);
  const linesIndex = snippet.text.indexOf('constlines=[...content.map(', contentIndex);
  const returnIndex = snippet.text.indexOf(`returnnew${alias}(...args,lines.join(`, linesIndex);

  return (
    compileIndex >= 0 &&
    aliasIndex > compileIndex &&
    argsIndex > aliasIndex &&
    contentIndex > argsIndex &&
    linesIndex > contentIndex &&
    returnIndex > linesIndex &&
    snippet.map[returnIndex + 'returnnew'.length] === matchIndex
  );
}

function hasAllowedBundledZodCompiler(snippet, matchIndex, alias) {
  const compileIndex = snippet.text.indexOf('compile(){');
  const aliasDeclaration = `let${alias}=Function,`;
  const aliasIndex = snippet.text.indexOf(aliasDeclaration, compileIndex);
  if (!(compileIndex >= 0 && aliasIndex > compileIndex)) {
    return false;
  }

  const args = readIdentifierAt(snippet.text, aliasIndex + aliasDeclaration.length);
  const argsAssignment = '=this?.args,';
  if (!args || snippet.text.slice(args.end, args.end + argsAssignment.length) !== argsAssignment) {
    return false;
  }

  const linesIndex = args.end + argsAssignment.length;
  const lines = readIdentifierAt(snippet.text, linesIndex);
  if (!lines) {
    return false;
  }

  const linesAssignment = snippet.text.slice(lines.end);
  const hasContentMappedLines =
    linesAssignment.startsWith('=[...(this?.content??[""]).map(') ||
    linesAssignment.startsWith('=[...(this?.content??[``]).map(');
  const returnCall = `returnnew${alias}(...${args.value},${lines.value}.join(`;
  const returnIndex = snippet.text.indexOf(returnCall, lines.end);

  return (
    hasContentMappedLines &&
    returnIndex > lines.end &&
    snippet.map[returnIndex + 'returnnew'.length] === matchIndex
  );
}

function hasAllowedZodCompiler(text, matchIndex, alias) {
  const start = Math.max(0, matchIndex - 180);
  const end = Math.min(text.length, matchIndex + 260);
  const snippet = stripWhitespaceWithMap(text, start, end);

  return (
    hasAllowedSourceZodCompiler(snippet, matchIndex, alias) ||
    hasAllowedBundledZodCompiler(snippet, matchIndex, alias)
  );
}

export function isAllowedZodFunctionConstructor(text, matchIndex, { alias } = {}) {
  return (
    hasZodJitlessMarker(text) &&
    (hasAllowedDirectZodProbe(text, matchIndex) ||
      hasAllowedAliasedZodProbe(text, matchIndex) ||
      (alias ? hasAllowedZodCompiler(text, matchIndex, alias) : false))
  );
}
