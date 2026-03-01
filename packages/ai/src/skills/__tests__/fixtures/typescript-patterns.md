---
name: typescript-patterns
description: TypeScript design patterns and best practices
tags:
  - typescript
  - patterns
  - generics
  - type-safety
priority: 3
trust_level: public
---

# TypeScript Design Patterns

## Builder Pattern

Use the builder pattern for complex object construction:

```typescript
class QueryBuilder<T> {
  private filters: Filter[] = [];

  where(field: keyof T, value: unknown): this {
    this.filters.push({ field, value });
    return this;
  }

  build(): Query<T> {
    return new Query(this.filters);
  }
}
```

## Discriminated Unions

Use discriminated unions for type-safe state machines:

```typescript
type State =
  | { kind: 'idle' }
  | { kind: 'loading'; startedAt: Date }
  | { kind: 'success'; data: unknown }
  | { kind: 'error'; error: Error };
```

## Branded Types

Prevent mixing up primitive types:

```typescript
type UserId = string & { __brand: 'UserId' };
type OrderId = string & { __brand: 'OrderId' };
```
