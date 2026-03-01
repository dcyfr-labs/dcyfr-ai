---
name: database-design
description: Database schema design and migration patterns
tags:
  - database
  - postgresql
  - drizzle
  - schema
priority: 4
trust_level: internal
---

# Database Schema Design

## Drizzle ORM Patterns

Define schemas using Drizzle's type-safe API:

```typescript
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});
```

## Migration Strategy

1. Generate migration: `drizzle-kit generate`
2. Review SQL: check `drizzle/` directory
3. Apply: `drizzle-kit push`

## Indexing Best Practices

- Index foreign keys
- Composite indexes for common query patterns
- Partial indexes for filtered queries
- GIN indexes for JSONB columns
