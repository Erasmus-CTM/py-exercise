// Rendering with ctm-libs, the library of CTM Assessment, and without it
// (needs Quarto; skipped otherwise).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { install, renderEnv } = require('./helpers/ctm-libs.cjs');

const quarto = process.env.QUARTO_BIN || 'quarto';
const skip = spawnSync(quarto, ['--version']).error ? 'Quarto required' : false;
const exercise = '```{py-exercise}\n#| task: Return two.\ndef answer():\n    return 0\n## TESTS ##\nassert answer() == 2\n```\n';
const INSTALL = 'Install CTM Assessment: quarto add https://erasmus-ctm.github.io/ctm-assessment/ctm-assessment.tar.gz';

function render(front, body, { withCtmLibs = true, env = renderEnv } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'py-exercise-render-'));
  fs.cpSync(path.join(__dirname, '../_extensions/py-exercise'), path.join(dir, '_extensions/py-exercise'), { recursive: true });
  if (withCtmLibs) install(dir);
  fs.writeFileSync(path.join(dir, 'page.qmd'), '---\nformat: html\nfilters: [py-exercise]\n' + front + '---\n\n' + body);
  const r = spawnSync(quarto, ['render', 'page.qmd'], { cwd: dir, env, encoding: 'utf8', timeout: 120000 });
  const html = fs.existsSync(path.join(dir, 'page.html')) ? fs.readFileSync(path.join(dir, 'page.html'), 'utf8') : '';
  const files = html ? [...html.matchAll(/<(?:script src|link href)="([^"]*quarto-contrib[^"]*)"/g)].map(m => m[1]) : [];
  const missing = files.filter(file => !fs.existsSync(path.join(dir, file)));
  fs.rmSync(dir, { recursive: true, force: true });
  return { ...r, html, files, missing };
}
const withoutDev = () => { const env = { ...process.env }; delete env.CTM_COMPONENT_DEV; return env; };
const config = html => JSON.parse(html.match(/window\.__pyExerciseConfig = (\{.*?\});/)[1]);

test('with feedback off nothing of AI feedback is loaded', { skip }, () => {
  const r = render('', exercise);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.html, /py-exercise-cell/);
  assert.doesNotMatch(r.html, /feedback-core\.js|py-exercise-feedback/);
});

test('without CTM Assessment or its library ctm-libs the render stops with the install command', { skip }, () => {
  let r = render('', exercise, { withCtmLibs: false, env: withoutDev() });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /py-exercise is part of CTM Assessment, which is not installed in this project/);
  assert.ok(r.stderr.includes(INSTALL), r.stderr);
  r = render('', exercise, { withCtmLibs: false });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /needs its library ctm-libs, which is not installed/);
  assert.ok(r.stderr.includes(INSTALL), r.stderr);
  r = render('', exercise, { env: withoutDev() });
  assert.notEqual(r.status, 0);
  assert.ok(r.stderr.includes(INSTALL), r.stderr);
});

test('a page that uses JSXGraph without the extension stops with its install command', { skip }, () => {
  const r = render('', exercise + '\n```{.jsxgraph}\nvar b = 1;\n```\n');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Run: quarto add jsxgraph\/jsxgraph-quarto/);
});

test('feedback needs the task; text activities are prepared even with exercise feedback off', { skip }, () => {
  let r = render('py-exercise:\n  feedback: true\n', exercise.replace('#| task: Return two.\n', ''));
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /shared feedback requires #\| task:/);
  r = render('', exercise + '\n::: {.ai-feedback}\nExplain.\n:::\n');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.html, /ai-feedback-activity/);
  assert.doesNotMatch(r.html, /py-exercise-feedback/);
});

test('with exercise feedback off, hidden callouts stay out of an activity context', { skip }, () => {
  const body = '::: {.callout-tip .ai-feedback-ignore}\nSECRET SOLUTION 42\n:::\n\n::: {.ai-feedback}\nExplain.\n:::\n';
  const r = render('', exercise + '\n' + body);
  assert.equal(r.status, 0, r.stderr);
  const data = [...r.html.matchAll(/class="ai-feedback-data"[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
  assert.ok(data.length > 0, 'activity data present');
  assert.doesNotMatch(data, /SECRET SOLUTION/);
});

test('stop-after reaches the page, per component or for all components', { skip }, () => {
  let r = render('', exercise);
  assert.match(r.html, /"stopAfter":20/);
  r = render('ctm-assessment:\n  stop-after: 9\n', exercise);
  assert.match(r.html, /"stopAfter":9/);
  r = render('ctm-assessment:\n  stop-after: 9\npy-exercise:\n  stop-after: 7\n', exercise);
  assert.match(r.html, /"stopAfter":7/);
  r = render('py-exercise:\n  stop-after: 0\n', exercise);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /stop-after must be a number of seconds/);
});

test('Norwegian pages get the Bokmål interface; ctm-assessment: lang and py-exercise: lang', { skip }, () => {
  for (const [front, lang] of [['lang: nb\n', 'nb'], ['lang: nn\n', 'nb'], ['lang: no\n', 'nb'], ['lang: de-CH\n', 'de'],
    ['lang: de\nctm-assessment:\n  lang: nb\n', 'nb'], ['lang: de\nctm-assessment:\n  lang: nb\npy-exercise:\n  lang: en\n', 'en'], ['lang: fr\n', 'en']]) {
    const r = render(front, exercise);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(config(r.html).lang, lang, front);
  }
  const r = render('lang: nb\n', exercise);
  assert.match(r.html, /<noscript>\s*Slå på JavaScript for å laste inn den interaktive oppgaven\.\s*<\/noscript>/);
  assert.match(r.html, /<script src="[^"]*\/ctm-locale-py-exercise-[\d.]+\/py-exercise\.js"><\/script>/);
});

test('scripts and styles are cacheable dependencies: once per page, the adapter before the exercise script', { skip }, () => {
  const r = render('py-exercise:\n  feedback: true\n', exercise + '\n' + exercise.replace('answer', 'other'));
  assert.equal(r.status, 0, r.stderr);
  // Shared layout registers the Settings catalogue before the runtime. Keep
  // the complete dependency order strict, including one copy of every file.
  const files = ['ctm-locale-[\\d.]+/ctm-locale\\.js', 'ctm-locale-[\\d.]+/common\\.js',
    'ctm-locale-ui-[\\d.]+/ui\\.js', 'ctm-layout-[\\d.]+/ctm-layout\\.js',
    'ctm-layout-[\\d.]+/ctm-settings\\.js', 'ctm-runtime-[\\d.]+/pyodide-runtime\\.js',
    'ctm-locale-py-exercise-[\\d.]+/py-exercise\\.js',
    'py-exercise-feedback-[\\d.]+/py-exercise-feedback\\.js', 'py-exercise-[\\d.]+/py-exercise\\.js'];
  const order = files.map(file => {
    const found = [...r.html.matchAll(new RegExp('<script src="[^"]*/' + file + '"></script>', 'g'))];
    assert.equal(found.length, 1, file);
    return found[0].index;
  });
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.ok(r.html.indexOf('window.__pyExerciseConfig = ') < order[files.findIndex(file => file.startsWith('py-exercise-feedback-'))]);
  assert.equal((r.html.match(/<link href="[^"]*\/py-exercise-[\d.]+\/py-exercise\.css" rel="stylesheet">/g) || []).length, 1);
  assert.doesNotMatch(r.html, /MathExerciseRuntime = |var LOCALES|<style type="text\/css">/);
  assert.deepEqual(r.missing, []);
});

test('a build without AI feedback leaves out feedback and names feedback: true once; the task is still required', { skip }, () => {
  const off = { ...renderEnv, CTM_FEEDBACK: 'off' };
  let r = render('py-exercise:\n  feedback: true\n', exercise + '\n' + exercise.replace('answer', 'other'), { env: off });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr.match(/AI feedback is off for this build \(CTM_FEEDBACK=off\); left out on this page: py-exercise feedback \(feedback: true in page\.qmd\)/g)?.length, 1, r.stderr);
  assert.equal(config(r.html).feedback, false);
  assert.doesNotMatch(r.html, /feedback-core\.js|py-exercise-feedback|window\.__aiFeedbackConfig =|"task"|"policySelection"|"feedbackContext"|"learnerLevel"|"feedbackLanguage"/);
  r = render('py-exercise:\n  feedback: true\n', exercise.replace('#| task: Return two.\n', ''), { env: off });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /shared feedback requires #\| task:/);
});

test('values accepted loosely before keep their result and warn', { skip }, () => {
  const r = render('py-exercise:\n  submission: yes please\n  show-test-hints: maybe\n', exercise);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /py-exercise: submission must be true or false .*; using false\. This becomes an error in CTM Assessment 1\.0\./);
  assert.match(r.stderr, /py-exercise: show-test-hints must be true or false .*; using true\./);
  assert.equal(config(r.html).submission, false);
  assert.match(r.html, /"showTestHints":true/);
});

test('code, tests and settings with "</script>" stay data: the inline JSON cannot end its script', { skip }, () => {
  const key = 'k</script><script>alert(1)</script>';
  const starter = 'def tag():\n    return "</script><script>alert(2)</script>"';
  const tests = 'assert tag() != "</script><script>alert(3)</script>", "</script><script>alert(4)</script>"';
  const r = render('py-exercise:\n  submission: true\n  submission-key: "' + key + '"\n',
    '```{py-exercise}\n#| label: inject\n#| caption: A </script><script>alert(5)</script> caption\n' + starter + '\n## TESTS ##\n' + tests + '\n```\n');
  assert.equal(r.status, 0, r.stderr);
  // No script of its own: the text stays inside the JSON data.
  const doc = new (require('jsdom').JSDOM)(r.html).window.document;
  assert.deepEqual([...doc.querySelectorAll('script')].filter(script => /^\s*alert\(/.test(script.textContent)), []);
  assert.doesNotMatch(r.html, /<script>alert\(/);
  assert.equal(config(r.html).submissionKey, key);
  const data = JSON.parse(r.html.match(/\(window\.__pyExercises = window\.__pyExercises \|\| \[\]\)\.push\((.*)\);/)[1]);
  assert.equal(data.starter, starter);
  assert.equal(data.tests, tests);
  assert.equal(data.caption, 'A </script><script>alert(5)</script> caption');
});

test('show-test-hints: false hides the hints also as a YAML boolean (it was ignored before 0.4.0)', { skip }, () => {
  const hints = html => JSON.parse(html.match(/\(window\.__pyExercises = window\.__pyExercises \|\| \[\]\)\.push\((.*)\);/)[1]).showTestHints;
  for (const [front, shown] of [['', true], ['py-exercise:\n  show-test-hints: false\n', false], ['py-exercise:\n  show-test-hints: "false"\n', false],
    ['py-exercise:\n  show-test-hints: true\n', true]]) {
    const r = render(front, exercise);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(hints(r.html), shown, front);
  }
  // A cell's own `#| show-test-hints:` still wins.
  const r = render('py-exercise:\n  show-test-hints: false\n', exercise.replace('#| task: Return two.\n', '#| task: Return two.\n#| show-test-hints: true\n'));
  assert.equal(hints(r.html), true);
});


test('store metadata uses authored labels, changes with exercise source and honors save false', { skip }, () => {
  const labeled = exercise.replace('#| task:', '#| label: saved-task\n#| task:');
  const first = render('', labeled);
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.html, /data-ctm-id="saved-task"/);
  assert.match(first.html, /data-ctm-save="true"/);
  assert.match(first.html, /ctm-store-manifest/);
  const hash = first.html.match(/data-ctm-source="([a-f0-9]{16})"/)[1];
  const edited = render('', labeled.replace('return 0', 'return 1'));
  assert.equal(edited.status, 0, edited.stderr);
  assert.notEqual(edited.html.match(/data-ctm-source="([a-f0-9]{16})"/)[1], hash);
  const disabled = render('', labeled.replace('#| label:', '#| save: false\n#| label:'));
  assert.equal(disabled.status, 0, disabled.stderr);
  assert.match(disabled.html, /data-ctm-save="false"/);
});

test('source revisions include effective grading restrictions but exclude page presentation settings', {skip}, () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'py-exercise-source-rules-'));
  try {
    fs.cpSync(path.join(__dirname,'../_extensions/py-exercise'),path.join(dir,'_extensions/py-exercise'),{recursive:true});
    install(dir);
    const body='```{py-exercise}\n#| label: stable-rule-task\n#| task: Sort values.\n#| forbidden-imports: pathlib\n#| forbidden-keywords: eval\nvalues = sorted([2, 1])\n## TESTS ##\nassert values == [1, 2]\n```\n';
    const pages={
      base:'py-exercise:\n  forbidden-imports: []\n  forbidden-keywords: []\n',
      imports:'py-exercise:\n  forbidden-imports: [os]\n  forbidden-keywords: []\n',
      keywords:'py-exercise:\n  forbidden-imports: []\n  forbidden-keywords: [sorted]\n',
      rulesA:'py-exercise:\n  forbidden-imports: [os, sys, os, pathlib]\n  forbidden-keywords: [sorted, exec, sorted, eval]\n',
      rulesB:'py-exercise:\n  forbidden-imports: [sys, os]\n  forbidden-keywords: [exec, sorted]\n',
      display:'lang: de\npy-exercise:\n  forbidden-imports: []\n  forbidden-keywords: []\n  show-test-hints: false\n  submission: true\n  submission-key: changed\n  stop-after: 7\n',
      feedback:'py-exercise:\n  feedback: true\n  forbidden-imports: []\n  forbidden-keywords: []\n'
    };
    fs.writeFileSync(path.join(dir,'_quarto.yml'),'project:\n  type: default\n  render: ['+Object.keys(pages).map(name=>name+'.qmd').join(', ')+']\nfilters: [py-exercise]\nformat: html\n');
    for(const [name,front] of Object.entries(pages)) fs.writeFileSync(path.join(dir,name+'.qmd'),'---\n'+front+'---\n\n'+body);
    const result=spawnSync(quarto,['render'],{cwd:dir,env:renderEnv,encoding:'utf8',timeout:120000});
    assert.equal(result.status,0,result.stderr);
    const hashes=Object.fromEntries(Object.keys(pages).map(name=>{
      const html=fs.readFileSync(path.join(dir,name+'.html'),'utf8');
      assert.match(html,/class="py-exercise-cell"/,name+" renders the production exercise root");
      const hash=html.match(/data-ctm-source="([a-f0-9]{16})"/)?.[1];
      assert.ok(hash,name+' has a rendered source revision');
      return [name,hash];
    }));
    assert.notEqual(hashes.imports,hashes.base,'global imports change the unchanged exercise revision');
    assert.notEqual(hashes.keywords,hashes.base,'global keyword rules change the unchanged exercise revision');
    assert.equal(hashes.rulesA,hashes.rulesB,'ordering and duplicate global/per-cell rules do not change grading');
    assert.equal(hashes.display,hashes.base,'language, hints, submission and stop timing are not grading rules');
    assert.equal(hashes.feedback,hashes.base,'feedback settings are not grading rules');
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
