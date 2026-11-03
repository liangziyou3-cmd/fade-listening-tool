/* Pure, deterministic subtitle selection rules for Fade Listening. */
(function () {
  const LEVEL_LABELS = {
    0: 'Full Subtitles',
    1: 'A1 (Approx.)',
    2: 'A2 (Approx.)',
    3: 'B1-B2 (Approx.)',
    4: 'C1-C2 (Approx.)'
  };
  const CATEGORY_PRIORITY = [
    'fixed_expression', 'idiom', 'collocation', 'grammar_pattern',
    'noun', 'verb', 'adjective', 'adverb', 'other'
  ];
  const CATEGORY_RANK = new Map(CATEGORY_PRIORITY.map((category, index) => [category, index]));

  function compareIds(a, b) {
    const left = String(a ?? '');
    const right = String(b ?? '');
    return left < right ? -1 : left > right ? 1 : 0;
  }

  function chars(value) {
    return Array.from(value || '');
  }

  function isLanguageCharacter(value) {
    return /[\p{L}\p{M}\p{N}]/u.test(value || '');
  }

  function languageCharacterCount(value) {
    return chars(value).reduce((count, character) => count + (isLanguageCharacter(character) ? 1 : 0), 0);
  }

  function spansOverlap(a, b) {
    return a.start_char < b.end_char && b.start_char < a.end_char;
  }

  // Agent cues can overlap in time. Prefer the cue that started most recently,
  // then use sequence/id as a stable tie-breaker.
  function getCueAtTime(cues, seconds) {
    if (!Array.isArray(cues)) return null;
    return cues
      .map((cue, index) => ({ cue, index }))
      .filter(({ cue }) => Number.isFinite(cue.start) && Number.isFinite(cue.end) && seconds >= cue.start && seconds < cue.end)
      .sort((a, b) => b.cue.start - a.cue.start || Number(b.cue.sequence || 0) - Number(a.cue.sequence || 0) || compareIds(b.cue.id, a.cue.id) || b.index - a.index)[0]?.cue || null;
  }

  function emptySession(contentId) {
    return {
      content_id: contentId,
      fade_level: 1,
      learning_style: 'hide',
      concepts: {},
      reveals: [],
      quiz_attempts: [],
      completed_checkpoint_ids: [],
      skipped_checkpoint_ids: []
    };
  }

  function conceptState(session, annotation) {
    const id = annotation?.concept_id || annotation?.id;
    return session?.concepts?.[id] || { errors: 0, correct: 0, reveals: 0 };
  }

  function annotationIsValid(text, annotation) {
    const source = chars(text || '');
    if (!annotation || !Number.isInteger(annotation.start_char) || !Number.isInteger(annotation.end_char)) return false;
    if (annotation.start_char < 0 || annotation.end_char <= annotation.start_char || annotation.end_char > source.length) return false;
    if (annotation.text != null && source.slice(annotation.start_char, annotation.end_char).join('') !== String(annotation.text)) return false;
    return true;
  }

  function candidateSort(a, b) {
    const category = (CATEGORY_RANK.get(String(a.category || 'other').toLowerCase()) ?? CATEGORY_RANK.get('other')) -
      (CATEGORY_RANK.get(String(b.category || 'other').toLowerCase()) ?? CATEGORY_RANK.get('other'));
    return category || (a.end_char - a.start_char) - (b.end_char - b.start_char) ||
      compareIds(a.concept_id, b.concept_id) ||
      compareIds(a.occurrence_id || a.id, b.occurrence_id || b.id);
  }

  function stableHash(value) {
    let hash = 2166136261;
    for (const character of String(value)) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function normalizeLevel(level) {
    return Math.max(0, Math.min(4, Number(level) || 0));
  }

  function normalizeDensity(density) {
    return Math.max(0, Math.min(4, Number(density) || 0));
  }

  function validCandidates(cue, level, display) {
    if (!cue || level === 0) return [];
    const isTranslation = display === 'translation';
    const source = isTranslation ? cue.translation_text || '' : cue.source_text || '';
    const sourceAnnotations = isTranslation ? cue.translation_annotations || [] : cue.annotations || [];
    return sourceAnnotations
      .filter(annotation => annotationIsValid(source, annotation) && Number(annotation.difficulty) >= 1 && Number(annotation.difficulty) <= level)
      .sort(candidateSort);
  }

  function resolveOverlaps(candidates) {
    const selected = [];
    for (const candidate of candidates) {
      if (!selected.some(item => spansOverlap(item, candidate))) selected.push(candidate);
    }
    return selected;
  }

  function densitySubset(cue, candidates, density) {
    if (!candidates.length || density === 0) return [];
    const ranked = [...candidates].sort((a, b) => {
      const aId = a.instance_id || a.occurrence_id || a.id;
      const bId = b.instance_id || b.occurrence_id || b.id;
      return stableHash(`${cue?.id || ''}:${aId}`) - stableHash(`${cue?.id || ''}:${bId}`) ||
        compareIds(aId, bId) || candidateSort(a, b);
    });
    const count = Math.ceil(ranked.length * density / 4);
    return ranked.slice(0, count).sort((a, b) => a.start_char - b.start_char || a.end_char - b.end_char);
  }

  function selectCandidates(cue, level = 1, density = 4, display = 'source') {
    if (typeof density === 'string') {
      display = density;
      density = 4;
    }
    const fadeLevel = normalizeLevel(level);
    const densityLevel = normalizeDensity(density);
    if (!cue || fadeLevel === 0 || densityLevel === 0) return [];

    if (display === 'translation') {
      const sourceCandidates = selectCandidates(cue, fadeLevel, densityLevel, 'source');
      const selectedIds = new Set(sourceCandidates.map(annotation => annotation.occurrence_id || annotation.id));
      const aligned = (cue.translation_annotations || []).filter(annotation =>
        annotation.occurrence_id && selectedIds.has(annotation.occurrence_id)
      );
      if (aligned.length || (cue.annotations || []).some(annotation => annotation.occurrence_id)) {
        const source = cue.translation_text || '';
        return resolveOverlaps(aligned.filter(annotation => annotationIsValid(source, annotation)).sort(candidateSort))
          .sort((a, b) => a.start_char - b.start_char || a.end_char - b.end_char);
      }
    }

    const eligible = validCandidates(cue, fadeLevel, display);
    return densitySubset(cue, resolveOverlaps(eligible), densityLevel);
  }

  function visibleAnnotations(cue, levelOrSession = 1, display = 'source', density = 4) {
    if (typeof display !== 'string') {
      density = display;
      display = 'source';
    }
    const level = typeof levelOrSession === 'object' ? levelOrSession.fade_level : levelOrSession;
    return selectCandidates(cue, level, density, display);
  }

  function renderSegments(cue, levelOrSession, revealedIds = new Set(), learningStyle = 'hide', display = 'source', density = 4) {
    const isTranslation = display === 'translation';
    const source = chars(isTranslation ? cue?.translation_text || '' : cue?.source_text || '');
    const revealed = revealedIds instanceof Set ? revealedIds : new Set(revealedIds || []);
    const annotations = visibleAnnotations(cue, levelOrSession, display, density)
      .filter(annotation => !revealed.has(annotation.occurrence_id || annotation.id))
      .sort((a, b) => a.start_char - b.start_char || a.end_char - b.end_char);
    const parts = [];
    let cursor = 0;
    annotations.forEach(annotation => {
      if (annotation.start_char < cursor) return;
      parts.push({ type: 'text', value: source.slice(cursor, annotation.start_char).join('') });
      parts.push({
        type: learningStyle === 'highlight' ? 'highlighted' : 'hidden',
        value: source.slice(annotation.start_char, annotation.end_char).join(''),
        annotation,
        display
      });
      cursor = annotation.end_char;
    });
    parts.push({ type: 'text', value: source.slice(cursor).join('') });
    return parts;
  }

  function recordReveal(session, cueId, annotations) {
    if (!session) return;
    annotations.forEach(annotation => {
      const annotationId = typeof annotation === 'string' ? annotation : (annotation.id || annotation.occurrence_id);
      const conceptId = typeof annotation === 'string' ? annotation : (annotation.concept_id || annotation.id);
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
      const correctIndex = question.correct_option_index ?? question.correct_answer_index;
      const isCorrect = Number(selected) === Number(correctIndex);
      attempt.answers.push({
        question_id: question.id,
        prompt: question.prompt || '',
        selected,
        selected_text: question.options?.[selected] || '',
        correct_option: correctIndex,
        correct_text: question.options?.[correctIndex] || '',
        category: question.category || '',
        concept_lemma: question.concept_lemma || '',
        concept_meaning: question.concept_meaning || '',
        explanation: question.explanation || '',
        correct: isCorrect
      });
      if (isCorrect) attempt.correct += 1;
      const related = question.related_annotation_ids || [];
      related.forEach(annotationId => {
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

  window.FadeEngine = {
    LEVEL_LABELS,
    CATEGORY_PRIORITY,
    chars,
    languageCharacterCount,
    getCueAtTime,
    emptySession,
    selectCandidates,
    visibleAnnotations,
    renderSegments,
    recordReveal,
    applyQuiz,
    conceptState
  };
})();
