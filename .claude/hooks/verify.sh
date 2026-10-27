#!/usr/bin/env bash
# SSA Framework — quick post-edit verification (automatic quality gate).
# Runs a LIGHT typecheck/lint after every edit to catch errors early.
# Detects the stack on its own; does nothing if it doesn't recognise the project.
#
# INFORMATIONAL by default (exit 0 = does not block), so it doesn't get stuck on a
# project that already has pre-existing errors. To make it MANDATORY (Claude is
# forced to fix before moving on), replace the final `exit 0` with `exit 2`
# when problems are found (see the commented line below).

PROBLEMS=""

# --- JS / TS ---
if [ -f package.json ]; then
  if [ -f tsconfig.json ] && command -v npx >/dev/null 2>&1; then
    TC=$(npx --no-install tsc --noEmit 2>&1)
    [ -n "$TC" ] && PROBLEMS="$PROBLEMS\n[typecheck]\n$(echo "$TC" | head -25)"
  fi
  if grep -q '"lint"' package.json 2>/dev/null; then
    LINT=$(npm run -s lint 2>&1)
    echo "$LINT" | grep -qiE "error|problem" && PROBLEMS="$PROBLEMS\n[lint]\n$(echo "$LINT" | tail -25)"
  fi
fi

# --- Python ---
if ls *.py >/dev/null 2>&1 || [ -f pyproject.toml ]; then
  if command -v ruff >/dev/null 2>&1; then
    RUFF=$(ruff check . 2>&1)
    echo "$RUFF" | grep -qiE "error|[0-9]+ error" && PROBLEMS="$PROBLEMS\n[ruff]\n$(echo "$RUFF" | head -25)"
  fi
fi

if [ -n "$PROBLEMS" ]; then
  echo "⚠️  Verification found problems (fix them before declaring done):"
  echo -e "$PROBLEMS"
  # informational by default. To FORCE a fix, uncomment the line below:
  # exit 2
fi
exit 0
