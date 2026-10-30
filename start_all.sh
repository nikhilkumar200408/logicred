#!/usr/bin/env bash
# LogicRed — single-terminal launcher.
#
# Boots the FastAPI backend and the Next.js frontend as background jobs of
# this one process, streams both logs to this terminal (prefixed so you can
# tell them apart), and cleanly stops both on Ctrl+C. Run once ./setup.sh
# has been run at least once (venv + node_modules present).
#
#   ./start_all.sh
#
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"

RED='\033[0;31m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'

echo -e "${BLUE}=== LogicRed — starting backend + frontend ===${NC}"

# --- Preflight ---------------------------------------------------------
if [ ! -d backend/venv ]; then
  echo -e "${RED}backend/venv not found. Run ./setup.sh first.${NC}" >&2
  exit 1
fi
if [ ! -d frontend/node_modules ]; then
  echo -e "${RED}frontend/node_modules not found. Run ./setup.sh first.${NC}" >&2
  exit 1
fi
if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
  echo "Created backend/.env from .env.example"
fi
if [ ! -f frontend/.env.local ]; then
  cp frontend/.env.local.example frontend/.env.local
  echo "Created frontend/.env.local from .env.local.example"
fi

# --- Verify MongoDB is reachable before starting the backend -----------
echo "Checking MongoDB connectivity..."
(
  cd backend
  # shellcheck disable=SC1091
  source venv/bin/activate
  python -c "
import asyncio
from app.database import ping
asyncio.run(ping())
" 2>/tmp/logicred_mongo_check.log
)
if [ $? -ne 0 ]; then
  echo -e "${RED}Could not reach MongoDB.${NC} Start a local mongod (or set MONGODB_URL in backend/.env to Atlas/Docker), then re-run."
  cat /tmp/logicred_mongo_check.log >&2
  exit 1
fi
echo -e "${GREEN}MongoDB reachable.${NC}"

mkdir -p logs
PIDS=()

cleanup() {
  echo -e "\n${BLUE}Shutting down...${NC}"
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null
  done
  wait 2>/dev/null
  echo -e "${GREEN}Stopped.${NC}"
}
trap cleanup EXIT INT TERM

# --- Backend (FastAPI / uvicorn) ----------------------------------------
(
  cd backend
  # shellcheck disable=SC1091
  source venv/bin/activate
  exec uvicorn app.main:app --reload --host 0.0.0.0 --port "$BACKEND_PORT"
) > >(sed "s/^/${GREEN}[backend]${NC} /") 2> >(sed "s/^/${GREEN}[backend]${NC} /" >&2) &
PIDS+=($!)

# --- Frontend (Next.js) -------------------------------------------------
(
  cd frontend
  exec npm run dev -- --port "$FRONTEND_PORT"
) > >(sed "s/^/${BLUE}[frontend]${NC} /") 2> >(sed "s/^/${BLUE}[frontend]${NC} /" >&2) &
PIDS+=($!)

echo -e "${GREEN}Backend${NC}  → http://localhost:${BACKEND_PORT}  (docs at /docs)"
echo -e "${BLUE}Frontend${NC} → http://localhost:${FRONTEND_PORT}"
echo "Press Ctrl+C to stop both."
echo ""

wait "${PIDS[@]}"
