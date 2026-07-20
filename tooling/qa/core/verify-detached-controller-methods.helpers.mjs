import ts from 'typescript';

import {
  ADAPTER_CONTROLLER_TYPE_MARKERS,
  CONTROLLER_PROPERTY_NAME,
  RAW_CONTROLLER_TYPE_MARKERS,
} from './verify-detached-controller-methods.data.mjs';

function typeText(sourceFile, node) {
  return node?.getText(sourceFile).replace(/\s+/gu, '') ?? '';
}

function includesAnyMarker(text, markers) {
  return markers.some((marker) => text.includes(marker));
}

function isRawControllerType(sourceFile, typeNode) {
  const text = typeText(sourceFile, typeNode);
  return (
    includesAnyMarker(text, RAW_CONTROLLER_TYPE_MARKERS) &&
    !includesAnyMarker(text, ADAPTER_CONTROLLER_TYPE_MARKERS)
  );
}

function isAdapterControllerType(sourceFile, typeNode) {
  return includesAnyMarker(typeText(sourceFile, typeNode), ADAPTER_CONTROLLER_TYPE_MARKERS);
}

function getPropertyNameText(name) {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : null;
}

function collectControllerTypeNames(sourceFile) {
  const rawContainers = new Set();
  const adapterContainers = new Set();

  const visitMember = (typeName, member) => {
    if (!ts.isPropertySignature(member) || !member.type) {
      return;
    }
    if (getPropertyNameText(member.name) !== CONTROLLER_PROPERTY_NAME) {
      return;
    }
    if (isRawControllerType(sourceFile, member.type)) {
      rawContainers.add(typeName);
      return;
    }
    if (isAdapterControllerType(sourceFile, member.type)) {
      adapterContainers.add(typeName);
    }
  };

  const visit = (node) => {
    if (ts.isInterfaceDeclaration(node)) {
      for (const member of node.members) {
        visitMember(node.name.text, member);
      }
    }
    if (ts.isTypeAliasDeclaration(node) && ts.isTypeLiteralNode(node.type)) {
      for (const member of node.type.members) {
        visitMember(node.name.text, member);
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return { rawContainers, adapterContainers };
}

function classifyControllerContainerType(sourceFile, typeNode) {
  if (!typeNode || !ts.isTypeLiteralNode(typeNode)) {
    return null;
  }

  for (const member of typeNode.members) {
    if (
      ts.isPropertySignature(member) &&
      member.type &&
      getPropertyNameText(member.name) === CONTROLLER_PROPERTY_NAME
    ) {
      if (isRawControllerType(sourceFile, member.type)) {
        return 'raw';
      }
      if (isAdapterControllerType(sourceFile, member.type)) {
        return 'adapter';
      }
    }
  }

  return null;
}

function isUseEditorControllerCall(node) {
  return ts.isCallExpression(node) && node.expression.getText() === 'useEditorController';
}

function addIdentifierByType(sourceFile, node, state) {
  if (!ts.isIdentifier(node.name)) {
    return;
  }
  const containerKind = classifyControllerContainerType(sourceFile, node.type);
  if (containerKind === 'raw') {
    state.rawControllerContainerIdentifiers.add(node.name.text);
    return;
  }
  if (containerKind === 'adapter') {
    state.adapterControllerContainerIdentifiers.add(node.name.text);
    return;
  }
  if (node.type && isRawControllerType(sourceFile, node.type)) {
    state.rawControllerIdentifiers.add(node.name.text);
    return;
  }
  if (node.type && isAdapterControllerType(sourceFile, node.type)) {
    state.adapterControllerIdentifiers.add(node.name.text);
    return;
  }

  const declaredType = typeText(sourceFile, node.type);
  if (state.rawContainerTypeNames.has(declaredType)) {
    state.rawControllerContainerIdentifiers.add(node.name.text);
    return;
  }
  if (state.adapterContainerTypeNames.has(declaredType)) {
    state.adapterControllerContainerIdentifiers.add(node.name.text);
  }
}

export function collectControllerIdentifierState(sourceFile) {
  const { rawContainers, adapterContainers } = collectControllerTypeNames(sourceFile);
  const state = {
    adapterContainerTypeNames: adapterContainers,
    adapterControllerContainerIdentifiers: new Set(),
    adapterControllerIdentifiers: new Set(),
    rawContainerTypeNames: rawContainers,
    rawControllerContainerIdentifiers: new Set(),
    rawControllerIdentifiers: new Set(),
  };

  const visit = (node) => {
    if (ts.isParameter(node) || ts.isVariableDeclaration(node)) {
      addIdentifierByType(sourceFile, node, state);
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      isUseEditorControllerCall(node.initializer)
    ) {
      state.rawControllerIdentifiers.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return state;
}

export function classifyControllerReceiver(receiver, state) {
  if (ts.isIdentifier(receiver)) {
    if (state.rawControllerIdentifiers.has(receiver.text)) {
      return 'raw';
    }
    if (state.adapterControllerIdentifiers.has(receiver.text)) {
      return 'adapter';
    }
    return null;
  }

  if (!ts.isPropertyAccessExpression(receiver) || receiver.name.text !== CONTROLLER_PROPERTY_NAME) {
    return null;
  }
  const owner = receiver.expression;
  if (!ts.isIdentifier(owner)) {
    return null;
  }
  if (state.rawControllerContainerIdentifiers.has(owner.text)) {
    return 'raw';
  }
  if (state.adapterControllerContainerIdentifiers.has(owner.text)) {
    return 'adapter';
  }

  return null;
}

function isDirectInvocation(node) {
  return ts.isCallExpression(node.parent) && node.parent.expression === node;
}

export function isMethodReference(node) {
  return !isDirectInvocation(node) && !ts.isPropertyAccessExpression(node.parent);
}
