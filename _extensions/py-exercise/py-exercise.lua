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
--   def add(a, b):
--       pass
--   ## TESTS ##
--   assert add(1, 2) == 3, "add(1, 2) sollte 3 ergeben"
--   assert add(0, 0) == 0, "add(0, 0) sollte 0 ergeben"
--   ```
----

-- Inject CSS / JS only once per document
local hasExerciseSetup = false

-- Unique counter across all exercises in the document
local exerciseCounter = 0

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
-- Inject the extension's CSS (in <head>) and JS (after <body>) exactly once.
----
local function ensureExerciseSetup()
  if hasExerciseSetup then return end
  hasExerciseSetup = true

  local css = readFile("py-exercise.css")
  quarto.doc.include_text("in-header",
    "<style type=\"text/css\">\n" .. css .. "\n</style>")

  local js = readFile("py-exercise.js")
  quarto.doc.include_text("after-body",
    "<script type=\"text/javascript\">\n" .. js .. "\n</script>")
end

----
-- Parse #| key: value lines from code block text.
-- Returns cleaned code (without #| lines) and a table of options.
----
local function parseBlockOptions(text)
  local opts  = {}
  local lines = {}
  for line in text:gmatch("([^\r\n]*)") do
    local k, v = line:match("^#|%s*(.-):%s*(.-)%s*$")
    if k and v then
      opts[k] = v
    else
      table.insert(lines, line)
    end
  end
  return table.concat(lines, "\n"), opts
end

----
-- Split the code on the ## TESTS ## sentinel line.
-- The sentinel is case-insensitive and allows surrounding whitespace.
-- Returns starterCode, testsCode.  testsCode is "" when no sentinel is found.
----
local function splitCode(code)
  -- Match: everything before a line that is exactly ## TESTS ## (trimmed)
  local starter, tests =
    code:match("^(.-)\n[ \t]*##[ \t]*[Tt][Ee][Ss][Tt][Ss][ \t]*##[ \t]*\n(.-)$")
  if starter then
    return starter:match("^%s*(.-)%s*$"), tests:match("^%s*(.-)%s*$")
  end
  return code:match("^%s*(.-)%s*$"), ""
end

----
-- Main Pandoc filter: transform {py-exercise} code blocks.
----
function CodeBlock(el)
  -- Only produce output for HTML
  if not quarto.doc.is_format("html") then
    return el
  end

  -- Only handle blocks tagged with {py-exercise}
  -- Quarto stores the engine/language class with surrounding braces, e.g. "{py-exercise}"
  if not el.attr.classes:includes("{py-exercise}") then
    return el
  end

  -- Inject CSS + JS once
  ensureExerciseSetup()

  -- Assign unique ID
  exerciseCounter = exerciseCounter + 1
  local divId = "py-exercise-" .. exerciseCounter

  -- Strip #| options and separate starter code from tests
  local code, opts = parseBlockOptions(el.text)
  local starter, tests = splitCode(code)

  -- Build the data payload that the JS will consume
  local exerciseData = {
    id      = exerciseCounter,
    starter = starter,
    tests   = tests,
    label   = opts["label"]   or divId,
    caption = opts["caption"] or nil,
  }

  -- JSON-encode the payload (quarto.json.encode handles all escaping)
  local dataJson = quarto.json.encode(exerciseData)

  -- Emit a placeholder <div> and a tiny inline script that registers this exercise
  -- in the page-global window.__pyExercises array (read by py-exercise.js on load).
  local html = table.concat({
    '<div class="py-exercise-cell" id="' .. divId .. '">',
    '  <noscript>',
    '    Bitte JavaScript aktivieren, um die interaktive Aufgabe zu laden.',
    '  </noscript>',
    '</div>',
    '<script>',
    '(window.__pyExercises = window.__pyExercises || []).push(' .. dataJson .. ');',
    '</script>',
  }, "\n")

  return pandoc.RawBlock("html", html)
end

return {
  { CodeBlock = CodeBlock }
}
