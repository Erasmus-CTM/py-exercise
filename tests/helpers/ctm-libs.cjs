// ctm-libs, the library of CTM Assessment that py-exercise loads: where it is
// installed for the tests, its browser files (Python runtime, message
// catalogue), and test projects that render with it.
const fs = require('node:fs');
const path = require('node:path');

// CTM_LIBS_EXTENSION (an _extensions/ctm-libs folder), else the installation
// in this repository: `quarto add Erasmus-CTM/ctm-libs` installs it under
// _extensions/Erasmus-CTM/ctm-libs, `quarto add ../ctm-libs` under
// _extensions/ctm-libs.
const extensions = path.join(__dirname, '..', '..', '_extensions');
function locate() {
  if (process.env.CTM_LIBS_EXTENSION) return process.env.CTM_LIBS_EXTENSION;
  const candidates = [path.join(extensions, 'ctm-libs'),
    ...(fs.existsSync(extensions) ? fs.readdirSync(extensions).map(owner => path.join(extensions, owner, 'ctm-libs')) : [])];
  const found = candidates.find(dir => fs.existsSync(path.join(dir, 'lua', 'ctm.lua')));
  if (!found) {
    throw new Error('Install ctm-libs first (quarto add Erasmus-CTM/ctm-libs@main --no-prompt), '
      + 'or set CTM_LIBS_EXTENSION to its _extensions/ctm-libs folder.');
  }
  return found;
}
const ctmLibs = locate();

// Browser files of ctm-libs, each list in the order a page loads it.
const RUNTIME = ['runtime/pyodide-runtime.js'];
const LOCALE = ['locales/ctm-locale.js', 'locales/common.js', 'locales/py-exercise.js'];

function sources(files) {
  return files.map(file => fs.readFileSync(path.join(ctmLibs, file), 'utf8'));
}

// Copies ctm-libs into a test project's _extensions (or an owner folder), as
// `quarto add` does.
function install(dir, owner = '') {
  const target = path.join(dir, '_extensions', owner, 'ctm-libs');
  fs.cpSync(ctmLibs, target, { recursive: true });
  return target;
}

// Test projects have ctm-libs but not the CTM Assessment package, as in
// component development: the bootstrap is told so (CTM_COMPONENT_DEV=1).
const renderEnv = { ...process.env, CTM_COMPONENT_DEV: '1' };

module.exports = { ctmLibs, RUNTIME, LOCALE, sources, install, renderEnv };
