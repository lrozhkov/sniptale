function splitLines(text) {
  return text.split(/\r?\n/u);
}

function readBlobText(store, oid) {
  return store.lookupObject(oid).body.toString('utf8');
}

function commonPrefixLength(left, right) {
  let index = 0;
  while (index < left.length && index < right.length && left[index] === right[index]) {
    index += 1;
  }
  return index;
}

function commonSuffixLength(left, right, prefixLength) {
  let index = 0;
  while (
    index + prefixLength < left.length &&
    index + prefixLength < right.length &&
    left[left.length - 1 - index] === right[right.length - 1 - index]
  ) {
    index += 1;
  }
  return index;
}

export function collectChangedLineNumbers(beforeText, afterText) {
  const beforeLines = splitLines(beforeText);
  const afterLines = splitLines(afterText);
  const prefixLength = commonPrefixLength(beforeLines, afterLines);
  const suffixLength = commonSuffixLength(beforeLines, afterLines, prefixLength);
  const beforeMiddle = beforeLines.slice(prefixLength, beforeLines.length - suffixLength);
  const afterMiddle = afterLines.slice(prefixLength, afterLines.length - suffixLength);

  if (afterMiddle.length === 0) {
    return [];
  }

  if (beforeMiddle.length === 0) {
    return afterMiddle.map((_, index) => prefixLength + index + 1);
  }

  if (beforeMiddle.length * afterMiddle.length > 4_000_000) {
    return afterMiddle.map((_, index) => prefixLength + index + 1);
  }

  return collectChangedMiddleLineNumbers(beforeMiddle, afterMiddle, prefixLength);
}

function collectChangedMiddleLineNumbers(beforeMiddle, afterMiddle, prefixLength) {
  const matrix = buildLongestCommonSubsequenceMatrix(beforeMiddle, afterMiddle);
  const changedLines = new Set();
  let row = 0;
  let column = 0;

  while (row < beforeMiddle.length && column < afterMiddle.length) {
    if (beforeMiddle[row] === afterMiddle[column]) {
      row += 1;
      column += 1;
      continue;
    }

    if (matrix[row][column + 1] >= matrix[row + 1][column]) {
      changedLines.add(prefixLength + column + 1);
      column += 1;
      continue;
    }

    row += 1;
  }

  while (column < afterMiddle.length) {
    changedLines.add(prefixLength + column + 1);
    column += 1;
  }

  return [...changedLines].sort((left, right) => left - right);
}

function buildLongestCommonSubsequenceMatrix(beforeMiddle, afterMiddle) {
  const widths = afterMiddle.length + 1;
  const matrix = Array.from({ length: beforeMiddle.length + 1 }, () => new Uint32Array(widths));

  for (let row = beforeMiddle.length - 1; row >= 0; row -= 1) {
    for (let column = afterMiddle.length - 1; column >= 0; column -= 1) {
      matrix[row][column] =
        beforeMiddle[row] === afterMiddle[column]
          ? matrix[row + 1][column + 1] + 1
          : Math.max(matrix[row + 1][column], matrix[row][column + 1]);
    }
  }

  return matrix;
}

export function addChangedLines(target, filePath, lineNumbers) {
  if (lineNumbers.length === 0) {
    return;
  }

  const fileLines = target.get(filePath) ?? new Set();
  for (const lineNumber of lineNumbers) {
    fileLines.add(lineNumber);
  }
  target.set(filePath, fileLines);
}

export function collectChangedLinesFromStore(params) {
  const { changedLineMap, filePath, beforeOid, afterOid, store } = params;
  addChangedLines(
    changedLineMap,
    filePath,
    collectChangedLineNumbers(
      beforeOid ? readBlobText(store, beforeOid) : '',
      readBlobText(store, afterOid)
    )
  );
}

export function collectChangedLinesAgainstWorktree(params) {
  const { changedLineMap, filePath, entryOid, store, worktreeText } = params;
  addChangedLines(
    changedLineMap,
    filePath,
    collectChangedLineNumbers(readBlobText(store, entryOid), worktreeText)
  );
}
