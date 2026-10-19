-- py-exercise is a part of CTM Assessment. Its library ctm-libs (settings,
-- languages, the Python runtime, AI feedback, the JSXGraph check) is found by
-- the canonical bootstrap, which stops the render with the install command
-- when CTM Assessment is missing.
local ctm = dofile(quarto.utils.resolve_path("ctm-bootstrap.lua"))("py-exercise")

-- Decided per page in the first pass: ctm-libs' feedback preparation runs for
-- exercise feedback or for `.ai-feedback` activities on the page; not otherwise.
local needFeedback = false
-- Seconds after which a running check offers Stop (stop-after).
local stopAfter = 20
----
-- py-exercise.lua
--
-- Quarto filter extension for interactive Python exercises with hidden unit tests.
-- Works standalone (loads Pyodide + Monaco from CDN automatically) or combined with
-- a Pyodide extension (coatless-quarto/pyodide, Erasmus-CTM/pyodide-feedback) —
-- in that case declare the Pyodide filter first, py-exercise second.
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
-- AI feedback for the exercises: `py-exercise: feedback: true` asks for it
-- (feedbackWanted, where it is set: feedbackOrigin); a build without AI
-- feedback (P22) refuses it (feedbackEnabled).
local feedbackWanted, feedbackOrigin, feedbackEnabled = false, nil, false

-- Language / locale (default: English)
local lang = "en"

-- Supported locales. Extend this set together with LOCALES in py-exercise.js.
local supportedLangs = {
  ["en"] = true,
  ["de"] = true
}

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
    -- assert: Quarto replaces error() with a logger that does not stop the render.
    assert(false, "py-exercise: cannot open '" .. filename ..
          "' – make sure it is present in the _extensions/py-exercise/ directory.")
  end
  local content = f:read("*a")
  f:close()
  return content
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
-- Helper: parse #| key: value lines
----
local function parseBlockOptions(text)
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
local function splitCode(code)
  local starter, tests =
    code:match("^(.-)\n[ \t]*##[ \t]*[Tt][Ee][Ss][Tt][Ss][ \t]*##[ \t]*\n(.-)$")
  if starter then
    return starter:match("^%s*(.-)%s*$"), tests:match("^%s*(.-)%s*$")
  end
  return code:match("^%s*(.-)%s*$"), ""
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
    feedback      = feedbackEnabled,
    stopAfter     = stopAfter,
  }
  quarto.doc.include_text("before-body",
    "<script>window.__pyExerciseConfig = " .. quarto.json.encode(config) .. ";</script>")

  -- JS
  local js = readFile("shared/pyodide-runtime.js") .. "\n"
    .. (feedbackEnabled and (readFile("py-exercise-feedback.js") .. "\n") or "") .. readFile("py-exercise.js")
  quarto.doc.include_text("after-body",
    "<script type=\"text/javascript\">\n" .. js .. "\n</script>")
end

----
-- Determine the UI language for this render pass.
--
-- Order of precedence:
--   1. `py-exercise: lang: xx`  – explicit override
--   2. Quarto's own `lang:`     – set per profile in a multilingual project
--   3. "en"                     – fallback
--
-- Region subtags are dropped ("de-DE" -> "de"); unsupported languages fall
-- back to English instead of failing the render.
----
local function resolveLang(meta)
  local raw = nil

  local cfg = meta["py-exercise"]
  if cfg and cfg["lang"] then
    raw = pandoc.utils.stringify(cfg["lang"])
  elseif meta["lang"] then
    raw = pandoc.utils.stringify(meta["lang"])
  end

  if raw == nil or raw == "" then
    return "en"
  end

  local base = raw:lower():match("^(%a+)")
  if base and supportedLangs[base] then
    return base
  end

  return "en"
end

----
-- Phase 1 – Meta: read the page's settings. ctm-libs combines them key by key
-- across _quarto.yml, profiles, _metadata.yml and the front matter.
----
local function Meta(meta)
  if not quarto.doc.is_format("html") then return meta end
  ctm.settings.load(meta)
  -- The language must also work for documents that only set Quarto's `lang:`.
  lang = resolveLang(meta)
  -- `py-exercise: stop-after`, `ctm-assessment: stop-after`, 20 seconds.
  stopAfter = ctm.runtime.stopAfter("py-exercise")

  globalForbiddenImports  = ctm.settings.list("py-exercise", "forbidden-imports")
  globalForbiddenKeywords = ctm.settings.list("py-exercise", "forbidden-keywords")
  -- true or false; other values (accepted loosely before) warn and use the default.
  feedbackWanted, feedbackOrigin = ctm.settings.bool("py-exercise", "feedback", {loose = true, default = false})
  submissionEnabled = ctm.settings.bool("py-exercise", "submission", {loose = true, default = false})
  submissionKey = ctm.settings.string("py-exercise", "submission-key", {default = "py-exercise"})
  globalShowTestHints = ctm.settings.bool("py-exercise", "show-test-hints", {loose = true, default = true})
  return meta
end

----
-- Phase 2 – CodeBlock: transform {py-exercise} code blocks.
----
local function CodeBlock(el)
  if not quarto.doc.is_format("html") then return el end
  if not el.attr.classes:includes("{py-exercise}") then return el end

  ensureExerciseSetup()

  exerciseCounter = exerciseCounter + 1
  local divId = "py-exercise-" .. exerciseCounter

  local code, opts = parseBlockOptions(el.text)
  local starter, tests = splitCode(code)
  -- Asked for, feedback needs the task, also in a build without AI feedback
  -- (both builds fail alike).
  if feedbackWanted and (not opts["task"] or opts["task"] == "") then
    assert(false, "py-exercise: shared feedback requires #| task: with the learner's assignment.")
  end

  local cellForbiddenImports  = splitCommaList(opts["forbidden-imports"])
  local cellForbiddenKeywords = splitCommaList(opts["forbidden-keywords"])
  local forbiddenImports  = mergeLists(globalForbiddenImports,  cellForbiddenImports)
  local forbiddenKeywords = mergeLists(globalForbiddenKeywords, cellForbiddenKeywords)

  -- Per-cell show-hints: "false" disables hints; anything else (or absent) keeps global default
  local cellShowTestHints = globalShowTestHints
  if opts["show-test-hints"] then
    cellShowTestHints = not (opts["show-test-hints"] == "false")
  end

  -- The policy name is checked whenever feedback is asked for; a build without
  -- AI feedback (P22) leaves out every field that only AI feedback reads.
  local selection = feedbackWanted and ctm.feedback.selection(el, opts) or nil
  local ai = ctm.feedback.enabled()
  local exerciseData = {
    id                = exerciseCounter,
    starter           = starter,
    tests             = tests,
    label             = opts["label"]   or divId,
    caption           = opts["caption"] or nil,
    forbiddenImports  = forbiddenImports,
    forbiddenKeywords = forbiddenKeywords,
    showTestHints     = cellShowTestHints,
    task              = ai and opts["task"] or nil,
    policySelection   = feedbackEnabled and selection or nil,
    feedbackContext   = feedbackEnabled and ctm.feedback.context(el, opts) or nil,
    feedbackLanguage  = ai and (opts["feedback-language"] or lang) or nil,
    learnerLevel      = ai and (opts["learner-level"] or "") or nil,
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

return {
  { Meta = Meta },
  -- A page that uses JSXGraph without the extension stops here; then decide
  -- whether AI feedback is needed, before callouts are marked for it.
  { Pandoc = function(doc)
      if not quarto.doc.is_format("html") then return doc end
      ctm.deps.requireUsed(doc, "py-exercise")
      local exercises = false
      doc.blocks:walk({CodeBlock = function(b) if b.classes:includes("{py-exercise}") then exercises = true end end})
      -- A build without AI feedback refuses it and names it in its build message.
      feedbackEnabled = ctm.feedback.request("py-exercise", feedbackWanted and exercises,
        "feedback: true" .. (feedbackOrigin and (" in " .. feedbackOrigin) or ""))
      needFeedback = feedbackWanted or ctm.deps.uses(doc)["ai-feedback"] == true
      return doc
    end },
  { Callout = function(c)
      if needFeedback and quarto.doc.is_format("html") then
        return ctm.feedback.markCallout(c)
      end
      return c
    end },
  { Pandoc = function(doc)
      if needFeedback and quarto.doc.is_format("html") then
        return ctm.feedback.prepare(doc)
      end
      return doc
    end },
  { CodeBlock = CodeBlock },
}
