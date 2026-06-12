```markdown
# n8n-nodes-openapi-compatible Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches you how to contribute to and maintain the `n8n-nodes-openapi-compatible` TypeScript codebase, which is built using the Vite framework. You'll learn the project's coding conventions, file organization, and how to write and run tests. While no automated workflows were detected, this guide provides best practices and suggested commands for common development tasks.

## Coding Conventions

### File Naming
- Use **PascalCase** for file names.
  - Example: `MyNode.ts`, `OpenApiHelper.ts`

### Import Style
- Use **relative imports** for modules within the codebase.
  - Example:
    ```typescript
    import { OpenApiHelper } from './OpenApiHelper';
    ```

### Export Style
- Use **named exports** for functions, classes, and constants.
  - Example:
    ```typescript
    export function parseOpenApiSpec(spec: object): NodeDefinition { ... }
    export class OpenApiHelper { ... }
    ```

### Commit Messages
- Commit message types are **freeform** (no enforced prefixes).
- Average commit message length: ~54 characters.
  - Example: `Add support for nested schema resolution`

## Workflows

### Adding a New Node
**Trigger:** When you want to add a new OpenAPI-compatible node.
**Command:** `/add-node`

1. Create a new file using PascalCase, e.g., `MyNewNode.ts`.
2. Implement your node logic, using named exports.
3. Use relative imports for any shared utilities.
4. Add or update tests in a corresponding `*.test.*` file.
5. Commit your changes with a clear, descriptive message.

```typescript
// MyNewNode.ts
export function myNewNode(params: NodeParams): NodeResult {
  // Node logic here
}
```

### Updating an Existing Node
**Trigger:** When modifying the logic or interface of an existing node.
**Command:** `/update-node`

1. Locate the relevant node file (e.g., `ExistingNode.ts`).
2. Make your changes, maintaining the coding conventions.
3. Update or add tests as needed.
4. Commit with a descriptive message.

### Running Tests
**Trigger:** Before pushing or merging code, or after making changes.
**Command:** `/run-tests`

1. Locate test files matching `*.test.*`.
2. Use the project's test runner (framework unknown; check `package.json` for scripts).
3. Run the test command, e.g., `npm test` or `yarn test`.
4. Review output and fix any failing tests.

## Testing Patterns

- Test files follow the pattern: `*.test.*` (e.g., `OpenApiHelper.test.ts`).
- The testing framework is **unknown**; check the project scripts or documentation for details.
- Place tests alongside the code they cover or in a dedicated test directory.

## Commands
| Command       | Purpose                                      |
|---------------|----------------------------------------------|
| /add-node     | Scaffold and implement a new node            |
| /update-node  | Update logic or interface of an existing node|
| /run-tests    | Run the test suite for the codebase          |
```
