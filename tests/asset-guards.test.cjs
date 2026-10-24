// Bounded component capabilities; full local-asset acceptance belongs to the umbrella.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {install, renderEnv, ctmLibs} = require('./helpers/ctm-libs.cjs');
const quarto = process.env.QUARTO_BIN || 'quarto';
const skip = spawnSync(quarto, ['--version']).error ? 'Quarto required' : false;
const fence = '`'.repeat(3);
const starter = 'import numpy as np\ntext = "import pretend_package"';
const hiddenTests = 'from math import sqrt\nassert np.ones(1)[0] == 1';

function fixture({mode = 'cdn', collector = 'missing', missingAssets = false, tripwire = false} = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'py-asset-guards-'));
  fs.cpSync(path.join(__dirname, '../_extensions/py-exercise'), path.join(dir, '_extensions/py-exercise'), {recursive: true});
  const library = install(dir);
  if (missingAssets) fs.unlinkSync(path.join(library, 'lua/assets.lua'));
  if (mode === 'local') {
    const table = JSON.parse(fs.readFileSync(path.join(ctmLibs, 'assets.json'), 'utf8'));
    const runtime = fs.readFileSync(path.join(ctmLibs, 'runtime/pyodide-runtime.js'), 'utf8');
    const versions = Object.fromEntries(Object.entries(table.assets).map(([name, entry]) => [name, entry.version]));
    versions.pyodide = runtime.match(/var indexURL = 'https:[^']*\/v([^/]+)\/full\//)[1];
    fs.mkdirSync(path.join(dir, '_ctm-assets'));
    fs.writeFileSync(path.join(dir, '_ctm-assets/manifest.json'), JSON.stringify({v: 1, versions, files: {}}));
    fs.writeFileSync(path.join(dir, '_quarto.yml'), 'project:\n  type: website\n  resources: ["_ctm-assets/**"]\nformat:\n  html:\n    theme: [cosmo, offline-system.scss]\n');
    fs.writeFileSync(path.join(dir, 'offline-system.scss'), '/*-- scss:defaults --*/\n$web-font-path: false;\n');
  }
  const assignment = collector === 'valid' ? '{add=function(item) table.insert(_G.__records,item) end}' :
    collector === 'invalid' ? '{add="not a function"}' : collector === 'boolean' ? 'true' : 'nil';
  fs.writeFileSync(path.join(dir, 'collector.lua'), 'return {{Meta=function(meta)\n_G.__records={}\n_G.__ctmAuthorImports=' + assignment + '\n' +
    (tripwire ? 'assert(_G.__ctmLibs).settings.load=function() error("META SETTINGS TRIPWIRE") end\n' : '') + 'return meta end}}\n');
  fs.writeFileSync(path.join(dir, 'report.lua'), 'return {{Pandoc=function(doc) local f=assert(io.open("fragments.json","w")); f:write(quarto.json.encode(_G.__records)); f:close(); return doc end}}\n');
  fs.writeFileSync(path.join(dir, 'page.qmd'), '---\nformat: html\nengine: markdown\nfilters: [collector.lua, py-exercise, report.lua]\nctm-assessment:\n  assets: ' + mode + '\nai-feedback:\n  enabled: false\n---\n\n' +
    fence + '{py-exercise}\n#| label: task-a\n' + starter + '\n## TESTS ##\n' + hiddenTests + '\n' + fence + '\n');
  return {dir, run: () => spawnSync(quarto, ['render', 'page.qmd'], {cwd: dir, env: renderEnv, encoding: 'utf8', timeout: 120000})};
}
function withFixture(options, check) {
  const f = fixture(options);
  try {check(f, f.run());} finally {fs.rmSync(f.dir, {recursive: true, force: true});}
}

for (const mode of ['cdn', 'local']) test('missing shared assets API is diagnosed before Meta in ' + mode, {skip}, () => {
  withFixture({mode, missingAssets: true, tripwire: true}, (f, result) => {
    const output = result.stdout + result.stderr;
    assert.notEqual(result.status, 0);
    assert.match(output, /py-exercise needs the shared assets API/);
    assert.match(output, /quarto add https:\/\/erasmus-ctm.github.io\/ctm-assessment\/ctm-assessment.tar.gz/);
    assert.doesNotMatch(output, /META SETTINGS TRIPWIRE/);
  });
});

for (const collector of ['missing', 'invalid', 'boolean']) test('local mode refuses a ' + collector + ' author-import collector', {skip}, () => {
  withFixture({mode: 'local', collector}, (f, result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /local asset builds require the CTM Assessment author-import collector/);
  });
});

test('legacy CDN mode still renders without an umbrella collector', {skip}, () => {
  withFixture({mode: 'cdn'}, (f, result) => {
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.ok(fs.existsSync(path.join(f.dir, 'page.html')));
  });
});

test('local mode submits the exact parsed fragments to a valid late collector', {skip}, () => {
  withFixture({mode: 'local', collector: 'valid'}, (f, result) => {
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.dir, 'fragments.json'), 'utf8')), [
      {source: starter, packages: [], origin: 'py-exercise:task-a:starter'},
      {source: hiddenTests, packages: [], origin: 'py-exercise:task-a:tests'}
    ]);
  });
});
