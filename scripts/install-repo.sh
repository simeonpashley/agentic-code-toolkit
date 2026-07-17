#!/usr/bin/env bash
set -euo pipefail

repo="${1:-.}"

mkdir -p "$repo/.pi/prompts" "$repo/.pi/skills" "$repo/.pi/extensions"

if [ ! -f "$repo/AGENTS.md" ]; then
  cp templates/repo/AGENTS.md "$repo/AGENTS.md"
fi

if [ ! -f "$repo/.pi/settings.json" ]; then
  cp templates/repo/.pi/settings.json "$repo/.pi/settings.json"
fi

echo "Installed Pi project layer into $repo"