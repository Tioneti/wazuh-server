#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
node plugins/main/test/public/pso-station/security.test.cjs
node <<'JS'
const ts = require('./plugins/main/node_modules/typescript');
const fs = require('fs');
const directories = ['group-dashboard','pso-station','ob-station','servers'];
for (const directory of directories) {
  const base = 'plugins/main/public/components/' + directory;
  for (const name of fs.readdirSync(base).filter(name=>/\.tsx?$/.test(name))) {
    const result = ts.transpileModule(fs.readFileSync(base+'/'+name,'utf8'), {
      fileName:name,reportDiagnostics:true,
      compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2019},
    });
    if (result.diagnostics.length) {console.error(result.diagnostics);process.exit(1);}
  }
}
console.log('Dashboard syntax checks passed (not a full type check).');
JS
# Existing repo configuration references an unavailable import rule, and its
# indent rule conflicts with Prettier. Keep these explicit exclusions scoped.
plugins/main/node_modules/.bin/eslint \
  plugins/main/public/components/group-dashboard \
  plugins/main/public/components/pso-station \
  plugins/main/public/components/ob-station \
  plugins/main/public/components/servers \
  --rule 'import/no-unused-modules: off' --rule 'indent: off'
plugins/main/node_modules/.bin/prettier --check \
  plugins/main/public/components/group-dashboard \
  plugins/main/public/components/pso-station \
  plugins/main/public/components/ob-station \
  plugins/main/public/components/servers \
  plugins/main/test/public/pso-station/security.test.cjs
bash -n docker/osd-dev/operations/backup-config.sh
printf '%s\n' 'Group dashboard development checks passed.'
