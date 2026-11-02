const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'course-editor.js'), 'utf8'), context);
const editor = context.window.FadeCourseEditor;

function course() {
  return {
    duration: 120,
    cues: [{ id: 'cue-1', start: 0, end: 5, source_text: 'Hola 🌟 mundo', translation_text: 'Hello star world', annotations: [], translation_annotations: [] }],
    vocabulary: { items: [] },
    culture: { notes: [] },
    quizzes: { checkpoints: [{ id: 'final', trigger_time: 120, question_ids: [] }], questions: [] }
  };
}

test('teacher translations update only the selected cue', () => {
  const content = course();
  content.cues[0].translation_annotations = [{ occurrence_id: 'o1', start_char: 0, end_char: 5, text: 'Hello' }];
  content.culture.notes = [{ sentences: [{ cue_ids: ['cue-1'], source_text: content.cues[0].source_text, translation_text: 'Hello star world' }] }];
  editor.updateTranslation(content, 'cue-1', 'Hi, bright star world');
  assert.equal(content.cues[0].translation_text, 'Hi, bright star world');
  assert.equal(content.cues[0].translation_annotations.length, 0);
  assert.equal(content.culture.notes[0].sentences[0].translation_text, 'Hi, bright star world');
  assert.throws(() => editor.updateTranslation(content, 'missing', 'text'), /not found/);
});

test('added language elements use exact Unicode code-point offsets', () => {
  const content = course();
  editor.addAnnotation(content, { cueId: 'cue-1', text: 'mundo', translation: 'world', category: 'noun', difficulty: 2 });
  const annotation = content.cues[0].annotations[0];
  const chars = Array.from(content.cues[0].source_text);
  assert.equal(chars.slice(annotation.start_char, annotation.end_char).join(''), 'mundo');
  assert.equal(annotation.difficulty, 2);
  assert.equal(content.vocabulary.items[0].translation, 'world');
  assert.equal(content.cues[0].translation_annotations.length, 0);
  assert.throws(() => editor.addAnnotation(content, { cueId: 'cue-1', text: 'not present' }), /exactly/);
});

test('removing a language element also removes its vocabulary reference', () => {
  const content = course();
  editor.addAnnotation(content, { cueId: 'cue-1', text: 'Hola', category: 'other' });
  const annotationId = content.cues[0].annotations[0].id;
  editor.removeAnnotation(content, annotationId);
  assert.equal(content.cues[0].annotations.length, 0);
  assert.equal(content.vocabulary.items.length, 0);
});

test('culture notes can be added at a cue and removed', () => {
  const content = course();
  editor.addCultureNote(content, { cueId: 'cue-1', triggerTime: 3.5, title: 'Greeting', body: 'A note.' });
  assert.equal(content.culture.notes[0].trigger_time, 3.5);
  assert.equal(content.culture.notes[0].sentences[0].source_text, 'Hola 🌟 mundo');
  const noteId = content.culture.notes[0].id;
  editor.removeCultureNote(content, noteId);
  assert.equal(content.culture.notes.length, 0);
  assert.throws(() => editor.addCultureNote(content, { triggerTime: 121 }), /valid time/);
});

test('quiz questions can be added, edited, and removed with their checkpoint reference', () => {
  const content = course();
  editor.addQuestion(content, { prompt: 'Meaning?', options: ['World', 'House'], correctIndex: 0, explanation: 'Context.' });
  const question = content.quizzes.questions[0];
  assert.equal(content.quizzes.checkpoints[0].question_ids[0], question.id);
  assert.equal(question.correct_option_index, 0);
  editor.editQuestion(content, question.id, { prompt: 'Updated?', options: ['House', 'World'], correctIndex: 1, explanation: 'Updated context.' });
  assert.equal(question.prompt, 'Updated?');
  assert.equal(question.options[question.correct_option_index], 'World');
  editor.removeQuestion(content, question.id);
  assert.equal(content.quizzes.questions.length, 0);
  assert.equal(content.quizzes.checkpoints.length, 0);
});
