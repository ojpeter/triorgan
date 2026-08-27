#!/usr/bin/env bash
# Runs the same checks as CI, locally. Use before pushing.
#
#   npm run verify
set -euo pipefail
cd "$(dirname "$0")/.."

fail=0
step() { printf '\n\033[1m── %s\033[0m\n' "$1"; }
ok()   { printf '   \033[32m✓\033[0m %s\n' "$1"; }
bad()  { printf '   \033[31m✗\033[0m %s\n' "$1"; fail=1; }

step "Secret scan"
patterns='sk-ant-[A-Za-z0-9_-]{20}|FLWSECK-[A-Za-z0-9]|sk_live_|AIza[0-9A-Za-z_-]{35}'
if grep -rIEn "$patterns" --exclude-dir=node_modules --exclude-dir=.git \
     --exclude-dir=.venv --exclude=package-lock.json \
     src App.js index.js app.config.js backend/corvia 2>/dev/null; then
  bad "a credential is committed — revoke it and move it to the server"
else
  ok "no credentials in application source"
fi

step "Lint"
if npx eslint . >/dev/null 2>&1; then ok "clean"; else npx eslint .; bad "lint errors"; fi

step "App tests"
if npx jest --silent >/dev/null 2>&1; then ok "passing"; else npx jest; bad "app tests failed"; fi

step "Symptom library in sync"
before=$(node -e "console.log(require('crypto').createHash('md5').update(require('fs').readFileSync('backend/symptoms.json')).digest('hex'))")
npm run export:symptoms --silent >/dev/null
after=$(node -e "console.log(require('crypto').createHash('md5').update(require('fs').readFileSync('backend/symptoms.json')).digest('hex'))")
if [ "$before" = "$after" ]; then ok "in sync"; else bad "stale — commit the regenerated backend/symptoms.json"; fi

step "Production config"
config=$(APP_ENV=production npx expo config --type public --json 2>/dev/null)
read -r api_base cleartext fallback plugin_cleartext <<<"$(echo "$config" | node -e "
  let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
    const c = JSON.parse(s);
    const bp = (c.plugins ?? []).find(p => Array.isArray(p) && p[0] === 'expo-build-properties');
    console.log(c.extra.apiBase, String(c.extra.allowCleartext),
                String(c.extra.allowLocalWalletFallback),
                String(bp?.[1]?.android?.usesCleartextTraffic));
  });
")"
case "$api_base" in https://*) ok "apiBase is HTTPS";; *) bad "apiBase must be HTTPS, got $api_base";; esac
if echo "$api_base" | grep -qE '(localhost|127\.0\.0\.1|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)'; then
  bad "apiBase points at a private address"
else ok "apiBase is publicly routable"; fi
[ "$cleartext" = "false" ] && ok "cleartext HTTP disabled" || bad "cleartext HTTP must be off in production"
[ "$plugin_cleartext" = "false" ] && ok "build plugin agrees" || bad "expo-build-properties still allows cleartext"
[ "$fallback" = "false" ] && ok "local wallet fallback disabled" || bad "local wallet must be off in production"

step "Backend tests"
if [ -d backend/.venv ]; then
  py=backend/.venv/bin/python; [ -f "$py" ] || py=backend/.venv/Scripts/python.exe
  if (cd backend && "../$py" -m pytest -q >/dev/null 2>&1); then ok "passing"
  else (cd backend && "../$py" -m pytest -q); bad "backend tests failed"; fi
else
  printf '   \033[33m·\033[0m skipped (no backend/.venv — see backend/README.md)\n'
fi

printf '\n'
[ "$fail" -eq 0 ] && { printf '\033[32mAll checks passed.\033[0m\n'; exit 0; }
printf '\033[31mSome checks failed.\033[0m\n'; exit 1
