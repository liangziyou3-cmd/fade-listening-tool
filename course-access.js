(function () {
  const ACCOUNTS = Object.freeze({
    'teacher-1': { id: 'teacher-1', role: 'teacher', name: 'Teacher 1' },
    'student-1': { id: 'student-1', role: 'student', name: 'Student 1' },
    'student-2': { id: 'student-2', role: 'student', name: 'Student 2' }
  });
  const account = id => ACCOUNTS[id] || null;
  const ownerOf = course => course?.ownerId || (course?.mode === 'student' ? 'student-1' : 'teacher-1');
  const canOpen = (course, accountId) => Boolean(course && account(accountId) && ownerOf(course) === accountId);
  const sharedId = (courseId, studentId) => `${courseId}:shared:${studentId}`;
  function learningSummary(course) {
    const attempts = course?.session?.quiz_attempts || [];
    const correct = attempts.reduce((sum, attempt) => sum + Number(attempt.correct || 0), 0);
    const total = attempts.reduce((sum, attempt) => sum + Number(attempt.total || 0), 0);
    const progress = Math.max(0, Math.min(100, Number(course?.progress) || 0));
    return { progress, watched: progress > 0, completed: progress >= 100, correct, total, accuracy: total ? Math.round(correct / total * 100) : null };
  }
  function studentCopy(course, studentId, clone) {
    if (account(studentId)?.role !== 'student' || ownerOf(course) !== 'teacher-1' || course.mode !== 'teacher' || !course.teacherContent) throw new Error('Save the teacher review before sharing.');
    const content = clone(course.teacherContent);
    const now = new Date().toISOString();
    return {
      id: sharedId(course.id, studentId), ownerId: studentId, sharedSourceId: course.id,
      title: course.title, videoId: course.videoId, videoUrl: course.videoUrl,
      sourceLanguage: course.sourceLanguage, translationLanguage: course.translationLanguage,
      originalPackage: clone(course.originalPackage), originalContent: content, teacherContent: null,
      mode: 'student', currentTime: 0, progress: 0, session: null, translation: false,
      createdAt: now, updatedAt: now
    };
  }
  window.FadeCourseAccess = { ACCOUNTS, account, ownerOf, canOpen, sharedId, studentCopy, learningSummary };
})();
