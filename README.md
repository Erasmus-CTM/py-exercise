# py-exercise – Quarto Extension

**Interactive Python coding exercises with hidden unit tests, running entirely in the browser** —
no server, no backend. Students edit starter code in a Monaco editor; hidden `assert` tests
run automatically on click via [Pyodide](https://pyodide.org) (Python in WebAssembly).
Supports forbidden-construct checks, optional submission export, and multilingual UI.

---

Interaktive Python-Programmieraufgaben mit versteckten Unit-Tests, die vollständig
im Browser ausgeführt werden – kein Server, kein Backend, nur clientseitiges
[Pyodide](https://pyodide.org) + [Monaco Editor](https://microsoft.github.io/monaco-editor/).

Studierende sehen Startercode und bearbeiten ihn im Editor. Die versteckten Tests
werden beim Klick auf **Ausführen & Testen** automatisch geprüft.
Optionale Abgabe kodiert Ergebnisse sicher für den Dozenten.

---

## Installation

```bash
quarto add Erasmus-CTM/Py-Exercise
```

---

## Einbinden

**Standalone** (kein zusätzlicher Filter nötig – Pyodide und Monaco Editor werden automatisch
von CDN geladen):

```yaml
filters:
  - Erasmus-CTM/py-exercise
```

**Kombiniert mit einer Pyodide-Extension** (empfohlen, wenn auf derselben Seite schon eine
Pyodide-Extension aktiv ist – verhindert doppeltes Laden der Runtime):

```yaml
filters:
  - coatless-quarto/pyodide       # oder Erasmus-CTM/pyodide-feedback
  - Erasmus-CTM/py-exercise       # muss nach der Pyodide-Extension stehen
```

---

## Grundsyntax

````markdown
```{py-exercise}
#| label: aufgabe-1
#| caption: Addition implementieren
def add(a, b):
    pass

## TESTS ##
assert add(1, 2) == 3,   "add(1, 2) sollte 3 ergeben"
assert add(0, 0) == 0,   "add(0, 0) sollte 0 ergeben"
assert add(-1, 1) == 0,  "add(-1, 1) sollte 0 ergeben"
```
````

Alles **oberhalb** von `## TESTS ##` wird dem Studierenden angezeigt.  
Alles **unterhalb** ist versteckt und wird nach dem Ausführen automatisch geprüft.

---

## Zell-Optionen (`#|`)

| Option | Typ | Standard | Beschreibung |
|--------|-----|----------|--------------|
| `label` | String | `py-exercise-N` | Eindeutige ID der Aufgabe |
| `caption` | String | — | Titel über der Aufgabe |
| `forbidden-imports` | kommasepariert | — | Verbotene `import`-Anweisungen |
| `forbidden-keywords` | kommasepariert | — | Verbotene Python-Schlüsselwörter |
| `show-test-hints` | `true` / `false` | `true` | Assertion-Nachricht bei Fehler anzeigen |

---

## Globale Optionen (YAML-Frontmatter)

Gelten für alle Aufgaben im Dokument, können auf Zellebene überschrieben werden:

```yaml
py-exercise:
  forbidden-imports: [os, sys, subprocess]
  forbidden-keywords: [for, while, sorted]
  show-test-hints: true
  submission: true
  submission-key: "mein-geheimer-schluessel"
  lang: de
```

| Option | Standard | Beschreibung |
|--------|----------|--------------|
| `forbidden-imports` | `[]` | Verbotene Imports für alle Aufgaben |
| `forbidden-keywords` | `[]` | Verbotene Schlüsselwörter für alle Aufgaben |
| `show-test-hints` | `true` | Assertion-Nachricht bei fehlgeschlagenen Tests |
| `submission` | `false` | Abgabe-Modus aktivieren |
| `submission-key` | `"py-exercise"` | XOR-Schlüssel für die Ergebniskodierung |
| `lang` | `"en"` | Sprache der Benutzeroberfläche (`"de"` oder `"en"`) |

---

## Sprache der Oberfläche

Unterstützt werden derzeit **Deutsch (`de`)** und **Englisch (`en`)**.
**Standard ist Englisch** – ohne Angabe erscheint die Oberfläche englisch.

Die Extension liest in dieser Reihenfolge:

1. `py-exercise: lang:` – expliziter Override
2. **Quartos eigenes `lang:`** – der Normalfall
3. `en` – Fallback

Es genügt also Quartos Standard-Schlüssel, eine Extra-Option ist nicht nötig:

```yaml
---
title: "Python-Übungen"
lang: de
filters:
  - Erasmus-CTM/py-exercise
---
```

Regionalvarianten werden gekürzt (`de-DE` → `de`). Eine nicht unterstützte
Sprache (z. B. `fr`) fällt still auf Englisch zurück und bricht das Rendern
**nicht** ab.

Übersetzt sind Knöpfe, Testergebnisse, Abgabe- und Download-Bereich sowie die
Meldungen der Regelprüfung (verbotene Imports usw.) – letztere werden dafür in
die Python-Umgebung übergeben.

### Mehrsprachige Projekte

Da die Sprache aus Quartos `lang:` kommt, ist die Extension ohne Zusatzaufwand
mit mehrsprachigen Setups kompatibel. Bei einem Aufbau über Quarto-Profile
genügt je ein `lang:` pro Profil:

```yaml
# _quarto-de.yml
project:
  output-dir: docs/de
lang: de
```

```yaml
# _quarto-en.yml
project:
  output-dir: docs/en
lang: en
```

Jede Sprache ist ein eigener Render-Durchlauf; die Texte stehen danach fest im
jeweiligen HTML. Ein Sprachumschalter, der auf die andere Fassung verlinkt,
wechselt damit automatisch auch die Sprache der Extension.

### Weitere Sprache ergänzen

1. In `_extensions/py-exercise/py-exercise.js` einen `LOCALES`-Block nach dem
   Vorbild von `de` anlegen (alle Schlüssel übernehmen).
2. In `py-exercise.lua` den Sprachcode zu `supportedLangs` hinzufügen und die
   Tabelle `noscriptMessages` ergänzen.

---

## Regelprüfung

Wenn ein Studierender verbotene Konstrukte verwendet, wird der Code **nicht ausgeführt**
und stattdessen eine Fehlermeldung angezeigt.

```yaml
# Aufgabenspezifisch:
#| forbidden-imports: os, sys
#| forbidden-keywords: for, while, lambda
```

Typische Anwendungsfälle:
- `for`/`while` verbieten → Lösung muss mit Listenkomprehension oder `map` arbeiten
- `sorted` verbieten → eigener Sortieralgorithmus gefordert
- `os`, `sys`, `subprocess` verbieten → Sicherheit in Lernumgebungen

---

## Abgabe-Modus

Mit `submission: true` erscheint ein Abgabe-Header mit Eingabefeldern für
**Matrikelnummer** und **Quiz-ID**. Nach erfolgreich bestandenen Tests
kann der Studierende das Ergebnis als **JSON-Datei herunterladen**.

Die Ergebnisse werden mit dem `submission-key` XOR-kodiert und Base64-encodiert,
sodass Rohergebnisse nicht ohne den Schlüssel lesbar sind.

```yaml
py-exercise:
  submission: true
  submission-key: "sose25-quiz1"
```

---

## Testausgabe

Jeder Test zeigt nach dem Ausführen:

- ✅ **Bestanden** – Test erfolgreich
- ❌ **Fehlgeschlagen** – mit der Assertion-Nachricht (wenn `show-test-hints: true`)

Die Assertion-Nachricht ist der Text nach dem Komma in `assert ..., "Nachricht"`.
Wird `show-test-hints: false` gesetzt, sehen Studierende nur ob ein Test fehl-
geschlagen ist, ohne Hinweis auf den Grund.

---

## Vollständiges Beispiel

````markdown
---
title: "Python Übungen – SoSe 2025"
filters:
  - coatless-quarto/pyodide
  - Erasmus-CTM/py-exercise
py-exercise:
  submission: true
  submission-key: "sose25-final"
  lang: de
---

```{py-exercise}
#| label: fibonacci
#| caption: Fibonacci-Folge
#| forbidden-keywords: for, while
Implementiere eine rekursive Funktion `fib(n)`,
die die n-te Fibonacci-Zahl zurückgibt (fib(0) = 0, fib(1) = 1).

def fib(n):
    pass

## TESTS ##
assert fib(0) == 0,  "fib(0) sollte 0 ergeben"
assert fib(1) == 1,  "fib(1) sollte 1 ergeben"
assert fib(6) == 8,  "fib(6) sollte 8 ergeben"
assert fib(10) == 55, "fib(10) sollte 55 ergeben"
```
````

---

## Abhängigkeiten

| Abhängigkeit | Zweck |
|---|---|
| Pyodide 0.27+ (CDN) | Wird automatisch geladen (standalone) |
| Monaco Editor 0.46+ (CDN) | Wird automatisch geladen (standalone) |
| [coatless-quarto/pyodide](https://github.com/coatless-quarto/pyodide) oder [Erasmus-CTM/Pyodide-Feedback](https://github.com/Erasmus-CTM/Pyodide-Feedback) | Optional – verhindert doppeltes Laden der Runtime |
