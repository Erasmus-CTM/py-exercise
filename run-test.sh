set -euo pipefail

echo "> tries to render testing HTML (might require a python env with jupyter etc)"
quarto render example-mini.qmd


echo "> run playwright test (can take minutes...)"
npx playwright test
