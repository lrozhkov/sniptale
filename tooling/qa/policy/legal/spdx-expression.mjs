function tokenize(expression) {
  if (typeof expression !== 'string' || !expression.trim()) return null;
  const tokens = expression.match(/[A-Za-z0-9.+-]+|[()]/gu);
  if (!tokens || tokens.join('') !== expression.replace(/\s+/gu, '')) return null;
  return tokens;
}

function parser(tokens) {
  let index = 0;
  const peek = () => tokens[index] ?? null;
  const take = () => tokens[index++] ?? null;
  const primary = () => {
    if (peek() === '(') {
      take();
      const node = orExpression();
      return take() === ')' ? node : null;
    }
    const id = take();
    return id && !['AND', 'OR', 'WITH', ')'].includes(id) ? { type: 'license', id } : null;
  };
  const withExpression = () => {
    const license = primary();
    if (!license || peek() !== 'WITH') return license;
    take();
    const exception = take();
    return exception && !['AND', 'OR', 'WITH', ')', '('].includes(exception)
      ? { type: 'with', license, exception }
      : null;
  };
  const andExpression = () => {
    let node = withExpression();
    while (node && peek() === 'AND') {
      take();
      const right = withExpression();
      node = right ? { type: 'and', left: node, right } : null;
    }
    return node;
  };
  const orExpression = () => {
    let node = andExpression();
    while (node && peek() === 'OR') {
      take();
      const right = andExpression();
      node = right ? { type: 'or', left: node, right } : null;
    }
    return node;
  };
  const tree = orExpression();
  return tree && index === tokens.length ? tree : null;
}

function allowed(node, denied) {
  if (node.type === 'license') return !denied.has(node.id);
  if (node.type === 'with') return allowed(node.license, denied);
  if (node.type === 'and') return allowed(node.left, denied) && allowed(node.right, denied);
  return allowed(node.left, denied) || allowed(node.right, denied);
}

function deniedTerms(node, denied) {
  if (node.type === 'license') return denied.has(node.id) ? [node.id] : [];
  if (node.type === 'with') return deniedTerms(node.license, denied);
  return [...deniedTerms(node.left, denied), ...deniedTerms(node.right, denied)];
}

/** Parse SPDX boolean operators fully; invalid expressions fail closed instead of accepting a token prefix. */
export function evaluateSpdxExpression(expression, deniedLicenses) {
  const tokens = tokenize(expression);
  const tree = tokens && parser(tokens);
  if (!tree) return null;
  const denied = new Set(deniedLicenses);
  return {
    allowed: allowed(tree, denied),
    deniedLicenses: [...new Set(deniedTerms(tree, denied))].sort(),
  };
}
