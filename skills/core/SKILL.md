---
name: nestjs-indexer-skills
description: Comprehensive skills for working with nestjs-indexer
metadata:
  author: Hairyf
  version: "2025.01.29"
  source: Internal Documentation
---

> Based on nestjs-indexer v0.2.0. A distributed cursor indexing and scheduling framework for NestJS applications.

## Core References

| Topic | Description | Reference |
|-------|-------------|-----------|
| Indexer Decorator | How to define an indexer using @Indexer decorator | [core-decorator](references/core-decorator.md) |
| IndexerFactory Base Class | Extending IndexerFactory and implementing required methods | [core-factory](references/core-factory.md) |
| Module Registration | Setting up IndexerModule in NestJS applications | [core-module](references/core-module.md) |
| Basic Methods | Core API methods: current, next, step, latest | [core-basic-methods](references/core-basic-methods.md) |
| Atomic Operations | Atomic index interval retrieval for distributed environments | [core-atomic](references/core-atomic.md) |
| Consume Method | High-level consume method with concurrency and retry logic | [core-consume](references/core-consume.md) |

## Advanced Features

| Topic | Description | Reference |
|-------|-------------|-----------|
| Rollback Feature | Rolling back index pointers and handling epoch validation | [advanced-rollback](references/advanced-rollback.md) |
| Concurrency Control | Configuring and managing concurrent task execution | [advanced-concurrency](references/advanced-concurrency.md) |
| Storage Configuration | Setting up persistent storage for index pointers | [advanced-storage](references/advanced-storage.md) |
| Queue Integration | Integrating with message queues like BullMQ | [advanced-queue-integration](references/advanced-queue-integration.md) |
