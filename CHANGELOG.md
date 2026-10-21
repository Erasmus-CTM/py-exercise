# Changes

## Unreleased

- `ctm-bootstrap.lua` is ctm-libs' new copy (CTM Assessment consolidation
  step 3): the bootstrap takes options for pyodide-interaktiv 1.9. py-exercise
  passes none, so its messages and behaviour are unchanged.

## 0.4.0 (CTM Assessment 0.9.0)

py-exercise is a part of CTM Assessment and loads its library ctm-libs for
settings, languages, the page's Python runtime and AI feedback.

### Changed for authors

- **Install CTM Assessment**: a page with py-exercise stops rendering with
  the CTM Assessment install command when the package is missing (component
  development builds set `CTM_COMPONENT_DEV=1`).
- **Norwegian Bokmål**: pages in `nb`, `no` or `nn` get the Bokmål interface
  (before: English), and exercise feedback is written in Bokmål unless the
  exercise sets `feedback-language`. `ctm-assessment: lang` sets the language
  of every component.
- **`show-test-hints: false` written as a YAML boolean now hides the hints**,
  as documented. Before, only the quoted string `"false"` did; the boolean was
  ignored and the hints were shown.
- **Settings combine key by key** across `_quarto.yml`, profiles,
  `_quarto.yml.local`, `_metadata.yml` and the page: a page that sets one
  `py-exercise:` option keeps the project's other options.
- Values other than true or false for `submission`, `show-test-hints` and
  `feedback` warn (they become errors in CTM Assessment 1.0) and keep their
  previous result.
- A site built without AI feedback (`ai-feedback: enabled: false` or
  `CTM_FEEDBACK=off`) has no Feedback button and leaves out what only feedback
  reads; a page with `feedback: true` is named in one build message.
- Teaching policies: `policy-files` and `policy` replace `page-policy-files`,
  `page-policy` and `project-policy`, which keep working with a warning.
- Code, tests and settings that contain `</script>` no longer break the page.

### Unchanged

The exercise syntax, the checks and their messages, grading, and the English
and German texts.

### For maintainers

- Scripts and styles are cacheable HTML dependencies (`py-exercise`,
  `py-exercise-feedback`; the runtime and catalogue from ctm-libs), loaded once
  per page; Pyodide 0.28.3.
- `ctm-bootstrap.lua` is a byte-for-byte copy of ctm-libs'
  `bootstrap/ctm-bootstrap.lua`; `feedback-loader.lua` and
  `shared/pyodide-runtime.js` are gone (now in ctm-libs).
