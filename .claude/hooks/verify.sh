#!/usr/bin/env bash
# SSA Framework — verificação rápida pós-edição (qualidade automática).
# Roda typecheck/lint LEVE após cada edição pra pegar erro cedo.
# Detecta a stack sozinho; faz no-op se não reconhecer o projeto.
#
# Por padrão é INFORMATIVO (exit 0 = não bloqueia), pra não travar num
# projeto que já tem erros pré-existentes. Pra deixar OBRIGATÓRIO (o Claude
# é forçado a corrigir antes de seguir), troque os `exit 0` por `exit 2`
# nos blocos de falha abaixo.

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
  echo "⚠️  Verificação encontrou problemas (corrija antes de declarar pronto):"
  echo -e "$PROBLEMS"
  # informativo por padrão. Para FORÇAR correção, descomente a linha abaixo:
  # exit 2
fi
exit 0
