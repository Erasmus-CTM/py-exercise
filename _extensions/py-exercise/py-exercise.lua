----
-- py-exercise.lua
--
-- Quarto filter extension for interactive Python exercises with hidden unit tests.
-- Depends on the coatless-quarto/pyodide extension for the Pyodide runtime and
-- Monaco editor. Declare both filters in the document (pyodide first, py-exercise second).
--
-- Syntax:
--
--   ```{py-exercise}
--   #| label: my-task
--   #| caption: Aufgabe 1 – Addition
--   #| forbidden-imports: os, sys
--   #| forbidden-keywords: sorted, for
--   def add(a, b):
--       pass
--   ## TESTS ##
--   assert add(1, 2) == 3, "add(1, 2) sollte 3 ergeben"
--   assert add(0, 0) == 0, "add(0, 0) sollte 0 ergeben"
--   ```
--
-- Global options in YAML front matter:
--
--   py-exercise:
--     forbidden-imports: [os, sys]
--     forbidden-keywords: [sorted, for]
--     submission: true
--     submission-key: "my-secret-key"
----

-- Inject CSS / JS only once per document
local hasExerciseSetup = false

-- Unique counter across all exercises in the document
local exerciseCounter = 0

-- Global forbidden lists (read from document Meta, applied to every exercise)
local globalForbiddenImports  = {}
local globalForbiddenKeywords = {}

-- Submission mode
local submissionEnabled = false
local submissionKey     = "py-exercise"

-- Whether failed tests reveal their assertion message (default: true)
local globalShowTestHints = true

-- Language / locale (default: English)
local lang = "en"

-- Noscript messages per locale
local noscriptMessages = {
  en = "Please enable JavaScript to load the interactive exercise.",
  de = "Bitte JavaScript aktivieren, um die interaktive Aufgabe zu laden.",
}

----
-- Helper: read a file that lives next to this .lua filter
----
local function readFile(filename)
  local path = quarto.utils.resolve_path(filename)
  local f = io.open(path, "r")
  if not f then
    error("py-exercise: cannot open '" .. filename ..
          "' – make sure it is present in the _extensions/py-exercise/ directory.")
  end
  local content = f:read("*a")
  f:close()
  return content
end

----
-- Helper: convert a Pandoc MetaList or scalar Meta value to a plain Lua list of strings.
----
local function metaToList(value)
  local result = {}
  if not value then return result end
  if type(value) == "table" and value[1] ~= nil then
    for _, item in ipairs(value) do
      local s = pandoc.utils.stringify(item):match("^%s*(.-)%s*$")
      if s ~= "" then table.insert(result, s) end
    end
  else
    local s = pandoc.utils.stringify(value)
    for item in s:gmatch("[^,]+") do
      local trimmed = item:match("^%s*(.-)%s*$")
      if trimmed ~= "" then table.insert(result, trimmed) end
    end
  end
  return result
end

----
-- Helper: split a comma-separated #| option string into a list of trimmed strings.
----
local function splitCommaList(str)
  local result = {}
  if not str or str == "" then return result end
  for item in str:gmatch("[^,]+") do
    local trimmed = item:match("^%s*(.-)%s*$")
    if trimmed ~= "" then table.insert(result, trimmed) end
  end
  return result
end

----
-- Helper: merge two lists, deduplicating by value.
----
local function mergeLists(base, extra)
  local seen   = {}
  local result = {}
  for _, v in ipairs(base) do
    if not seen[v] then seen[v] = true; table.insert(result, v) end
  end
  for _, v in ipairs(extra) do
    if not seen[v] then seen[v] = true; table.insert(result, v) end
  end
  return result
end

----
-- Inject the extension's CSS (in <head>) and JS (after <body>) exactly once.
-- Also injects the runtime config object into before-body.
----
local function ensureExerciseSetup()
  if hasExerciseSetup then return end
  hasExerciseSetup = true

  -- CSS
  local css = readFile("py-exercise.css")
  quarto.doc.include_text("in-header",
    "<style type=\"text/css\">\n" .. css .. "\n</style>")

  -- Runtime config – must land before py-exercise.js runs (before-body < after-body)
  local config = {
    submission    = submissionEnabled,
    submissionKey = submissionKey,
    lang          = lang,
  }
  quarto.doc.include_text("before-body",
    "<script>window.__pyExerciseConfig = " .. quarto.json.encode(config) .. ";</script>")

  -- JS
  local js = readFile("py-exercise.js")
  quarto.doc.include_text("after-body",
    "<script type=\"text/javascript\">\n" .. js .. "\n</script>")
end

----
-- Phase 1 – Meta: read global options from document YAML front matter.
----
function Meta(meta)
  if not meta["py-exercise"] then return meta end
  local cfg = meta["py-exercise"]

  globalForbiddenImports  = metaToList(cfg["forbidden-imports"])
  globalForbiddenKeywords = metaToList(cfg["forbidden-keywords"])

  if cfg["submission"] then
    submissionEnabled = (pandoc.utils.stringify(cfg["submission"]) == "true")
  end
  if cfg["submission-key"] then
    submissionKey = pandoc.utils.stringify(cfg["submission-key"])
  end

  if cfg["show-test-hints"] then
    globalShowTestHints = not (pandoc.utils.stringify(cfg["show-test-hints"]) == "false")
  end
  if cfg["lang"] then
    lang = pandoc.utils.stringify(cfg["lang"])
  end

  return meta
end

----
-- Phase 2 – CodeBlock: transform {py-exercise} code blocks.
----
function CodeBlock(el)
  if not quarto.doc.is_format("html") then return el end
  if not el.attr.classes:includes("{py-exercise}") then return el end

  ensureExerciseSetup()

  exerciseCounter = exerciseCounter + 1
  local divId = "py-exercise-" .. exerciseCounter

  local code, opts = parseBlockOptions(el.text)
  local starter, tests = splitCode(code)

  local cellForbiddenImports  = splitCommaList(opts["forbidden-imports"])
  local cellForbiddenKeywords = splitCommaList(opts["forbidden-keywords"])
  local forbiddenImports  = mergeLists(globalForbiddenImports,  cellForbiddenImports)
  local forbiddenKeywords = mergeLists(globalForbiddenKeywords, cellForbiddenKeywords)

  -- Per-cell show-hints: "false" disables hints; anything else (or absent) keeps global default
  local cellShowTestHints = globalShowTestHints
  if opts["show-test-hints"] then
    cellShowTestHints = not (opts["show-test-hints"] == "false")
  end

  local exerciseData = {
    id                = exerciseCounter,
    starter           = starter,
    tests             = tests,
    label             = opts["label"]   or divId,
    caption           = opts["caption"] or nil,
    forbiddenImports  = forbiddenImports,
    forbiddenKeywords = forbiddenKeywords,
    showTestHints     = cellShowTestHints,
  }

  local dataJson = quarto.json.encode(exerciseData)

  local noscriptMsg = noscriptMessages[lang] or noscriptMessages["en"]
  local html = table.concat({
    '<div class="py-exercise-cell" id="' .. divId .. '">',
    '  <noscript>',
    '    ' .. noscriptMsg,
    '  </noscript>',
    '</div>',
    '<script>',
    '(window.__pyExercises = window.__pyExercises || []).push(' .. dataJson .. ');',
    '</script>',
  }, "\n")

  return pandoc.RawBlock("html", html)
end

----
-- Helper: parse #| key: value lines
----
function parseBlockOptions(text)
  local opts  = {}
  local lines = {}
  for line in text:gmatch("([^\r\n]*)") do
    local k, v = line:match("^#|%s*(.-):%s*(.-)%s*$")
    if k and v then opts[k] = v
    else table.insert(lines, line) end
  end
  return table.concat(lines, "\n"), opts
end

----
-- Helper: split on ## TESTS ## sentinel
----
function splitCode(code)
  local starter, tests =
    code:match("^(.-)\n[ \t]*##[ \t]*[Tt][Ee][Ss][Tt][Ss][ \t]*##[ \t]*\n(.-)$")
  if starter then
    return starter:match("^%s*(.-)%s*$"), tests:match("^%s*(.-)%s*$")
  end
  return code:match("^%s*(.-)%s*$"), ""
end

return {
  { Meta = Meta },
  { CodeBlock = CodeBlock },
}
