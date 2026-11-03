const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const path = require('node:path');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'engine.js'), 'utf8'), context);
const engine = context.window.FadeEngine;

function cue(text, annotations) {
  return { id: 'cue-1', start: 0, end: 10, source_text: text, annotations };
}

function annotation(id, text, start, end, difficulty, category = 'noun', extra = {}) {
  return { id, occurrence_id: id, concept_id: `concept-${id}`, text, start_char: start, end_char: end, difficulty, category, ...extra };
}

test('Level 0 leaves all language elements visible', () => {
  const current = cue('alpha beta gamma', [annotation('a1', 'alpha', 0, 5, 1)]);
  assert.deepEqual(Array.from(engine.selectCandidates(current, 0)), []);
  assert.equal(engine.renderSegments(current, 0)[0].value, 'alpha beta gamma');
});

test('Levels accumulate matching difficulties and default to Level 1', () => {
  const current = cue('alpha beta gamma', [annotation('a1', 'alpha', 0, 5, 1), annotation('a2', 'beta', 6, 10, 2)]);
  assert.deepEqual(Array.from(engine.selectCandidates(current)).map(item => item.id), ['a1']);
  assert.deepEqual(Array.from(engine.selectCandidates(current, 2)).map(item => item.id), ['a1', 'a2']);
  assert.deepEqual(Array.from(engine.selectCandidates(current, 3)).map(item => item.id), ['a1', 'a2']);
});

test('Fade and Highlight use the same selected candidates', () => {
  const current = cue('alpha beta gamma', [annotation('a1', 'alpha', 0, 5, 1)]);
  assert.deepEqual(
    engine.renderSegments(current, 1, new Set()).filter(item => item.type !== 'text').map(item => item.annotation.id),
    engine.renderSegments(current, 1, new Set(), 'highlight').filter(item => item.type !== 'text').map(item => item.annotation.id)
  );
});

test('Overlapping candidates prefer fixed expressions without a character cap', () => {
  const current = cue('alpha beta gamma delta epsilon', [
    annotation('word', 'alpha', 0, 5, 1, 'noun'),
    annotation('expression', 'alpha beta', 0, 10, 1, 'fixed_expression'),
    annotation('word2', 'gamma', 11, 16, 1, 'noun')
  ]);
  assert.deepEqual(Array.from(engine.selectCandidates(current, 1)).map(item => item.id), ['expression', 'word2']);
});

test('A candidate covering most of a cue is still selected', () => {
  const current = cue('this is a very long phrase plus context', [annotation('long', 'this is a very long phrase', 0, 26, 1, 'fixed_expression')]);
  assert.deepEqual(Array.from(engine.selectCandidates(current, 1)).map(item => item.id), ['long']);
});

test('Density tiers select stable nested subsets of eligible elements', () => {
  const current = cue('one two three four five six', [
    annotation('a1', 'one', 0, 3, 1),
    annotation('a2', 'two', 4, 7, 1),
    annotation('a3', 'three', 8, 13, 2),
    annotation('a4', 'four', 14, 18, 3)
  ]);
  const none = Array.from(engine.selectCandidates(current, 3, 0), item => item.id);
  const light = Array.from(engine.selectCandidates(current, 3, 1), item => item.id);
  const medium = Array.from(engine.selectCandidates(current, 3, 2), item => item.id);
  const strong = Array.from(engine.selectCandidates(current, 3, 3), item => item.id);
  const all = Array.from(engine.selectCandidates(current, 3, 4), item => item.id);
  assert.equal(none.length, 0);
  assert.ok(light.every(id => medium.includes(id)));
  assert.ok(medium.every(id => strong.includes(id)));
  assert.ok(strong.every(id => all.includes(id)));
  assert.equal(all.length, 4);
  assert.deepEqual(light, Array.from(engine.selectCandidates(current, 3, 1), item => item.id));
});

test('Density filters candidates by cumulative level before selecting', () => {
  const current = cue('one two three four', [
    annotation('a1', 'one', 0, 3, 1),
    annotation('a2', 'two', 4, 7, 2),
    annotation('a3', 'three', 8, 13, 3),
    annotation('a4', 'four', 14, 18, 4)
  ]);
  assert.deepEqual(Array.from(engine.selectCandidates(current, 2, 4), item => item.id), ['a1', 'a2']);
  assert.deepEqual(Array.from(engine.selectCandidates(current, 4, 4), item => item.id), ['a1', 'a2', 'a3', 'a4']);
});

test('Overlapping spans are emitted once without corrupting text', () => {
  const current = cue('alpha beta gamma delta', [
    annotation('whole', 'alpha beta', 0, 10, 1, 'fixed_expression'),
    annotation('part', 'alpha', 0, 5, 1, 'noun')
  ]);
  const selected = engine.selectCandidates(current, 1);
  assert.deepEqual(Array.from(selected).map(item => item.id), ['whole']);
  assert.equal(engine.renderSegments(current, 1).map(part => part.value).join(''), 'alpha beta gamma delta');
});

test('Cross-cue expressions are independently selected', () => {
  const first = cue('take now please', [annotation('part-1', 'take', 0, 4, 2, 'collocation', { instance_id: 'shared' })]);
  const second = { ...cue('care now please', [annotation('part-2', 'care', 0, 4, 2, 'collocation', { instance_id: 'shared' })]), id: 'cue-2' };
  assert.deepEqual(Array.from(engine.selectCandidates(first, 2)).map(item => item.id), ['part-1']);
  assert.deepEqual(Array.from(engine.selectCandidates(second, 2)).map(item => item.id), ['part-2']);
});

test('Reveal affects only the current cue selection', () => {
  const current = cue('alpha beta gamma', [annotation('a1', 'alpha', 0, 5, 1)]);
  const revealed = new Set(['a1']);
  assert.equal(engine.renderSegments(current, 1, revealed).every(item => item.type === 'text'), true);
  assert.equal(engine.renderSegments({ ...current, id: 'cue-2' }, 1, new Set()).some(item => item.type === 'hidden'), true);
});

test('Invalid ranges safely fall back to original subtitle text', () => {
  const current = cue('alpha beta gamma', [annotation('bad', 'wrong', 0, 99, 1)]);
  assert.deepEqual(Array.from(engine.selectCandidates(current, 1)), []);
  assert.equal(engine.renderSegments(current, 1).map(part => part.value).join(''), 'alpha beta gamma');
});

test('Same input produces stable output', () => {
  const current = cue('alpha beta gamma', [
    annotation('b', 'beta', 6, 10, 1),
    annotation('a', 'alpha', 0, 5, 1)
  ]);
  const first = engine.selectCandidates(current, 1).map(item => item.id);
  const second = engine.selectCandidates(current, 1).map(item => item.id);
  assert.deepEqual(first, second);
});

test('Translation spans use the same difficulty and mode on their own text', () => {
  const current = { ...cue('comparten un piso', [annotation('source-share', 'comparten', 0, 9, 1)]), translation_text: 'share an apartment', translation_annotations: [annotation('translation-share', 'share', 0, 5, 1, 'verb', { occurrence_id: 'source-share' })] };
  const hidden = engine.renderSegments(current, 1, new Set(), 'hide', 'translation');
  const highlighted = engine.renderSegments(current, 1, new Set(), 'highlight', 'translation');
  assert.deepEqual(Array.from(hidden.filter(part => part.type !== 'text'), part => part.value), ['share']);
  assert.deepEqual(Array.from(highlighted.filter(part => part.type !== 'text'), part => part.type), ['highlighted']);
  assert.deepEqual(Array.from(engine.selectCandidates(current, 2, 4, 'translation')).map(item => item.text), ['share']);
});

test('Translation uses selected source occurrences and invalid spans fall back intact', () => {
  const current = { ...cue('hola mundo', []), translation_text: 'one two three', translation_annotations: [annotation('one', 'one', 0, 3, 1), annotation('two', 'two', 4, 7, 1), annotation('invalid', 'bad', 8, 13, 1)] };
  current.annotations = [annotation('source-one', 'hola', 0, 4, 1, 'noun', { occurrence_id: 'one' }), annotation('source-two', 'mundo', 5, 10, 1, 'noun', { occurrence_id: 'two' })];
  const selected = engine.selectCandidates(current, 1, 2, 'translation');
  assert.ok(selected.every(item => item.occurrence_id === 'one' || item.occurrence_id === 'two'));
  const invalidOnly = { ...current, translation_annotations: [annotation('invalid', 'bad', 8, 13, 1)] };
  assert.equal(engine.renderSegments(invalidOnly, 1, new Set(), 'hide', 'translation').map(part => part.value).join(''), current.translation_text);
});

test('A revealed source occurrence also restores its aligned translation phrase', () => {
  const current = { ...cue('Hola', [annotation('source-id', 'Hola', 0, 4, 1)]), translation_text: 'Hello', translation_annotations: [annotation('translation-id', 'Hello', 0, 5, 1, 'noun', { occurrence_id: 'source-id' })] };
  const revealed = new Set(['source-id']);
  assert.equal(engine.renderSegments(current, 1, revealed).every(part => part.type === 'text'), true);
  assert.equal(engine.renderSegments(current, 1, revealed, 'hide', 'translation').every(part => part.type === 'text'), true);
});

test('Quiz attempts retain answer text and knowledge point details', () => {
  const session = engine.emptySession('quiz');
  const attempt = engine.applyQuiz(session, 'final', [1], [{ id: 'q1', prompt: 'What?', options: ['A', 'B'], correct_option_index: 0, category: 'plot', explanation: 'Because.' }]);
  assert.equal(attempt.correct, 0);
  assert.equal(attempt.answers[0].selected_text, 'B');
  assert.equal(attempt.answers[0].correct_text, 'A');
  assert.equal(attempt.answers[0].category, 'plot');
  assert.equal(attempt.answers[0].explanation, 'Because.');
});
