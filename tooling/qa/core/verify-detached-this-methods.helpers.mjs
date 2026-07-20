import ts from 'typescript';

import { DETACHED_THIS_METHOD_RULE } from './verify-detached-this-methods.data.mjs';

function getNameText(name) {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : null;
}

function hasThisExpression(node) {
  let found = false;
  const visit = (child) => {
    if (found) {
      return;
    }
    if (child.kind === ts.SyntaxKind.ThisKeyword) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };

  visit(node);
  return found;
}

function addMethod(target, ownerName, methodName) {
  const methods = target.get(ownerName) ?? new Set();
  methods.add(methodName);
  target.set(ownerName, methods);
}

function maybeAddClassMethod(index, className, member) {
  if (!ts.isMethodDeclaration(member) || !member.body) {
    return;
  }
  const methodName = getNameText(member.name);
  if (methodName && hasThisExpression(member.body)) {
    addMethod(index.classMethods, className, methodName);
  }
}

function maybeAddPrototypeMethod(index, node) {
  if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) {
    return;
  }
  if (!ts.isFunctionExpression(node.right) || !hasThisExpression(node.right)) {
    return;
  }
  if (!ts.isPropertyAccessExpression(node.left)) {
    return;
  }

  const methodName = node.left.name.text;
  const prototype = node.left.expression;
  if (!ts.isPropertyAccessExpression(prototype) || prototype.name.text !== 'prototype') {
    return;
  }
  if (ts.isIdentifier(prototype.expression)) {
    addMethod(index.classMethods, prototype.expression.text, methodName);
  }
}

function maybeCollectClass(index, node) {
  if (!ts.isClassDeclaration(node) || !node.name) {
    return;
  }
  for (const member of node.members) {
    maybeAddClassMethod(index, node.name.text, member);
  }
}

export function collectThisMethodIndex(sourceFiles) {
  const index = { classMethods: new Map() };

  const visit = (node) => {
    maybeCollectClass(index, node);
    maybeAddPrototypeMethod(index, node);
    ts.forEachChild(node, visit);
  };

  for (const sourceFile of sourceFiles) {
    visit(sourceFile);
  }

  return index;
}

function collectObjectLiteralMethods(objectLiteral) {
  const methods = new Set();
  for (const property of objectLiteral.properties) {
    if (ts.isMethodDeclaration(property) && property.body) {
      const methodName = getNameText(property.name);
      if (methodName && hasThisExpression(property.body)) {
        methods.add(methodName);
      }
    }
    if (
      ts.isPropertyAssignment(property) &&
      ts.isFunctionExpression(property.initializer) &&
      hasThisExpression(property.initializer)
    ) {
      const methodName = getNameText(property.name);
      if (methodName) {
        methods.add(methodName);
      }
    }
  }
  return methods;
}

function collectTypeTokens(text) {
  return new Set(text.split(/[^A-Za-z0-9_$]+/u).filter(Boolean));
}

function findClassNameInType(sourceFile, typeNode, index) {
  const text = typeNode?.getText(sourceFile) ?? '';
  const tokens = collectTypeTokens(text);
  for (const className of index.classMethods.keys()) {
    if (tokens.has(className)) {
      return className;
    }
  }
  return null;
}

function addTypedIdentifier(sourceFile, declaration, state, index) {
  if (!ts.isIdentifier(declaration.name)) {
    return;
  }
  const className = findClassNameInType(sourceFile, declaration.type, index);
  if (className) {
    state.identifierClasses.set(declaration.name.text, className);
  }
}

function addInitializedIdentifier(declaration, state, index) {
  if (!ts.isVariableDeclaration(declaration) || !ts.isIdentifier(declaration.name)) {
    return;
  }
  const initializer = declaration.initializer;
  if (!initializer) {
    return;
  }
  if (ts.isNewExpression(initializer) && ts.isIdentifier(initializer.expression)) {
    const className = initializer.expression.text;
    if (index.classMethods.has(className)) {
      state.identifierClasses.set(declaration.name.text, className);
    }
    return;
  }
  if (ts.isObjectLiteralExpression(initializer)) {
    const methods = collectObjectLiteralMethods(initializer);
    if (methods.size > 0) {
      state.objectMethods.set(declaration.name.text, methods);
    }
  }
}

function collectSourceState(sourceFile, index) {
  const state = {
    identifierClasses: new Map(),
    objectMethods: new Map(),
  };

  const visit = (node) => {
    if (ts.isParameter(node) || ts.isVariableDeclaration(node)) {
      addTypedIdentifier(sourceFile, node, state, index);
    }
    addInitializedIdentifier(node, state, index);
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return state;
}

function isDirectInvocation(node) {
  return ts.isCallExpression(node.parent) && node.parent.expression === node;
}

function isExplicitBind(node) {
  if (!ts.isPropertyAccessExpression(node.parent) || node.parent.expression !== node) {
    return false;
  }
  return (
    node.parent.name.text === 'bind' &&
    ts.isCallExpression(node.parent.parent) &&
    node.parent.parent.expression === node.parent
  );
}

function isMethodReference(node) {
  return (
    !isDirectInvocation(node) &&
    !isExplicitBind(node) &&
    !ts.isPropertyAccessExpression(node.parent)
  );
}

function resolveIdentifierReceiver(receiver, methodName, state, index) {
  if (state.objectMethods.get(receiver.text)?.has(methodName)) {
    return { ownerName: receiver.text, ownerType: 'object-literal' };
  }

  const className = state.identifierClasses.get(receiver.text);
  if (className && index.classMethods.get(className)?.has(methodName)) {
    return { ownerName: className, ownerType: 'class' };
  }

  return null;
}

function resolveThisReceiver(methodName, currentClassName, index) {
  if (currentClassName && index.classMethods.get(currentClassName)?.has(methodName)) {
    return { ownerName: currentClassName, ownerType: 'class' };
  }
  return null;
}

function resolveReceiver(receiver, methodName, currentClassName, state, index) {
  if (ts.isIdentifier(receiver)) {
    return resolveIdentifierReceiver(receiver, methodName, state, index);
  }
  if (receiver.kind === ts.SyntaxKind.ThisKeyword) {
    return resolveThisReceiver(methodName, currentClassName, index);
  }
  return null;
}

export function collectDetachedThisMethodReferences({
  getNodeLine,
  relativePath,
  sourceFile,
  index,
}) {
  const state = collectSourceState(sourceFile, index);
  const violations = [];

  const visit = (node, currentClassName = null) => {
    const nextClassName =
      ts.isClassDeclaration(node) && node.name ? node.name.text : currentClassName;

    if (ts.isPropertyAccessExpression(node) && isMethodReference(node)) {
      const resolution = resolveReceiver(
        node.expression,
        node.name.text,
        nextClassName,
        state,
        index
      );
      if (resolution) {
        violations.push({
          rule: DETACHED_THIS_METHOD_RULE,
          file: relativePath,
          line: getNodeLine(sourceFile, node),
          message: [
            `Method "${resolution.ownerName}.${node.name.text}" uses this and crosses a callback boundary.`,
            'Wrap it in a closure or bind it explicitly before passing it as a first-class value.',
          ].join(' '),
        });
      }
    }

    ts.forEachChild(node, (child) => visit(child, nextClassName));
  };

  visit(sourceFile);
  return violations;
}
