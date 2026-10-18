-- Locate the project installation; no feedback implementation is bundled here.
local function version(path)
  local file = io.open(pandoc.path.join({pandoc.path.directory(path), "_extension.yml"}), "r")
  local found = file and file:read("*a"):match("\nversion:%s*['\"]?([%w%.%-]+)") or "unknown"
  if file then file:close() end
  return found
end

local function installations()
  local found = {}
  local base = quarto.project.directory or pandoc.path.directory(quarto.doc.input_file)
  while base and base ~= "" do
    local extensions = pandoc.path.join({base, "_extensions"})
    local candidates = {pandoc.path.join({extensions, "ai-feedback", "feedback-quarto.lua"})}
    local ok, entries = pcall(pandoc.system.list_directory, extensions)
    if ok then
      for _, owner in ipairs(entries) do
        table.insert(candidates, pandoc.path.join({extensions, owner, "ai-feedback", "feedback-quarto.lua"}))
      end
    end
    for _, path in ipairs(candidates) do
      local file = io.open(path, "r")
      if file then file:close(); table.insert(found, path) end
    end
    if #found > 0 or quarto.project.directory then break end
    local parent = pandoc.path.directory(base)
    if parent == base then break end
    base = parent
  end
  return found
end

local function sharedFeedback()
  -- An ai-feedback installed next to this extension (the CTM Assessment
  -- umbrella, or one owner folder) belongs to the same set and wins, so the
  -- umbrella and separately added copies coexist, also in other versions.
  local here = debug.getinfo(1, "S").source:sub(2):match("^(.*)[/\\][^/\\]+[/\\][^/\\]+$")
  local sibling = here and pandoc.path.join({here, "ai-feedback", "feedback-quarto.lua"})
  local file = sibling and io.open(sibling, "r")
  if file then file:close() else sibling = nil end
  local found = sibling and {} or installations()
  local chosen = sibling or found[1]
  assert(chosen, "AI feedback requires the shared extension. Run: quarto add Erasmus-CTM/ai-feedback")
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
  assert(shared.selection, "Scoped feedback policies require ai-feedback 0.6.0 or later (found " .. chosen
    .. "). Run: quarto add Erasmus-CTM/ai-feedback")
  return shared
end
return sharedFeedback
