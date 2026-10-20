#!/usr/bin/env bash
# Start the BeatFlow local application.
#
# Mirrors the Stemify launcher: verify prerequisites before starting anything,
# then run the Next.js dev server and stop it cleanly on exit. The desktop
# shortcut points at start-windows.cmd, which does nothing but find Bash and
# run this script from this directory, so all relative paths resolve here.
#
# Set BEATFLOW_SKIP_PREFLIGHT=1 to skip the checks.
set -uo pipefail
cd "$(dirname "$0")"

# Port 3000 is `npm run dev`'s default; 3113 is the M0 verification port, not
# the one a normal session uses. BEATFLOW_PORT overrides both.
: "${BEATFLOW_PORT:=3000}"
PORT="$BEATFLOW_PORT"

DEV_PID=""
PREFLIGHT_FAILED=0

fail() {
  echo "ERROR: $1" >&2
  PREFLIGHT_FAILED=1
}

need_command() {
  local name="$1" hint="$2"
  if ! command -v "$name" >/dev/null 2>&1; then
    fail "$name is not installed. $hint"
  fi
}

warn() {
  echo "WARNING: $1" >&2
}

# Every value in .env.local is required for sign-in: the Google OAuth client,
# the session secret, and the one account allowed to use the tool. Next.js
# reads the file itself, so this only reports what is missing. The server is
# still started — the editor UI loads, and sign-in fails until the values are
# filled in — because blocking startup here would hide the very page that
# explains the setup.
check_env_file() {
  local file=".env.local" key value missing=()
  if [ ! -f "$file" ]; then
    warn "$file is missing (copy .env.example and fill it in); sign-in will fail."
    return 0
  fi
  for key in GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET AUTH_SECRET OWNER_EMAIL; do
    # `sed` rather than sourcing the file: values here are untrusted to a
    # shell, and a stray backtick or `$(...)` would otherwise execute.
    value="$(sed -n "s/^[[:space:]]*${key}[[:space:]]*=[[:space:]]*//p" "$file" | tail -1 | tr -d '\r')"
    if [ -z "$value" ]; then
      missing+=("$key")
    fi
  done
  if [ "${#missing[@]}" -gt 0 ]; then
    warn "$file is missing ${missing[*]}; the app starts, but sign-in fails until they are set."
  fi
}

if [ "${BEATFLOW_SKIP_PREFLIGHT:-0}" != "1" ]; then
  echo "== BeatFlow startup checks =="

  need_command "bash" "Run this script with Bash (Git Bash on Windows)."
  need_command "node" "Install Node.js 24.7 or newer from https://nodejs.org."
  need_command "npm" "npm ships with Node.js: https://nodejs.org."

  # package.json requires node >=24.7.0. Compare as two numbers rather than
  # trusting `node --version` text, which carries a leading `v` on Windows.
  if command -v node >/dev/null 2>&1; then
    NODE_VERSION="$(node -p 'process.versions.node' 2>/dev/null)"
    NODE_MAJOR="${NODE_VERSION%%.*}"
    NODE_REST="${NODE_VERSION#*.}"
    NODE_MINOR="${NODE_REST%%.*}"
    case "$NODE_MAJOR" in *[!0-9]*|"") NODE_MAJOR=0 ;; esac
    case "$NODE_MINOR" in *[!0-9]*|"") NODE_MINOR=0 ;; esac
    if [ "$NODE_MAJOR" -lt 24 ] || { [ "$NODE_MAJOR" -eq 24 ] && [ "$NODE_MINOR" -lt 7 ]; }; then
      fail "Node ${NODE_VERSION:-unknown} is too old; package.json requires 24.7 or newer."
    fi
  fi

  if [ ! -d node_modules ]; then
    echo "node_modules missing; run: npm install" >&2
    PREFLIGHT_FAILED=1
  fi

  check_env_file

  if [ "$PREFLIGHT_FAILED" != "0" ]; then
    echo "" >&2
    echo "Startup checks failed. Fix the items above and run ./start.sh again." >&2
    exit 1
  fi
  echo "== Checks passed =="
fi

# A server already holding the port makes Next.js silently move to 3001, and
# the browser shortcut would open the wrong instance (or a stale one).
if command -v node >/dev/null 2>&1; then
  if ! node -e "
    const net = require('net');
    const server = net.createServer();
    server.once('error', () => process.exit(1));
    server.listen(Number(process.argv[1]), '127.0.0.1', () => server.close(() => process.exit(0)));
  " "$PORT" >/dev/null 2>&1; then
    warn "port $PORT is already in use; stop the other server or set BEATFLOW_PORT."
    exit 1
  fi
fi

echo "BeatFlow dev server: http://localhost:$PORT (Ctrl+C to stop)"

# PIDs listening on $PORT. Next 16's dev server detaches from `npm run dev`,
# so killing the npm process tree on Windows leaves the real server holding the
# port (verified: `taskkill //T` on npm exits code 0 and the listener survives).
# Since startup refuses to run when the port is taken, every listener found here
# is this session's server.
listening_pids() {
  netstat -ano 2>/dev/null | tr -d '\r' | awk -v p=":$PORT" '
    $1 == "TCP" && $4 == "LISTENING" && substr($2, length($2) - length(p) + 1) == p { print $5 }
  ' | sort -u
}

cleanup() {
  local status=$? pid
  # Disarm first: `exit` at the end would otherwise re-enter this handler.
  trap - EXIT INT TERM
  # Two different PID spaces meet here. `$!`/`jobs -p` give Git Bash's own
  # numbering, which `kill` understands but `taskkill` does not (it silently
  # no-ops on them), while netstat reports real Windows PIDs, which only
  # `taskkill` can force. So each tool is used on the IDs it understands.
  if [ -n "${DEV_PID:-}" ]; then
    kill "$DEV_PID" 2>/dev/null
  fi
  for pid in $(listening_pids); do
    if command -v taskkill >/dev/null 2>&1; then
      taskkill //F //T //PID "$pid" >/dev/null 2>&1
    else
      kill "$pid" 2>/dev/null
    fi
  done
  exit "$status"
}
trap cleanup EXIT INT TERM

# `--hostname 127.0.0.1` rather than Stemify's `HOSTNAME=127.0.0.1`: Next 16
# defaults to 0.0.0.0 and reads only `PORT` from the environment, so exporting
# HOSTNAME would leave the dev server (and the editor) reachable from the LAN.
# `jobs -p` instead of $!: under `set -u` with a trap armed, some Git Bash
# (MSYS2) builds treat $! as unset.
npm run dev -- --port "$PORT" --hostname 127.0.0.1 &
DEV_PID=$(jobs -p | tail -1)

wait "$DEV_PID"
