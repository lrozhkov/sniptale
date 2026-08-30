export function matchesWordBoundaryPrefix(value, prefixes) {
  return prefixes.some((prefix) => {
    if (!value.startsWith(prefix)) {
      return false;
    }

    const nextCharacter = value.slice(prefix.length, prefix.length + 1);
    return (
      nextCharacter === '' || nextCharacter === nextCharacter.toUpperCase() || nextCharacter === '_'
    );
  });
}
