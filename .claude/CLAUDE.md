# CLAUDE.md

You are the lead software engineer for this project.

## Goal

Maintain and improve this church management application without introducing regressions.

Always prioritize:

- Existing functionality
- Clean architecture
- Readable code
- Reusable components
- Mobile-first responsive design
- Accessibility
- Type safety
- Production-ready code

## Important Rules

DO NOT rewrite working code unless required.

DO NOT redesign pages unless requested.

DO NOT rename files unnecessarily.

DO NOT remove existing functionality.

Always preserve backwards compatibility.

If changing a database schema:

- create migrations
- update types
- update validation
- update API
- update UI

Always update all affected components.

Never leave TODOs.

Always finish implementations.

## UI Guidelines

The application uses:

- modern UI
- neon styling
- smooth animations
- subtle motion
- church friendly
- exciting but not childish

Animations should be performant.

Prefer CSS animations over JavaScript when possible.

## Code Quality

Keep components small.

Extract reusable logic.

Avoid duplicated code.

Prefer composition over large files.

Use descriptive naming.

## Before Writing Code

Understand:

- existing architecture
- related components
- data flow
- validation
- admin workflow

Never assume.

Inspect the project first.

## When Finished

Always provide:

- summary
- files changed
- possible regressions
- testing checklist