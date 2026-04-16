# SSA Framework — Claude Code Edition

A **self-improving coding assistant** framework for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Drop this into any project to give Claude Code persistent memory, self-improvement loops, and reusable commands across sessions.

## What This Does

Claude Code starts every session with zero memory. This framework fixes that.

- **Persistent Memory** — Important decisions, bugs, and lessons survive across sessions
- **Self-Improvement** — Claude logs corrections and adapts over time
- **Reusable Commands** — Consistent workflows for code review, debugging, refactoring, and testing
- **Active Task Tracking** — Complex tasks survive session restarts

## Quick Start

### 1. Copy into your project root

```bash
# Clone and copy the files into your project
git clone https://github.com/Sataker/ssa-framework-claude-code.git /tmp/ssa
cp /tmp/ssa/CLAUDE.md your-project/
cp /tmp/ssa/MEMORY.md your-project/
cp /tmp/ssa/ACTIVE_TASK.md your-project/
cp -r /tmp/ssa/commands your-project/
cp -r /tmp/ssa/memory your-project/
rm -rf /tmp/ssa
```

### 2. Customize CLAUDE.md

Edit the `## PROJECT CONTEXT` section at the bottom of `CLAUDE.md`:

```markdown
### Tech Stack
Next.js 14, TypeScript, PostgreSQL, Prisma, Tailwind

### Key Directories
src/app/ = pages, src/lib/ = shared utilities, src/components/ = React components

### Testing
Jest for unit tests, Playwright for E2E. Run with `npm test`

### Deployment
Vercel, main branch auto-deploys to production

### Team Conventions
PR naming: type(scope): description, squash merge only
```

### 3. Update .gitignore

Add memory files to your `.gitignore` (they're personal to each developer):

```
# SSA memory (personal per developer)
memory/*.md
!memory/.gitkeep
MEMORY.md
ACTIVE_TASK.md
```

> **Keep `CLAUDE.md` and `commands/` tracked in git** — they define shared project behavior.

### 4. Start using Claude Code

Claude will automatically read `CLAUDE.md` on session start and follow the protocols.

## File Structure

```
your-project/
  CLAUDE.md          # Core instructions + project rules (committed to git)
  MEMORY.md          # Long-term curated knowledge (personal, gitignored)
  ACTIVE_TASK.md     # Current task state (personal, gitignored)
  memory/
    .gitkeep
    2024-01-15.md    # Daily log (auto-created during sessions)
  commands/
    review.md        # Code review workflow
    debug.md         # Bug diagnosis workflow
    refactor.md      # Refactoring workflow
    test.md          # Test writing workflow
    document.md      # Documentation workflow
```

## How Memory Works

### Session Start
Claude reads files in this order:
1. `CLAUDE.md` — Who it is + project rules
2. `MEMORY.md` — Long-term curated knowledge
3. `memory/today.md` — What happened today
4. `memory/yesterday.md` — What happened yesterday
5. `ACTIVE_TASK.md` — Resume interrupted work

### During Sessions
When something important happens (decision, bug, lesson), Claude writes to `memory/YYYY-MM-DD.md`:

```markdown
# 2024-01-15

## Tasks Completed
- [x] Fixed N+1 query in users endpoint

## Decisions Made
- Decision: Use PostgreSQL instead of MongoDB
- Reason: Need transactions for payment flow

## Bugs Found
- Race condition in queue worker with duplicate messages

## Lessons Learned
- The test suite needs Redis running — added to README
```

### Long-Term Memory
`MEMORY.md` stores curated knowledge that matters across weeks and months — architecture decisions, user preferences, known gotchas. Updated periodically, not daily.

## Commands

Commands are reusable instruction files in `commands/`. They give Claude consistent workflows:

| Command | What it does |
|---------|-------------|
| `commands/review.md` | Structured code review with severity levels |
| `commands/debug.md` | Systematic bug diagnosis: reproduce, locate, hypothesize, verify, fix |
| `commands/refactor.md` | Safe refactoring with test-first approach |
| `commands/test.md` | Test writing following project patterns |
| `commands/document.md` | Documentation that focuses on the non-obvious |

### Creating Custom Commands

Add any `.md` file to `commands/`:

```markdown
# Deploy

Steps to deploy to production.

## Steps
1. Run the full test suite
2. Check for uncommitted changes
3. Verify the branch is up to date with main
4. Run the build
5. Deploy using [your method]

## Rules
- Never deploy on Fridays
- Always check the staging environment first
```

Then ask Claude: "Follow the deploy command."

## Self-Improvement

Claude improves across sessions by logging corrections:

```markdown
## Lessons Learned
- **Correction:** Used `any` type when project uses strict typing
- **Root cause:** Didn't check existing patterns before writing new code
- **Fix:** Always check 2-3 existing files for type patterns first
```

Before starting work, Claude scans recent memory files for relevant lessons — known gotchas, failed approaches, discovered preferences.

## Customization

### Change the coding rules
Edit the `## CODING RULES` section in `CLAUDE.md`. Add your team's specific conventions.

### Add project-specific memory
Edit `MEMORY.md` with architecture decisions, known issues, and preferences.

### Create team commands
Add workflow files to `commands/` and commit them. The whole team benefits.

## License

MIT — use it however you want.
