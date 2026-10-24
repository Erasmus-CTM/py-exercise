// Real component parsing supplies fragments; only the umbrella parses Python.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process'),{install,renderEnv}=require('./helpers/ctm-libs.cjs');
const quarto=process.env.QUARTO_BIN||'quarto';
const skip=spawnSync(quarto,['--version']).error?'Quarto required':false;
test('the late page collector receives exact parsed starter/tests, not options or prose',{skip},()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'py-author-fragments-'));
  try {
    fs.cpSync(path.join(__dirname,'../_extensions/py-exercise'),path.join(dir,'_extensions/py-exercise'),{recursive:true});install(dir);
    fs.writeFileSync(path.join(dir,'collector.lua'),'return {{Meta=function(meta)\n_G.__records={}\n_G.__ctmAuthorImports={add=function(item) table.insert(_G.__records,item) end}\nreturn meta end}}\n');
    fs.writeFileSync(path.join(dir,'report.lua'),'return {{Pandoc=function(doc)\nlocal f=assert(io.open("fragments.json","w")); f:write(quarto.json.encode(_G.__records)); f:close(); return doc end}}\n');
    const starter='import numpy as np\ntext = "import pretend_package"\n# import another_pretend_package';
    const tests='from math import sqrt\nassert np.ones(1)[0] == 1', fence=String.fromCharCode(96).repeat(3);
    fs.writeFileSync(path.join(dir,'page.qmd'),'---\nformat: html\nfilters: [collector.lua, py-exercise, report.lua]\n---\n\nAuthor prose: import prose_package\n\n'+fence+'{py-exercise}\n#| label: task-a\n#| caption: import caption_package\n'+starter+'\n## TESTS ##\n'+tests+'\n'+fence+'\n\n'+fence+'{py-exercise}\nvalue = 3\n'+fence+'\n');
    const r=spawnSync(quarto,['render','page.qmd'],{cwd:dir,env:renderEnv,encoding:'utf8',timeout:120000});
    assert.equal(r.status,0,r.stderr);
    const fragments=JSON.parse(fs.readFileSync(path.join(dir,'fragments.json'),'utf8'));
    assert.deepEqual(fragments,[
      {source:starter,packages:[],origin:'py-exercise:task-a:starter'},
      {source:tests,packages:[],origin:'py-exercise:task-a:tests'},
      {source:'value = 3',packages:[],origin:'py-exercise:py-exercise-2:starter'},
      {source:'',packages:[],origin:'py-exercise:py-exercise-2:tests'}
    ]);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
