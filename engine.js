/* Pure, deterministic learning rules for Fade Listening.
 * Kept separate from DOM and YouTube code so the policy can be tested or
 * moved to React without changing the product behavior.
 */
(function () {
  const CATEGORY_DEFAULTS = ['vocabulary', 'grammar', 'expression', 'comprehension', 'culture'];

  function chars(value) {
    return Array.from(value || '');
  }

  function getCueAtTime(cues, seconds) {
    if (!Array.isArray(cues) || !cues.length) return null;
    if (seconds < cues[0].start || seconds >= cues[cues.length - 1].end) return null;
    let lo = 0;
    let hi = cues.length - 1;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const cue = cues[mid];
      if (seconds < cue.start) hi = mid - 1;
      else if (seconds >= cue.end) lo = mid + 1;
      else return cue;
    }
    return null;
  }

  function emptySession(contentId) {
    return {
      content_id: contentId,
      mode: 'balanced',
      category_support: CATEGORY_DEFAULTS.reduce((acc, key) => {
        acc[key] = 0.5;
        return acc;
      }, {}),
      concepts: {},
      reveals: [],
      quiz_attempts: [],
      completed_checkpoint_ids: [],
      skipped_checkpoint_ids: []
    };
  }

  function conceptState(session, annotation) {
    const id = annotation.concept_id || annotation.id;
    return session.concepts[id] || { errors: 0, correct: 0, reveals: 0 };
  }

  function importanceWeight(value) {
    return value === 'high' ? 0.9 : value === 'medium' ? 0.45 : 0.1;
  }

  // Lower need = safer to fade. Higher need = should remain visible.
  function hideNeed(annotation, session) {
    const state = conceptState(session, annotation);
    const categorySupport = Number(session.category_support?.[annotation.category] ?? 0.5);
    return (
      categorySupport * 1.7 +
      state.errors * 1.6 +
      state.reveals * 0.8 -
      state.correct * 0.25 +
      Number(annotation.difficulty || 1) * 0.12 +
      importanceWeight(annotation.story_importance)
    );
  }

  function visibleAnnotations(cue, session, mode) {
    const candidates = (cue.annotations || [])
      .filter((annotation) => annotation.hide_eligible && annotation.review_status === 'approved')
      .map((annotation) => ({ annotation, need: hideNeed(annotation, session) }))
      .sort((a, b) => a.need - b.need || a.annotation.id.localeCompare(b.annotation.id));

    if (mode === 'support') return [];
    const budget = mode === 'challenge'
      ? candidates.length
      : Math.max(1, Math.ceil(candidates.length * 0.5));
    return candidates.slice(0, budget).map((item) => item.annotation);
  }

  function renderSegments(cue, session, mode, revealedIds) {
    const source = chars(cue.source_text || '');
    const annotations = visibleAnnotations(cue, session, mode)
      .filter((annotation) => !revealedIds.has(annotation.id))
      .sort((a, b) => a.start_char - b.start_char);
    const parts = [];
    let cursor = 0;
    annotations.forEach((annotation) => {
      if (annotation.start_char < cursor) return;
      parts.push({ type: 'text', value: source.slice(cursor, annotation.start_char).join('') });
      parts.push({ type: 'hidden', value: source.slice(annotation.start_char, annotation.end_char).join(''), annotation });
      cursor = annotation.end_char;
    });
    parts.push({ type: 'text', value: source.slice(cursor).join('') });
    return parts;
  }

  function recordReveal(session, cueId, annotations) {
    annotations.forEach((annotation) => {
      const annotationId = typeof annotation === 'string' ? annotation : annotation.id;
      const conceptId = typeof annotation === 'string' ? annotationId : (annotation.concept_id || annotation.id);
      session.reveals.push({ cue_id: cueId, annotation_id: annotationId, at: Date.now() });
      const cueState = session.concepts[conceptId] || { errors: 0, correct: 0, reveals: 0 };
      cueState.reveals += 1;
      session.concepts[conceptId] = cueState;
    });
  }

  function applyQuiz(session, checkpointId, answers, questions, annotationById = {}) {
    const attempt = { checkpoint_id: checkpointId, answers: [], correct: 0, total: questions.length, at: Date.now() };
    questions.forEach((question, index) => {
      const selected = answers[index];
      const isCorrect = Number(selected) === Number(question.correct_option_index);
      attempt.answers.push({ question_id: question.id, selected, correct: isCorrect });
      if (isCorrect) attempt.correct += 1;
      const related = question.related_annotation_ids || [];
      related.forEach((annotationId) => {
        const annotation = annotationById[annotationId];
        const conceptId = annotation?.concept_id || annotationId;
        const item = session.concepts[conceptId] || { errors: 0, correct: 0, reveals: 0 };
        if (isCorrect) item.correct += 1;
        else item.errors += 1;
        session.concepts[conceptId] = item;
      });
    });
    session.quiz_attempts.push(attempt);
    if (!session.completed_checkpoint_ids.includes(checkpointId)) session.completed_checkpoint_ids.push(checkpointId);
    return attempt;
  }

  function adjustManualMode(session, mode) {
    session.mode = mode;
    return session;
  }

  window.FadeEngine = {
    CATEGORY_DEFAULTS,
    chars,
    getCueAtTime,
    emptySession,
    visibleAnnotations,
    renderSegments,
    recordReveal,
    applyQuiz,
    adjustManualMode,
    conceptState
  };
})();
