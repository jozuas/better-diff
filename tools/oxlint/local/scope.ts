import type { Context, ESTree, Scope, Variable } from "@oxlint/plugins";

// The variable that `node` refers to, if it's an identifier that refers to one. Oxlint lists a
// reference in a decorator under a scope enclosing the one it gives for the decorator.
export function resolve(context: Context, node: ESTree.Node): Variable | null {
  for (
    let scope: Scope | null = context.sourceCode.getScope(node);
    scope !== null;
    scope = scope.upper
  ) {
    const reference = scope.references.find(({ identifier }) => identifier === node);

    if (reference !== undefined) {
      return reference.resolved;
    }
  }

  return null;
}
