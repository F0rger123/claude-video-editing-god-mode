#!/usr/bin/env bash
#
# Install add-zooms as a Claude Code skill.
#
# Symlinks this repo into ~/.claude/skills/add-zooms so the /add-zooms skill
# is discoverable in Claude Code and stays updatable with `git pull`.
# Safe to re-run: any existing install is removed first.
#
set -euo pipefail

SKILL_NAME="add-zooms"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
SKILLS_DIR="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
TARGET="$SKILLS_DIR/$SKILL_NAME"

mkdir -p "$SKILLS_DIR"

# Delete the skill if it's already here (idempotent reinstall).
if [ -L "$TARGET" ] || [ -e "$TARGET" ]; then
  echo "Removing existing skill at $TARGET"
  rm -rf "$TARGET"
fi

ln -s "$REPO_DIR" "$TARGET"

echo "✅ Installed '$SKILL_NAME'"
echo "   $TARGET -> $REPO_DIR"
echo
echo "Restart Claude Code, then run /add-zooms to use it."
