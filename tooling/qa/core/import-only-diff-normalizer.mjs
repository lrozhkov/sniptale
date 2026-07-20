export function normalizeModuleSpecifierExpressions(sourceText) {
  return sourceText
    .replace(/\bimport\s*\(\s*(['"])[^'"]+\1\s*\)/gu, "import('')")
    .replace(/\b(vi\.(?:doMock|doUnmock|mock|unmock))\s*\(\s*(['"])[^'"]+\2/gu, "$1(''");
}
