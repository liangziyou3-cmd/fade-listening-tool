const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'content-adapter.js'), 'utf8'), context);
const adapter = context.window.FadeContentAdapter;

function packageV2() {
  return {
    manifest: { schema_version: '2.0.0', content_id: 'video-1', title: 'Test', video: { platform: 'youtube', id: 'abcdefghijk', duration_seconds: 10 }, source_language: 'es', target_language: 'en' },
    subtitles: { schema_version: '2.0.0', display_cues: [{ id: 'c1', sequence: 1, start: 0, end: 10, source_text: 'Hola mundo', translation: 'Hello world', sentence_ids: ['s1'] }], sentences: [{ id: 's1', text: 'Hola mundo', translation: 'Hello world', cue_ids: ['c1'] }], linguistic_occurrences: [{ occurrence_id: 'o1', instance_id: 'i1', concept_id: 'concept-1', cue_id: 'c1', text: 'Hola', start_char: 0, end_char: 4 }], translation_alignments: [{ alignment_id: 'ta1', occurrence_id: 'o1', cue_id: 'c1', text: 'Hello', start_char: 0, end_char: 5, alignment_type: 'direct', confidence: 1 }] },
    vocabulary: { schema_version: '2.0.0', concepts: [{ concept_id: 'concept-1', lemma: 'hola', category: 'noun', difficulty: 1, translation: 'hello', explanation: 'greeting' }] },
    culture: { schema_version: '2.0.0', items: [{ id: 'culture-1', sentence_ids: ['s1'], trigger_time: 3, topic: 'Shared homes', explanation: 'A note.' }] },
    quizzes: { schema_version: '2.0.0', checkpoints: [], questions: [], final_quiz: { id: 'final', trigger_time: 10, question_ids: ['q1'], questions: [{ id: 'q1', prompt: 'What?', options: ['A', 'B'], correct_answer_index: 0, explanation: 'Because.', category: 'plot', sentence_ids: ['s1'] }] } }
  };
}

test('schema 2.0 maps display cues and linguistic occurrences to frontend annotations', () => {
  const normalized = adapter.normalize(packageV2());
  assert.equal(normalized.videoId, 'abcdefghijk');
  assert.equal(normalized.cues[0].translation_text, 'Hello world');
  assert.equal(normalized.cues[0].annotations[0].id, 'o1');
  assert.equal(normalized.cues[0].annotations[0].concept_id, 'concept-1');
  assert.equal(normalized.cues[0].annotations[0].difficulty, 1);
  assert.equal(normalized.cues[0].translation_annotations[0].id, 'ta1');
  assert.equal(normalized.cues[0].translation_annotations[0].difficulty, 1);
  assert.equal(normalized.cues[0].translation_annotations[0].occurrence_id, 'o1');
  assert.equal(normalized.culture.notes[0].trigger_time, 3);
  assert.equal(normalized.culture.notes[0].sentences[0].id, 's1');
  assert.equal(normalized.culture.notes[0].sentences[0].source_text, 'Hola mundo');
  assert.equal(normalized.culture.notes[0].sentences[0].translation_text, 'Hello world');
  assert.equal(normalized.quizzes.checkpoints.length, 1);
  assert.equal(normalized.quizzes.checkpoints[0].trigger_time, 10);
  assert.equal(normalized.quizzes.questions[0].checkpoint_id, 'final');
  assert.equal(normalized.vocabulary.items[0].related_annotation_ids[0], 'o1');
  assert.deepEqual(Array.from(adapter.validate(packageV2())), []);
});

test('invalid occurrence offsets are rejected without changing the Agent package', () => {
  const pkg = packageV2();
  pkg.subtitles.linguistic_occurrences[0].end_char = 99;
  assert.ok(adapter.validate(pkg).some(error => error.includes('invalid character range')));
});

