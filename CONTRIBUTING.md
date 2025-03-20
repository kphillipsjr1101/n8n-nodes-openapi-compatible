# Contributing to n8n-openapi-node

Thank you for your interest in contributing to n8n-openapi-node! This document outlines the process for contributing to the project and how to set up your development environment.

## Setting Up Development Environment

1. **Fork and clone the repository**

```bash
git clone https://github.com/kphillipsjr1101/n8n-nodes-openapi-compatible.git
cd n8n-nodes-openapi-compatible
```

2. **Install dependencies**

```bash
pnpm install
```

3. **Create a new branch**

```bash
git checkout -b feature/my-new-feature
```

## Running Tests

The project is using vitest for testing. No particular reason, just wanted to try it out. 😄
If you're familiar with Jest, you should feel right at home.

Run the test suite with:

```bash
pnpm test
```

For development with automated testing, you can also run:

```bash
pnpm run test:watch
```

## Building the Node for local testing

To build the node for local testing, run:

```bash
pnpm build;pnpm link
```

Then in your n8n directory, navigate to the `~/.n8n/nodes` directory and run:

```bash
pnpm link @kphillipsjr1101/n8n-nodes-openapi-compatible
```

Finally, restart n8n and you should see the node in the node list.
🎉🎉🎉

## Contribution Guidelines

- Follow the existing code style
- Use ESLint and Prettier for code formatting
- This project was based off of the [n8n-nodes-starter](https://github.com/n8n-io/n8n-nodes-starter) project
- Adhere to the ESLint rules in the project
- Ensure that all new features are documented
- Ensure that all contributions are tested before submission

### Commit Messages

- Use clear, descriptive commit messages
- Reference issue numbers when applicable

### Branch Naming

- Use feature/[feature-name] for new features
- Use fix/[bug-name] for bug fixes

## Pull Request Process

1. Create a new branch for your feature or bugfix
2. Implement your changes with tests
3. Ensure all tests pass and linting rules are satisfied
4. Update documentation as needed
5. Submit a pull request with a clear description of the changes

## Code of Conduct

Please adhere to the project's code of conduct in all your interactions with the project.

## Additional Resources

- [n8n Documentation](https://docs.n8n.io/)
- [GitHub Issues](https://github.com/kphillipsjr1101/n8n-nodes-openapi-compatible/issues)

Thank you for contributing to the project! 🚀
