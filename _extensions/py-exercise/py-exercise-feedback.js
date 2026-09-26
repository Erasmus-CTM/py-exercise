/* Shared AI Feedback adapter for py-exercise — AGPL-3.0-or-later. */
(function (root) {
  'use strict';
  function attach(options) {
    const F = root.AIFeedback;
    if (!F?.applyPolicy) {
      const disabled = document.createElement('button');
      disabled.type = 'button'; disabled.className = 'btn btn-light py-exercise-feedback';
      disabled.textContent = 'Feedback'; disabled.disabled = true; options.buttonBar.append(disabled);
      const notice = document.createElement('div'); notice.className = 'py-exercise-feedback-output';
      notice.textContent = 'Python feedback requires ai-feedback 0.4.0 or later. Update the extension and render again. Check remains available.';
      options.container.append(notice);
      return {invalidate() {}, reset() {}, dispose() {notice.remove(); disabled.remove();}};
    }
    const locale = F.locales[options.uiLanguage] || F.locales.en;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-light py-exercise-feedback';
    button.textContent = locale.button;
    const output = document.createElement('div');
    output.className = 'py-exercise-feedback-output ai-feedback-output';
    output.setAttribute('aria-live', 'polite');
    options.buttonBar.append(button, F.settingsButton(options.uiLanguage));
    options.container.append(output);
    const adapter = F.attach({
      integration: 'py-exercise', id: 'py-exercise-' + options.label,
      button, output, uiLanguage: options.uiLanguage,
      getRequest: () => {
        const code = options.getCode();
        const snapshot = options.getAssessment();
        const evidence = [];
        // Allowlist facts from a check of this exact editor version. Never send
        // the exercise object, tests, assertion messages or traceback.
        if (snapshot && snapshot.code === code) {
          const result = snapshot.result;
          evidence.push({label: 'Checker status', text: result.status});
          if (result.status === 'checked') evidence.push({label: 'Checks passed', text: result.passed + ' of ' + result.total});
          if (result.stdout) evidence.push({label: 'Learner code output', text: result.stdout});
        }
        const criteria = [];
        if (options.forbiddenImports.length) criteria.push('Do not import: ' + options.forbiddenImports.join(', ') + '.');
        if (options.forbiddenKeywords.length) criteria.push('Do not use: ' + options.forbiddenKeywords.join(', ') + '.');
        return {
          profile: 'python', task: options.task,
          responses: [{id: 'code', format: 'code', language: 'python', value: code}],
          criteria, evidence, learner: {level: options.learnerLevel},
          feedback: {language: options.feedbackLanguage, mode: 'review', maxIssues: 3, allowFullRewrite: false}
        };
      }
    });
    return {
      invalidate() { adapter.cancel({clearOutput: true}); },
      reset(reason) { adapter.reset(reason); },
      dispose() { adapter.dispose(); }
    };
  }
  root.PyExerciseFeedback = {attach};
})(globalThis);
