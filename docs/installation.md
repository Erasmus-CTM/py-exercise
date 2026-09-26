# Installation and setup

[Start here](../README.md) · [Authoring guide](authoring.md)

## Installation

These examples currently use the integration preview. For AI feedback, install
the shared extension once in the same Quarto project:

```sh
quarto add Erasmus-CTM/ai-feedback@feature/scoped-policies
```

Then install this extension:

```bash
quarto add Erasmus-CTM/py-exercise@feature/shared-feedback-integration
```

---


## Feedback setup

For feedback directly on the page, follow the [shared connection guide](https://github.com/Erasmus-CTM/ai-feedback/blob/feature/scoped-policies/docs/installation.md#provider-settings-and-data-sent). Without a connection, Feedback prepares a message to copy into an AI chat.

## Enable feedback in an HTML page

```yaml
filters: [py-exercise]
ai-feedback:
  mode: copy
py-exercise:
  feedback: true
```

Add a `#| task:` line to each exercise so feedback knows what students are being asked to do.
