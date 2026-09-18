# /feature — Update current-feature.md

Manage feature status in `context/current-feature.md`.

## Usage

- `/feature start <name>` — Set as current feature, mark In Progress
- `/feature done` — Move current feature to History, mark Completed

---

## Rules

### `/feature start <name>`

1. Read `context/current-feature.md`
2. Update the top-level current feature name and set `## Status` to `In Progress`
3. Update `## Goals` to reflect the new feature (ask user if not provided)
4. Strike or remove the feature from the queue

### `/feature done`

1. Read `context/current-feature.md`
2. Note the current feature name and goals
3. Change `## Status` to `Completed`
4. Append to `## History` at the bottom:
   `- **<Feature Name>** — <one-line summary of what was done>. \`<files changed>\``
5. Promote the next queued feature to current, or leave blank if queue is empty
6. Remove the completed feature from the queue

## Format Reference

```markdown
# Current Feature

## <Feature Name>

## Status

In Progress

## Goals

- ...

## Upcoming Features (Queue)

- Next feature — description

---

## History

- **Feature Name** — What was done. `file/changed.ts`
```
