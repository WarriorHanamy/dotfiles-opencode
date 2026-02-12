---
name: spec-document-format
description: |
    Standard format for spec documents.
---

## 📄 Specification Document Format

All spec documents **MUST** follow this Markdown template.
The file should be stored under `specs/` with a meaningful name, e.g., `specs/feature-authentication.md`.

```markdown
# Specification: <Title>

## Metadata
- **Version**: <semver, e.g., 1.0.0>
- **Status**: Draft | Active | Deprecated
- **Author**: <agent or user>
- **Created**: <YYYY-MM-DD>
- **Last Updated**: <YYYY-MM-DD>

## Overview
<Brief description of the feature or system>

## Requirements
### Functional Requirements
- FR-1: <description>
- FR-2: ...

### Non-functional Requirements
- NFR-1: <performance, security, etc.>

## Technical Design
<Detailed design, architecture diagrams (ASCII or references), data models, algorithms>

## API Specification
<If applicable: endpoints, request/response formats, authentication, error handling>

## Implementation Guidelines
<Coding standards, libraries, environment variables, configuration>

## Test Steps
<Step-by-step verification instructions. May be shell commands, manual actions, or both.>

## Acceptance Criteria
<Conditions that must be satisfied for completion>

## Change Log
| Date       | Version | Description       | Author     |
|------------|---------|-------------------|------------|
| <date>     | 1.0.0   | Initial draft     | <author>   |
```
