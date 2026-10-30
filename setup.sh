#!/usr/bin/env bash
# LogicRed — local (non-Docker) setup.
# Run from the repo root: ./setup.sh
# Fails loudly on any error instead of letting a bad step pass silently.
set -e

echo "=== LogicRed — local setup ==="

PY=python3
if ! command -v $PY &> /dev/null; then
  echo "ERROR: python3 not found. Install Python 3.11+ and re-run." >&2
  exit 1
fi

PYVER=$($PY -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
echo "Using Python $PYVER"

echo ""
echo "--- Backend setup ---"
cd backend

if [ ! -d venv ]; then
  $PY -m venv venv
fi

# shellcheck disable=SC1091
source venv/bin/activate

pip install --upgrade pip > /tmp/pip_upgrade.log 2>&1

echo "Installing backend dependencies (this can take a minute)..."
if ! pip install -r requirements.txt; then
  echo ""
  echo "ERROR: pip install failed. Common causes:"
  echo "  - Python version too new/old for a pinned package (see error above for which one)"
  echo "  - Missing system build tools (Xcode CLI tools on macOS: xcode-select --install)"
  echo "Fix the reported package, then re-run ./setup.sh"
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created backend/.env from .env.example (MongoDB — needs a local mongod, or set MONGODB_URL to Atlas/Docker)"
fi

echo "Checking MongoDB connectivity..."
if ! python -c "
import asyncio
from app.database import ping
try:
    asyncio.run(ping())
    print('MongoDB reachable.')
except Exception as e:
    print(f'WARNING: could not reach MongoDB ({e}). Start mongod, or set MONGODB_URL in backend/.env, then re-run.')
    raise SystemExit(1)
"; then
  echo "Skipping seed/tests since MongoDB is unreachable — start Mongo and re-run ./setup.sh"
  deactivate
  cd ..
  exit 1
fi

echo "Seeding demo database..."
python -m app.seed_real_data

echo "Running backend test suite..."
python -m pytest -q

deactivate
cd ..

echo ""
echo "--- Frontend setup ---"
cd frontend

if ! command -v npm &> /dev/null; then
  echo "ERROR: npm not found. Install Node.js 20+ and re-run." >&2
  exit 1
fi

echo "Installing frontend dependencies..."
npm install --no-audit --no-fund

if [ ! -f .env.local ]; then
  cp .env.local.example .env.local
  echo "Created frontend/.env.local from .env.local.example"
fi

cd ..

echo ""
echo "=== Setup complete ==="
echo "Start the backend:  cd backend && source venv/bin/activate && uvicorn app.main:app --reload --port 8000"
echo "Start the frontend: cd frontend && npm run dev"
echo ""
echo "Demo logins: admin/Admin@123, aicte_officer/Officer@123, institution1/Institution@123, employer/Employer@123
