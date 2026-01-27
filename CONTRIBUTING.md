# Contributing to @dcyfr/ai

Thank you for your interest in contributing to @dcyfr/ai! This document provides guidelines and information for contributors.

## Code of Conduct

Be respectful, inclusive, and professional in all interactions.

## How to Contribute

### Reporting Bugs

1. Check existing issues first
2. Create detailed bug report with:
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (Node version, OS, etc.)
   - Code samples if applicable

### Suggesting Features

1. Check existing feature requests
2. Create detailed proposal with:
   - Use case description
   - Proposed API/interface
   - Alternative approaches considered

### Pull Requests

1. Fork the repository
2. Create feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass: `npm test`
6. Update documentation as needed
7. Commit with clear message
8. Push and create PR

## Development Setup

```bash
# Clone repository
git clone https://github.com/dcyfr/dcyfr-ai.git
cd dcyfr-ai

# Install dependencies
npm install

# Build the package
npm run build

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Type check
npm run typecheck

# Lint
npm run lint
```

## Project Structure

```
dcyfr-ai/
├── packages/ai/          # Core framework code
│   ├── config/          # Configuration system
│   ├── telemetry/       # Telemetry engine
│   ├── providers/       # Provider registry
│   ├── plugins/         # Plugin loader
│   ├── validation/      # Validation framework
│   └── __tests__/       # Tests
├── bin/                 # CLI tools
├── docs/                # Documentation
├── examples/            # Example projects
└── config/              # Config templates
```

## Coding Standards

### TypeScript

- Use strict mode
- Provide type annotations for public APIs
- Avoid `any` types
- Use interfaces for public contracts

### Testing

- Write tests for new features
- Maintain >80% code coverage
- Use descriptive test names
- Test edge cases and error conditions

### Documentation

- Update docs for API changes
- Include JSDoc comments for public APIs
- Add examples for new features
- Keep README current

### Commit Messages

Use conventional commits:

```
feat: Add multi-provider fallback
fix: Resolve config loading issue
docs: Update API reference
test: Add plugin loader tests
chore: Update dependencies
```

## Testing

```bash
# Run all tests
npm test

# Run specific test file
npm test -- config.test.ts

# Run with coverage
npm test -- --coverage

# Watch mode
npm run test:watch
```

## Building

```bash
# Build TypeScript
npm run build

# Type check only
npm run typecheck
```

## Documentation

Update relevant docs when making changes:

- [Getting Started](./docs/GETTING-STARTED.md) - For user-facing changes
- [API Reference](./docs/API.md) - For API modifications
- [Plugin Guide](./docs/PLUGINS.md) - For plugin system changes
- [README](./README.md) - For major features

## Release Process

(For maintainers)

1. Update version in package.json
2. Update CHANGELOG.md
3. Create git tag: `git tag v1.x.x`
4. Push tag: `git push --tags`
5. Publish to npm: `npm publish`

## Questions?

- Open an issue for discussion
- Check existing documentation
- Review examples

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
