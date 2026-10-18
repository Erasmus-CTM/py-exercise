-- Locates the optional CTM dependencies (ai-feedback, JSXGraph) without loading
-- them, stops the render when a page uses one that is not installed, and loads
-- the shared ai-feedback module. No feedback implementation is bundled here.
-- Shared file: byte-identical in math-exercise, py-exercise and
-- pyodide-interaktiv (the CTM Assessment build checks this).
local M = {}

local INSTALL = {
  ["ai-feedback"] = "quarto add Erasmus-CTM/ai-feedback",
  jsxgraph = "quarto add jsxgraph/jsxgraph-quarto",
}
-- The file that marks an installed extension, relative to its folder.
local ENTRY = {["ai-feedback"] = "feedback-quarto.lua", jsxgraph = "_extension.yml"}

local function exists(path)
  local file = path and io.open(path, "r")
  if file then file:close(); return true end
  return false
end

local function version(path)
  local file = io.open(pandoc.path.join({pandoc.path.directory(path), "_extension.yml"}), "r")
  local found = file and file:read("*a"):match("\nversion:%s*['\"]?([%w%.%-]+)") or "unknown"
  if file then file:close() end
  return found
end

-- Every installation of `name` in the project: _extensions/<name>/ and
-- _extensions/<owner>/<name>/ (nearest _extensions folder for single files).
local function installations(name)
  local found = {}
  local base = quarto.project.directory or pandoc.path.directory(quarto.doc.input_file)
  while base and base ~= "" do
    local extensions = pandoc.path.join({base, "_extensions"})
    local candidates = {pandoc.path.join({extensions, name, ENTRY[name]})}
    local ok, entries = pcall(pandoc.system.list_directory, extensions)
    if ok then
      for _, owner in ipairs(entries) do
        table.insert(candidates, pandoc.path.join({extensions, owner, name, ENTRY[name]}))
      end
    end
    for _, path in ipairs(candidates) do
      if exists(path) then table.insert(found, path) end
    end
    if #found > 0 or quarto.project.directory then break end
    local parent = pandoc.path.directory(base)
    if parent == base then break end
    base = parent
  end
  return found
end

-- The installation next to this extension (the CTM Assessment package, or one
-- owner folder), which belongs to the same set.
local function sibling(name)
  local here = debug.getinfo(1, "S").source:sub(2):match("^(.*)[/\\][^/\\]+[/\\][^/\\]+$")
  local path = here and pandoc.path.join({here, name, ENTRY[name]})
  return exists(path) and path or nil
end

-- True when `name` is installed for this project (nothing is loaded).
function M.installed(name)
  return sibling(name) ~= nil or #installations(name) > 0
end

-- Which optional dependencies the page's source uses: `.ai-feedback` blocks
-- and `.jsxgraph` code blocks (other references are checked by the consumer).
function M.uses(doc)
  local used = {}
  doc.blocks:walk({
    Div = function(div) if div.classes:includes("ai-feedback") then used["ai-feedback"] = true end end,
    CodeBlock = function(block) if block.classes:includes("jsxgraph") then used.jsxgraph = true end end,
  })
  return used
end

-- Stops the render when the page uses a dependency that is not installed:
-- without it, the blocks would be published as plain text or code.
function M.requireUsed(doc, consumer)
  for name in pairs(M.uses(doc)) do
    if not M.installed(name) then
      local what = name == "jsxgraph" and "JSXGraph boards (`.jsxgraph` blocks)" or "AI feedback activities (`.ai-feedback` blocks)"
      assert(false, consumer .. ": this page uses " .. what .. ", but the " .. name
        .. " extension is not installed. Run: " .. INSTALL[name])
    end
  end
end

-- Loads the shared ai-feedback module.
function M.feedback()
  local near = sibling("ai-feedback")
  local found = near and {} or installations("ai-feedback")
  local chosen = near or found[1]
  assert(chosen, "AI feedback requires the shared extension. Run: " .. INSTALL["ai-feedback"])
  for _, path in ipairs(found) do
    if pandoc.path.normalize(path) ~= pandoc.path.normalize(chosen) and version(path) ~= version(chosen) then
      assert(false, "Multiple ai-feedback installations with different versions: " .. chosen .. " (" .. version(chosen)
        .. ") and " .. path .. " (" .. version(path) .. "). Keep one version.")
    end
  end
  assert(#found <= 1, "Multiple ai-feedback installations found; keep one project installation.")
  -- One page can still combine filters from different installations; they
  -- must then agree on the ai-feedback version (filters share Lua globals).
  local loaded = _G.__ctmAiFeedbackInstallation
  if loaded and pandoc.path.normalize(loaded.path) ~= pandoc.path.normalize(chosen) and loaded.version ~= version(chosen) then
    assert(false, "This page combines filters that use different ai-feedback versions: " .. loaded.path .. " ("
      .. loaded.version .. ") and " .. chosen .. " (" .. version(chosen) .. "). List the filters of one installation "
      .. "(for example only ctm-assessment), or install the same ai-feedback version.")
  end
  _G.__ctmAiFeedbackInstallation = loaded or {path = chosen, version = version(chosen)}
  local shared = dofile(chosen)
  -- Feature check instead of an exact version: any release with scoped policies.
  assert(shared.selection, "Scoped feedback policies require ai-feedback 0.6.0 or later (found " .. chosen
    .. "). Run: " .. INSTALL["ai-feedback"])
  return shared
end

-- Seconds after which a running check offers Stop (worker runtimes only):
-- `<component>: stop-after:` for one component, `ctm-assessment: stop-after:`
-- for all components of a project; default 20.
function M.stopAfter(meta, component)
  for _, key in ipairs({component, "ctm-assessment"}) do
    local cfg = meta[key]
    local value = type(cfg) == "table" and cfg["stop-after"] or nil
    if value ~= nil then
      local seconds = tonumber(pandoc.utils.stringify(value))
      assert(seconds and seconds > 0, key .. ": stop-after must be a number of seconds greater than 0 (found "
        .. pandoc.utils.stringify(value) .. ")")
      return seconds
    end
  end
  return 20
end

-- `dofile("feedback-loader.lua")()` keeps loading ai-feedback, as before.
return setmetatable(M, {__call = function() return M.feedback() end})
