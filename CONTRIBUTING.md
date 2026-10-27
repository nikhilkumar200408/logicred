# Contributing

1. Create a feature branch and keep changes focused.
2. Install dependencies with `npm ci` (Node.js 20+; Node.js 22 is used in CI).
3. Run `npm run typecheck`, `npm test`, and `npm run build` before opening a pull request.
4. Never commit `.env`, database URLs, session secrets, personal student data, or real credentials.
5. Add tests for rule-engine, API authorization, workspace isolation, and record-change behavior where applicable.
6. Do not describe synthetic scenarios as live institutional data or imply an official government integration that has not been implemented.
