#!/usr/bin/env node
/**
 * Generates backend/symptoms.json from src/constants/symptoms.js.
 *
 * The backend needs the symptom text to build the model prompt, but it deploys
 * separately and cannot read the app's source. Rather than hand-copying the
 * data — which is exactly how this project ended up with three diverging
 * pricing tables — the app's file stays the single source of truth and this
 * script derives the server's copy from it.
 *
 *   npm run export:symptoms
 *
 * CI should run this and fail if the output differs from what is committed, so
 * the two can never silently drift:
 *   npm run export:symptoms && git diff --exit-code backend/symptoms.json
 */

const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const SOURCE = path.join(__dirname, '..', 'src', 'constants', 'symptoms.js');
const OUTPUT = path.join(__dirname, '..', 'backend', 'symptoms.json');

// The source is an ES module; transform it to CommonJS so we can evaluate it
// without a bundler.
const { code } = babel.transformFileSync(SOURCE, {
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
  babelrc: false,
  configFile: false,
});

const module_ = { exports: {} };
// eslint-disable-next-line no-new-func
new Function('module', 'exports', code)(module_, module_.exports);

const { ORGANS, SYMPTOMS } = module_.exports;

if (!ORGANS || !SYMPTOMS) {
  throw new Error('symptoms.js must export both ORGANS and SYMPTOMS');
}

// Only the fields the server actually needs for the prompt. Presentation-only
// fields (icon, colours, photoGuide) stay in the app.
const payload = {
  organs: Object.fromEntries(
    Object.entries(ORGANS).map(([id, organ]) => [id, { id, name: organ.name }])
  ),
  symptoms: Object.fromEntries(
    Object.entries(SYMPTOMS).map(([organId, list]) => [
      organId,
      list.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        why: s.why,
        severity: s.severity,
      })),
    ])
  ),
};

const ids = Object.values(payload.symptoms).flatMap((list) => list.map((s) => s.id));
const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
if (duplicates.length) {
  throw new Error(`Duplicate symptom ids across organs: ${duplicates.join(', ')}`);
}

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

console.log(
  `Wrote ${path.relative(process.cwd(), OUTPUT)} — ` +
    `${Object.keys(payload.organs).length} organs, ${ids.length} symptoms.`
);
