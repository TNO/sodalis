#!/bin/sh
cd "$(dirname "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then
  exec python3 ./start.py "$@"
else
  printf '%s\n' 'Python 3 was not found. Open Aster.html directly, or install Python 3 to use the localhost launcher.'
  exit 1
fi
