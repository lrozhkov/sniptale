function addEdge(graph, [from, to]) {
  graph.set(from, new Set([...(graph.get(from) ?? []), to]));
  if (!graph.has(to)) graph.set(to, new Set());
}

function popComponent(node, stack, records) {
  const component = [];
  let current = null;
  do {
    current = stack.pop();
    records.get(current).onStack = false;
    component.push(current);
  } while (current !== node);
  return component.length > 1 ? component.sort() : null;
}

function visitNode(node, context) {
  const record = { index: context.index, lowlink: context.index, onStack: true };
  context.index += 1;
  context.records.set(node, record);
  context.stack.push(node);

  for (const next of context.graph.get(node) ?? []) {
    if (!context.records.has(next)) {
      visitNode(next, context);
      record.lowlink = Math.min(record.lowlink, context.records.get(next).lowlink);
    } else if (context.records.get(next).onStack) {
      record.lowlink = Math.min(record.lowlink, context.records.get(next).index);
    }
  }

  if (record.lowlink === record.index) {
    const component = popComponent(node, context.stack, context.records);
    if (component) context.result.push(component);
  }
}

export function collectStronglyConnectedComponents(edges) {
  const graph = new Map();
  for (const edge of edges) addEdge(graph, edge);
  const context = { graph, index: 0, records: new Map(), result: [], stack: [] };
  for (const node of graph.keys()) {
    if (!context.records.has(node)) visitNode(node, context);
  }
  return context.result.sort((left, right) => left.join('\0').localeCompare(right.join('\0')));
}
