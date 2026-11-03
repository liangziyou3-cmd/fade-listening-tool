const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'course-access.js'), 'utf8'), context);
const access = context.window.FadeCourseAccess;
const clone = value => JSON.parse(JSON.stringify(value));
const teacherCourse = () => ({ id: 'lesson', ownerId: 'teacher-1', mode: 'teacher', title: 'Example', videoId: 'abc', videoUrl: 'https://youtube.com/watch?v=abc', sourceLanguage: 'es', translationLanguage: 'en', originalPackage: { manifest: {} }, originalContent: { cues: [{ translation_text: 'Original' }] }, teacherContent: { cues: [{ translation_text: 'Teacher edit' }] }, progress: 70, session: { quiz_attempts: [1] } });

test('preset identities and legacy ownership stay separate', () => {
  assert.equal(access.account('teacher-1').role, 'teacher');
  assert.equal(access.account('student-1').role, 'student');
  assert.equal(access.account('student-2').role, 'student');
  assert.equal(access.account('unknown'), null);
  assert.equal(access.canOpen(null, 'teacher-1'), false);
  assert.equal(access.ownerOf({ mode: 'student' }), 'student-1');
  assert.equal(access.ownerOf({ mode: 'teacher' }), 'teacher-1');
  assert.equal(access.canOpen({ mode: 'student' }, 'teacher-1'), false);
  assert.equal(access.canOpen({ mode: 'teacher' }, 'student-1'), false);
});

test('teacher sharing creates one independent student lesson per student', () => {
  const source = teacherCourse();
  const studentOne = access.studentCopy(source, 'student-1', clone);
  const studentTwo = access.studentCopy(source, 'student-2', clone);
  assert.equal(studentOne.id, 'lesson:shared:student-1');
  assert.equal(studentTwo.id, 'lesson:shared:student-2');
  assert.equal(access.canOpen(studentOne, 'student-1'), true);
  assert.equal(access.canOpen(studentOne, 'student-2'), false);
  assert.equal(access.canOpen(studentTwo, 'teacher-1'), false);
  assert.equal(studentOne.originalContent.cues[0].translation_text, 'Teacher edit');
  assert.equal(studentOne.progress, 0);
  assert.equal(studentOne.session, null);
  studentOne.originalContent.cues[0].translation_text = 'Student one edit';
  studentOne.progress = 25;
  assert.equal(studentTwo.originalContent.cues[0].translation_text, 'Teacher edit');
  assert.equal(source.teacherContent.cues[0].translation_text, 'Teacher edit');
  assert.equal(studentTwo.progress, 0);
});

test('sharing requires saved teacher content and a preset student', () => {
  const course = teacherCourse();
  delete course.teacherContent;
  assert.throws(() => access.studentCopy(course, 'student-1', clone), /Save the teacher review/);
  assert.throws(() => access.studentCopy(teacherCourse(), 'teacher-1', clone), /Save the teacher review/);
});

test('student report summary separates not watched and quiz accuracy', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(access.learningSummary(null))), { progress: 0, watched: false, completed: false, correct: 0, total: 0, accuracy: null });
  assert.deepEqual(JSON.parse(JSON.stringify(access.learningSummary({ progress: 46, session: { quiz_attempts: [{ correct: 3, total: 4 }, { correct: 1, total: 2 }] } }))), { progress: 46, watched: true, completed: false, correct: 4, total: 6, accuracy: 67 });
  assert.equal(access.learningSummary({ progress: 100 }).completed, true);
});
