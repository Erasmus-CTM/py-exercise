// Browser-runtime regressions for py-exercise.js, run in jsdom against a fake
// shared Python interpreter (no CDN): checks pressed before Python is ready,
// a runtime replaced by pyodide-interaktiv, an unreachable editor.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync(path.join(__dirname, '../_extensions/py-exercise/py-exercise.js'), 'utf8');
const tick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));

// One namespace shared by all exercises, like Pyodide's globals. Evaluation
// reads the namespace when it runs, after an asynchronous hop.
function fakeInterpreter() {
  const globals = new Map();
  return {
    globals: { set: (name, value) => { globals.set(name, value); } },
    toPy: value => value,
    loadPackagesFromImports: async () => {},
    runPythonAsync: async code => {
      await tick(5);
      if (/_exercise_forbidden/.test(code) && !/_exercise_test_code/.test(code)) return '[]';
      for (const name of ['_msg_assertion_failed', '_msg_test_error', '_msg_syntax_error']) {
        if (!globals.has(name)) throw new Error("NameError: name '" + name + "' is not defined");
      }
      const student = globals.get('_exercise_student_code'), tests = globals.get('_exercise_test_code');
      const passed = student.includes('return a + b') && tests.includes('add(');
      return JSON.stringify({ stdout: '', student_error: null, tests: [{ passed, message: tests }] });
    },
  };
}

function page(exercises, { monaco = true } = {}) {
  const cells = exercises.map(e => '<div class="py-exercise-cell" id="py-exercise-' + e.id + '"></div>').join('');
  const dom = new JSDOM('<!doctype html><html><head></head><body>' + cells + '</body></html>', { url: 'https://example.org/p.html', runScripts: 'outside-only' });
  const w = dom.window;
  w.__pyExerciseConfig = { submission: false, lang: 'en' };
  w.__pyExercises = exercises;
  w.require = (deps, ok, fail) => setTimeout(() => (monaco ? ok() : fail(new Error('offline'))), 0);
  w.require.config = () => {};
  const editors = {};
  w.monaco = { KeyMod: { Shift: 1 }, KeyCode: { Enter: 2 }, editor: { create: (el, options) => {
    let value = options.value;
    const editor = { getValue: () => value, setValue: v => { value = v; }, getContentHeight: () => 100, layout() {},
      onDidContentSizeChange() {}, onDidChangeModelContent() {}, onDidFocusEditorText() {}, addCommand() {} };
    return editor;
  } } };
  return { w, dom, editors };
}
const exercises = () => [
  { id: 1, label: 'add', starter: 'def add(a, b):\n    return a + b', tests: 'assert add(1, 2) == 3', forbiddenImports: [], forbiddenKeywords: [] },
  { id: 2, label: 'square', starter: 'def square(n):\n    pass', tests: 'assert square(3) == 9', forbiddenImports: [], forbiddenKeywords: [] },
];
const result = (w, id) => w.document.querySelector('#py-exercise-' + id + ' .py-exercise-result').textContent;
async function until(predicate, ms = 3000) {
  for (let t = 0; t < ms; t += 10) { if (predicate()) return; await tick(10); }
  throw new Error('timeout');
}

test('editors appear before Python; two checks pressed while it loads keep their own results', async () => {
  const { w, dom } = page(exercises());
  let ready; w.qpyodideInstance = new Promise(resolve => { ready = resolve; });
  w.eval(source);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await until(() => w.document.querySelectorAll('.py-exercise-check').length === 2);
  await tick(20); // editors are created in Monaco's (asynchronous) require callback
  const [a, b] = w.document.querySelectorAll('.py-exercise-check');
  a.click(); b.click();
  ready(fakeInterpreter());
  await until(() => !/Checking/.test(result(w, 1) + result(w, 2)) && result(w, 1) && result(w, 2)).catch(e => { throw new Error('timeout: ' + result(w, 1) + ' | ' + result(w, 2)); });
  assert.match(result(w, 1), /All 1 test passed/);
  assert.match(result(w, 2), /0 of 1/);
  dom.window.close();
});

test('a runtime replaced by pyodide-interaktiv (Stop/restart) is used with its messages set', async () => {
  const { w, dom } = page(exercises().slice(0, 1));
  w.qpyodideInstance = Promise.resolve(fakeInterpreter());
  w.eval(source);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await until(() => w.document.querySelector('.py-exercise-check'));
  await tick(20);
  w.document.querySelector('.py-exercise-check').click();
  await until(() => /passed/.test(result(w, 1)));
  w.mainPyodide = undefined;
  w.qpyodideInstance = Promise.resolve(fakeInterpreter()); // a fresh interpreter: no _msg_* yet
  w.document.querySelector('.py-exercise-result').textContent = '';
  w.document.querySelector('.py-exercise-check').click();
  await until(() => /passed|error/i.test(result(w, 1)));
  assert.match(result(w, 1), /All 1 test passed/);
  dom.window.close();
});

test('an unreachable code editor shows a message instead of an empty page', async () => {
  const { w, dom } = page(exercises(), { monaco: false });
  w.qpyodideInstance = Promise.resolve(fakeInterpreter());
  w.eval(source);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await until(() => w.document.querySelectorAll('.py-exercise-error').length === 2);
  assert.match(w.document.querySelector('#py-exercise-1').textContent, /code editor could not be loaded/);
  dom.window.close();
});
