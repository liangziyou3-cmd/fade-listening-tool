(function () {
  const array = value => Array.isArray(value) ? value : [];
  const clone = value => JSON.parse(JSON.stringify(value));
  const id = prefix => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`;

  function updateTranslation(content, cueId, translation) {
    const cue = content.cues.find(item => item.id === String(cueId));
    if (!cue) throw new Error('Subtitle cue was not found.');
    const value = String(translation);
    if (cue.translation_text !== value) cue.translation_annotations = [];
    cue.translation_text = value;
    for (const note of array(content.culture?.notes)) for (const sentence of array(note.sentences)) {
      if (array(sentence.cue_ids).includes(cue.id) && (sentence.cue_ids.length === 1 || sentence.source_text === cue.source_text)) sentence.translation_text = value;
    }
    return content;
  }

  function removeAnnotation(content, annotationId) {
    const key = String(annotationId);
    let removed = false;
    content.cues.forEach(cue => {
      const matches = array(cue.annotations).filter(item => String(item.id || item.occurrence_id) === key);
      if (!matches.length) return;
      removed = true;
      const occurrenceIds = new Set(matches.map(item => String(item.occurrence_id || item.id)));
      cue.annotations = cue.annotations.filter(item => !occurrenceIds.has(String(item.occurrence_id || item.id)));
      cue.translation_annotations = array(cue.translation_annotations).filter(item => !occurrenceIds.has(String(item.occurrence_id)));
    });
    if (!removed) throw new Error('Language element was not found.');
    content.vocabulary.items = array(content.vocabulary.items).map(item => ({
      ...item,
      related_annotation_ids: array(item.related_annotation_ids).filter(value => String(value) !== key),
      related_subtitle_ids: array(item.related_subtitle_ids).filter(cueId => content.cues.some(cue => cue.id === String(cueId) && array(cue.annotations).some(annotation => String(annotation.concept_id) === String(item.id))))
    })).filter(item => item.related_annotation_ids.length || item.related_subtitle_ids.length);
    return content;
  }

  function addAnnotation(content, input) {
    const cue = content.cues.find(item => item.id === String(input.cueId));
    const phrase = String(input.text || '').trim();
    if (!cue || !phrase) throw new Error('Choose a subtitle and enter a complete phrase.');
    const start = Array.from(cue.source_text).join('').indexOf(phrase);
    if (start < 0) throw new Error('The phrase must match text in the selected subtitle exactly.');
    const occurrenceId = id('teacher-occurrence');
    const conceptId = id('teacher-concept');
    const annotation = {
      id: occurrenceId, occurrence_id: occurrenceId, instance_id: occurrenceId, concept_id: conceptId,
      cue_id: cue.id, text: phrase, start_char: Array.from(cue.source_text.slice(0, start)).length,
      end_char: Array.from(cue.source_text.slice(0, start + phrase.length)).length,
      difficulty: Math.max(1, Math.min(4, Number(input.difficulty) || 1)), category: String(input.category || 'other'),
      translation: String(input.translation || '').trim(), lemma: phrase
    };
    cue.annotations = [...array(cue.annotations), annotation].sort((a, b) => a.start_char - b.start_char || a.end_char - b.end_char);
    content.vocabulary.items = [...array(content.vocabulary.items), {
      id: conceptId, source: phrase, translation: annotation.translation, category: annotation.category,
      difficulty: annotation.difficulty, notes: '', related_annotation_ids: [occurrenceId], related_subtitle_ids: [cue.id]
    }];
    return content;
  }

  function removeCultureNote(content, noteId) {
    content.culture.notes = array(content.culture.notes).filter(note => note.id !== String(noteId));
    return content;
  }

  function addCultureNote(content, note) {
    const trigger = Number(note.triggerTime);
    if (!Number.isFinite(trigger) || trigger < 0 || trigger > Number(content.duration || Infinity)) throw new Error('Enter a valid time within the video.');
    content.culture.notes = [...array(content.culture.notes), {
      id: id('teacher-culture'), trigger_time: trigger, sentence_ids: [],
      title: String(note.title || 'Culture note').trim(), body: String(note.body || '').trim(),
      subtitle_ids: note.cueId ? [String(note.cueId)] : [],
      sentences: note.cueId ? (() => { const cue = content.cues.find(item => item.id === String(note.cueId)); return cue ? [{ id: cue.id, source_text: cue.source_text, translation_text: cue.translation_text, cue_ids: [cue.id] }] : []; })() : []
    }].sort((a, b) => a.trigger_time - b.trigger_time || a.id.localeCompare(b.id));
    return content;
  }

  function removeQuestion(content, questionId) {
    const key = String(questionId);
    content.quizzes.questions = array(content.quizzes.questions).filter(question => question.id !== key);
    content.quizzes.checkpoints = array(content.quizzes.checkpoints).map(checkpoint => ({
      ...checkpoint, question_ids: array(checkpoint.question_ids).filter(value => String(value) !== key)
    })).filter(checkpoint => checkpoint.question_ids.length > 0);
    return content;
  }

  function addQuestion(content, input) {
    const prompt = String(input.prompt || '').trim();
    const options = array(input.options).map(value => String(value).trim());
    const correct = Number(input.correctIndex);
    if (!prompt || options.length < 2 || options.some(option => !option) || !Number.isInteger(correct) || correct < 0 || correct >= options.length) throw new Error('Add a question, at least two options, and choose the correct answer.');
    let checkpoint = array(content.quizzes.checkpoints).findLast(item => item.id === 'final') || array(content.quizzes.checkpoints).findLast(item => item.trigger_time >= Number(content.duration || 0));
    if (!checkpoint) {
      checkpoint = { id: 'final', trigger_time: Number(content.duration || 0), question_ids: [] };
      content.quizzes.checkpoints = [...array(content.quizzes.checkpoints), checkpoint];
    }
    const questionId = id('teacher-question');
    content.quizzes.questions = [...array(content.quizzes.questions), {
      id: questionId, checkpoint_id: checkpoint.id, prompt, options, correct_option_index: correct,
      explanation: String(input.explanation || '').trim(), category: String(input.category || 'comprehension'),
      concept_lemma: '', concept_meaning: '', related_annotation_ids: []
    }];
    checkpoint.question_ids = [...array(checkpoint.question_ids), questionId];
    return content;
  }

  function editQuestion(content, questionId, input) {
    const question = array(content.quizzes.questions).find(item => item.id === String(questionId));
    if (!question) throw new Error('Question was not found.');
    const options = array(input.options).map(value => String(value).trim());
    const correct = Number(input.correctIndex);
    if (!String(input.prompt || '').trim() || options.length < 2 || options.some(option => !option) || !Number.isInteger(correct) || correct < 0 || correct >= options.length) throw new Error('Add a question, at least two options, and choose the correct answer.');
    Object.assign(question, { prompt: String(input.prompt).trim(), options, correct_option_index: correct, explanation: String(input.explanation || '').trim() });
    return content;
  }

  window.FadeCourseEditor = { clone, updateTranslation, addAnnotation, removeAnnotation, addCultureNote, removeCultureNote, addQuestion, editQuestion, removeQuestion };
})();
