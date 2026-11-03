/* Adapter for Agent schema 2.0 and the existing demo package contract. */
(function () {
  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function languageName(code) {
    return ({ es: 'Spanish', en: 'English', fr: 'French', de: 'German', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', th: 'Thai' })[String(code || '').toLowerCase()] || String(code || '').toUpperCase() || 'Unknown';
  }

  function videoIdFromManifest(manifest) {
    const video = manifest?.video || {};
    return String(video.id || video.video_id || '').trim();
  }

  function normalizeV2(pkg) {
    const manifest = pkg.manifest || {};
    const subtitles = pkg.subtitles || {};
    const vocabulary = pkg.vocabulary || {};
    const concepts = asArray(vocabulary.concepts);
    const conceptsById = new Map(concepts.map(concept => [String(concept.concept_id), concept]));
    const occurrences = asArray(subtitles.linguistic_occurrences);
    const occurrencesById = new Map(occurrences.map(occurrence => [String(occurrence.occurrence_id), occurrence]));
    const alignmentsByCue = new Map();
    asArray(subtitles.translation_alignments).forEach(alignment => {
      const occurrence = occurrencesById.get(String(alignment.occurrence_id));
      if (!occurrence || String(occurrence.cue_id) !== String(alignment.cue_id)) return;
      const cueId = String(alignment.cue_id);
      if (!alignmentsByCue.has(cueId)) alignmentsByCue.set(cueId, []);
      const concept = conceptsById.get(String(occurrence.concept_id)) || {};
      alignmentsByCue.get(cueId).push({
        ...alignment,
        id: String(alignment.alignment_id || `${alignment.occurrence_id}:${cueId}:${alignment.start_char}`),
        alignment_id: String(alignment.alignment_id || ''),
        occurrence_id: String(alignment.occurrence_id || ''),
        concept_id: String(occurrence.concept_id || ''),
        difficulty: Number(concept.difficulty),
        category: String(concept.category || 'other'),
        text: String(alignment.text || '')
      });
    });
    const occurrencesByCue = new Map();
    occurrences.forEach(occurrence => {
      const cueId = String(occurrence.cue_id);
      if (!occurrencesByCue.has(cueId)) occurrencesByCue.set(cueId, []);
      const concept = conceptsById.get(String(occurrence.concept_id)) || {};
      occurrencesByCue.get(cueId).push({
        ...occurrence,
        id: String(occurrence.occurrence_id || `${occurrence.concept_id}:${occurrence.cue_id}:${occurrence.start_char}`),
        occurrence_id: String(occurrence.occurrence_id || ''),
        concept_id: String(occurrence.concept_id || ''),
        difficulty: Number(concept.difficulty),
        category: String(concept.category || 'other'),
        translation: concept.translation || '',
        lemma: concept.lemma || ''
      });
    });
    const cues = asArray(subtitles.display_cues).map(cue => ({
      ...cue,
      id: String(cue.id),
      source_text: String(cue.source_text || ''),
      translation_text: String(cue.translation || cue.translation_text || ''),
      annotations: occurrencesByCue.get(String(cue.id)) || [],
      translation_annotations: alignmentsByCue.get(String(cue.id)) || []
    })).sort((a, b) => Number(a.start) - Number(b.start) || Number(a.sequence || 0) - Number(b.sequence || 0));
    const sentencesById = new Map(asArray(subtitles.sentences).map(sentence => [String(sentence.id), sentence]));
    const items = concepts.map(concept => {
      const related = occurrences.filter(item => String(item.concept_id) === String(concept.concept_id));
      return {
        id: String(concept.concept_id),
        source: concept.lemma || '',
        translation: concept.translation || '',
        category: concept.category || 'other',
        difficulty: concept.difficulty,
        related_annotation_ids: related.map(item => String(item.occurrence_id)),
        related_subtitle_ids: related.map(item => String(item.cue_id)),
        notes: concept.explanation || ''
      };
    });
    const cueBySentence = new Map();
    cues.forEach(cue => asArray(cue.sentence_ids).forEach(sentenceId => {
      const key = String(sentenceId);
      if (!cueBySentence.has(key)) cueBySentence.set(key, []);
      cueBySentence.get(key).push(cue.id);
    }));
    const notes = asArray(pkg.culture?.items).map(item => {
      const sentenceIds = asArray(item.sentence_ids).map(String);
      const linkedSentences = sentenceIds.map(id => sentencesById.get(id)).filter(Boolean).map(sentence => ({
        id: String(sentence.id),
        source_text: String(sentence.text || sentence.source_text || ''),
        translation_text: String(sentence.translation || sentence.translation_text || ''),
        cue_ids: asArray(sentence.cue_ids).map(String)
      }));
      const cueIds = sentenceIds.flatMap(sentenceId => cueBySentence.get(sentenceId) || []);
      return {
        id: String(item.id),
        trigger_time: Number(item.trigger_time),
        sentence_ids: sentenceIds,
        subtitle_ids: [...new Set(cueIds)],
        title: item.topic || 'Culture note',
        body: item.explanation || '',
        sentences: linkedSentences
      };
    }).filter(note => Number.isFinite(note.trigger_time)).sort((a, b) => a.trigger_time - b.trigger_time || a.id.localeCompare(b.id));
    const checkpointSource = asArray(pkg.quizzes?.checkpoints).map(checkpoint => ({ ...checkpoint, id: String(checkpoint.id), trigger_time: Number(checkpoint.trigger_time) }));
    const finalQuiz = pkg.quizzes?.final_quiz;
    const finalQuestions = finalQuiz ? asArray(finalQuiz.questions).map(question => ({ ...question, checkpoint_id: String(finalQuiz.id || 'final') })) : [];
    if (finalQuiz && !checkpointSource.some(checkpoint => checkpoint.id === String(finalQuiz.id || 'final'))) checkpointSource.push({
      id: String(finalQuiz.id || 'final'),
      trigger_time: Number(finalQuiz.trigger_time),
      question_ids: asArray(finalQuiz.question_ids).map(String)
    });
    const questions = [...asArray(pkg.quizzes?.questions), ...finalQuestions].map(question => ({
      ...question,
      id: String(question.id),
      checkpoint_id: String(question.checkpoint_id || finalQuiz?.id || 'final'),
      correct_option_index: question.correct_option_index ?? question.correct_answer_index,
      related_annotation_ids: asArray(question.related_annotation_ids).length
        ? question.related_annotation_ids
        : asArray(question.concept_ids).flatMap(conceptId => items.find(item => item.id === String(conceptId))?.related_annotation_ids || [])
    }));
    const normalizedManifest = {
      ...manifest,
      content_id: String(manifest.content_id || videoIdFromManifest(manifest)),
      title: manifest.title || videoIdFromManifest(manifest),
      video: {
        ...manifest.video,
        provider: manifest.video?.platform || 'youtube',
        video_id: videoIdFromManifest(manifest),
        duration_seconds: Number(manifest.video?.duration_seconds) || 0
      },
      languages: { source: manifest.source_language || 'und', translation: manifest.target_language || '' }
    };
    return {
      ...pkg,
      manifest: normalizedManifest,
      subtitles: { ...subtitles, cues },
      vocabulary: { ...vocabulary, items },
      culture: { ...(pkg.culture || {}), notes },
      quizzes: { ...(pkg.quizzes || {}), checkpoints: checkpointSource, questions },
      videoId: videoIdFromManifest(manifest),
      title: String(manifest.title || videoIdFromManifest(manifest)).trim(),
      language: manifest.source_language || 'und',
      translation: manifest.target_language || '',
      cues,
      duration: Number(manifest.video?.duration_seconds) || 0
    };
  }

  function normalizeV1(pkg) {
    const manifest = pkg.manifest || {};
    const video = manifest.video || {};
    const cues = asArray(pkg.subtitles?.cues).map(cue => ({
      ...cue,
      id: String(cue.id),
      source_text: String(cue.source_text || ''),
      translation_text: String(cue.translation_text || cue.translation || ''),
      annotations: asArray(cue.annotations).map(annotation => ({ ...annotation, id: String(annotation.id) }))
    })).sort((a, b) => Number(a.start) - Number(b.start));
    const normalizedManifest = {
      ...manifest,
      video: { ...video, video_id: video.video_id || video.id || '', provider: video.provider || video.platform || 'youtube' }
    };
    return {
      ...pkg,
      manifest: normalizedManifest,
      cues,
      videoId: String(video.video_id || video.id || ''),
      title: String(video.title || manifest.title || manifest.content_id || 'Untitled lesson').trim(),
      language: manifest.languages?.source || manifest.source_language || 'und',
      translation: manifest.languages?.translation || manifest.target_language || '',
      duration: Number(video.duration_seconds) || 0
    };
  }

  function normalize(pkg) {
    if (!pkg || !pkg.manifest || !pkg.subtitles || !pkg.vocabulary || !pkg.quizzes || !pkg.culture) throw new Error('Package is missing a required JSON file.');
    return pkg.subtitles.display_cues || pkg.vocabulary.concepts ? normalizeV2(pkg) : normalizeV1(pkg);
  }

  function validate(pkg) {
    const errors = [];
    if (!pkg || !pkg.manifest || !pkg.subtitles || !pkg.vocabulary || !pkg.quizzes || !pkg.culture) return ['Package is missing manifest, subtitles, vocabulary, quizzes, or culture.'];
    const normalized = normalize(pkg);
    if (!normalized.videoId) errors.push('manifest.video: a YouTube video id is required.');
    if (!normalized.cues.length) errors.push('subtitles: at least one display cue is required.');
    const cueIds = new Set(normalized.cues.map(cue => cue.id));
    normalized.cues.forEach(cue => {
      const source = Array.from(cue.source_text || '');
      if (!Number.isFinite(Number(cue.start)) || !Number.isFinite(Number(cue.end)) || Number(cue.end) <= Number(cue.start)) errors.push(`${cue.id}: invalid time range.`);
      asArray(cue.annotations).forEach(annotation => {
        if (!Number.isInteger(annotation.start_char) || !Number.isInteger(annotation.end_char) || annotation.start_char < 0 || annotation.end_char <= annotation.start_char || annotation.end_char > source.length) errors.push(`${cue.id}/${annotation.id}: invalid character range.`);
        else if (annotation.text != null && source.slice(annotation.start_char, annotation.end_char).join('') !== String(annotation.text)) errors.push(`${cue.id}/${annotation.id}: character range does not match text.`);
      });
      const translation = Array.from(cue.translation_text || '');
      asArray(cue.translation_annotations).forEach(annotation => {
        if (!Number.isInteger(annotation.start_char) || !Number.isInteger(annotation.end_char) || annotation.start_char < 0 || annotation.end_char <= annotation.start_char || annotation.end_char > translation.length) errors.push(`${cue.id}/${annotation.id}: invalid translation character range.`);
        else if (annotation.text != null && translation.slice(annotation.start_char, annotation.end_char).join('') !== String(annotation.text)) errors.push(`${cue.id}/${annotation.id}: translation character range does not match text.`);
      });
    });
    asArray(normalized.culture.notes).forEach(note => {
      if (!Number.isFinite(note.trigger_time) || note.trigger_time < 0) errors.push(`${note.id}: invalid culture trigger time.`);
      if (asArray(note.subtitle_ids).some(id => !cueIds.has(String(id)))) errors.push(`${note.id}: invalid culture cue reference.`);
    });
    const checkpoints = new Map(asArray(normalized.quizzes.checkpoints).map(checkpoint => [checkpoint.id, checkpoint]));
    asArray(normalized.quizzes.checkpoints).forEach(checkpoint => {
      if (!Number.isFinite(Number(checkpoint.trigger_time)) || Number(checkpoint.trigger_time) < 0) errors.push(`${checkpoint.id}: invalid checkpoint trigger time.`);
      if (!Array.isArray(checkpoint.question_ids)) errors.push(`${checkpoint.id}: question_ids must be an array.`);
    });
    asArray(normalized.quizzes.questions).forEach(question => {
      if (!checkpoints.has(String(question.checkpoint_id))) errors.push(`${question.id}: invalid checkpoint reference.`);
      if (!Array.isArray(question.options) || question.options.length < 2 || !Number.isInteger(Number(question.correct_option_index)) || Number(question.correct_option_index) < 0 || Number(question.correct_option_index) >= question.options.length) errors.push(`${question.id}: invalid quiz options or answer.`);
    });
    return [...new Set(errors)];
  }

  window.FadeContentAdapter = { languageName, normalize, validate };
})();
