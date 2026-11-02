(function () {
  const $ = selector => document.querySelector(selector);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const state = () => window.FadeApp.state;
  const editor = window.FadeCourseEditor;
  const access = window.FadeCourseAccess;
  const language = code => window.FadeContentAdapter.languageName(code);
  const time = value => { const seconds = Math.max(0, Math.floor(Number(value) || 0)); return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; };

  async function createFromPackage(pkg, content, videoUrl) {
    await window.FadeApp.savePendingCourse(pkg, content, videoUrl);
    showMode();
  }

  function showMode() {
    const course = state().currentCourse;
    if (!course) return;
    if (window.FadeAuth?.role === 'teacher') return chooseTeacher();
    if (window.FadeAuth?.role === 'student') return chooseStudent();
    $('#modeCourseTitle').textContent = course.title;
    window.FadeApp.switchView('mode');
  }

  let homeRender = 0;
  async function renderHome() {
    const list = $('#courseList');
    const accountId = window.FadeAuth?.accountId;
    if (!list || !accountId) return;
    const renderId = ++homeRender;
    list.innerHTML = '<p class="course-empty">Loading saved courses…</p>';
    try {
      const allCourses = await window.FadeCourseStore.getAll();
      if (renderId !== homeRender || accountId !== window.FadeAuth?.accountId) return;
      const courses = allCourses.filter(course => access.canOpen(course, accountId));
      courses.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
      if (!courses.length) {
        list.innerHTML = '<div class="course-empty-panel"><h2>No saved courses yet</h2><p>Your analyzed and demo lessons will appear here.</p><button class="fade-primary" data-new-course type="button">Create your first course</button></div>';
        list.querySelector('[data-new-course]')?.addEventListener('click', () => window.FadeApp.switchView('workspaceImport'));
        return;
      }
      list.innerHTML = courses.map(course => {
        const shareControls = accountId === 'teacher-1' && course.mode === 'teacher' && course.teacherContent
          ? (() => {
              const selected = ['student-1', 'student-2'].filter(studentId => allCourses.some(item => item.id === access.sharedId(course.id, studentId))).length;
              const allSelected = selected === 2;
              return `<fieldset class="share-targets" data-share-course="${escape(course.id)}"><legend>Share with students</legend><label class="share-student-option"><input type="checkbox" data-share-student="student-1" ${allCourses.some(item => item.id === access.sharedId(course.id, 'student-1')) ? 'checked' : ''}><span>Student 1</span></label><label class="share-student-option"><input type="checkbox" data-share-student="student-2" ${allCourses.some(item => item.id === access.sharedId(course.id, 'student-2')) ? 'checked' : ''}><span>Student 2</span></label><label class="share-student-option share-all-option"><input type="checkbox" data-share-all ${allSelected ? 'checked' : ''}><span>Select all</span></label></fieldset>`;
            })() : '';
        return `<article class="course-row"><div class="course-row-copy"><span class="fade-eyebrow">${escape(language(course.sourceLanguage))} · ${escape(language(course.translationLanguage))}${course.sharedSourceId ? ' · Shared by Teacher 1' : ''}</span><h2>${escape(course.title)}</h2><p>${course.mode === 'teacher' ? 'Teacher reviewed' : course.mode === 'student' ? 'Student mode' : 'Analysis ready'} · ${Number(course.progress) || 0}% watched · Updated ${new Date(course.updatedAt).toLocaleDateString()}</p>${shareControls}</div><div class="course-row-actions">${accountId === 'teacher-1' && !course.sharedSourceId ? `<button class="fade-outline" data-review-course="${escape(course.id)}" type="button">Review lesson</button>` : ''}<button class="fade-outline" data-open-course="${escape(course.id)}" type="button">${course.mode ? 'Continue' : 'Open course'}</button><button class="course-delete" data-delete-course="${escape(course.id)}" type="button" aria-label="Delete ${escape(course.title)}">Delete</button></div></article>`;
      }).join('');
      list.querySelectorAll('[data-open-course]').forEach(button => button.addEventListener('click', () => openCourse(button.dataset.openCourse)));
      list.querySelectorAll('[data-review-course]').forEach(button => button.addEventListener('click', () => reviewCourse(button.dataset.reviewCourse)));
      list.querySelectorAll('.share-targets').forEach(group => {
        const courseId = group.dataset.shareCourse;
        const studentInputs = [...group.querySelectorAll('[data-share-student]')];
        const allInput = group.querySelector('[data-share-all]');
        const updateAll = () => {
          const checkedCount = studentInputs.filter(input => input.checked).length;
          allInput.checked = checkedCount === studentInputs.length;
          allInput.indeterminate = checkedCount > 0 && checkedCount < studentInputs.length;
        };
        studentInputs.forEach(input => input.addEventListener('change', async () => {
          input.disabled = true;
          await setShareState(courseId, input.dataset.shareStudent, input.checked);
          input.disabled = false;
          renderHome();
        }));
        allInput.addEventListener('change', async () => {
          allInput.disabled = true;
          await Promise.all(studentInputs.map(input => setShareState(courseId, input.dataset.shareStudent, allInput.checked)));
          renderHome();
        });
        updateAll();
      });
      list.querySelectorAll('[data-delete-course]').forEach(button => button.addEventListener('click', async () => { const course = await window.FadeCourseStore.get(button.dataset.deleteCourse); if (!access.canOpen(course, window.FadeAuth?.accountId)) return; await window.FadeCourseStore.remove(course.id); renderHome(); }));
    } catch (error) {
      list.innerHTML = `<p class="course-empty">Could not load local courses: ${escape(error.message)}</p>`;
    }
  }

  async function openCourse(id) {
    try {
      const course = await window.FadeCourseStore.get(id);
      if (!access.canOpen(course, window.FadeAuth?.accountId)) return;
      Object.assign(state(), { currentCourse: course, originalContent: editor.clone(course.originalContent), pendingPackage: editor.clone(course.originalPackage), pendingContent: editor.clone(course.originalContent) });
      if (!course.mode) return showMode();
      const content = editor.clone(course.mode === 'teacher' && course.teacherContent ? course.teacherContent : course.originalContent);
      content.videoUrl = course.videoUrl;
      window.FadeApp.startContent(content, course, course.currentTime || 0);
    } catch (error) { window.FadeApp.toast(`Could not open this course: ${error.message}`); }
  }

  async function reviewCourse(id) {
    if (window.FadeAuth?.role !== 'teacher') return;
    const course = await window.FadeCourseStore.get(id);
    if (!access.canOpen(course, window.FadeAuth.accountId)) return;
    Object.assign(state(), { currentCourse: course, originalContent: editor.clone(course.originalContent), pendingPackage: editor.clone(course.originalPackage), pendingContent: editor.clone(course.originalContent) });
    chooseTeacher();
  }

  async function setShareState(id, studentId, shouldShare) {
    if (window.FadeAuth?.accountId !== 'teacher-1' || access.account(studentId)?.role !== 'student') return;
    const course = await window.FadeCourseStore.get(id);
    if (!access.canOpen(course, window.FadeAuth.accountId)) return;
    const sharedId = access.sharedId(id, studentId);
    const existing = await window.FadeCourseStore.get(sharedId);
    if (shouldShare && !existing) await window.FadeCourseStore.put(access.studentCopy(course, studentId, editor.clone));
    if (!shouldShare && existing) await window.FadeCourseStore.remove(sharedId);
  }

  async function renderTeacherReport() {
    const container = $('#teacherReportContent');
    if (!container || window.FadeAuth?.accountId !== 'teacher-1') return;
    try {
      const allCourses = await window.FadeCourseStore.getAll();
      const teacherCourses = allCourses.filter(course => access.canOpen(course, 'teacher-1')).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
      if (!teacherCourses.length) {
        container.innerHTML = '<div class="course-empty-panel"><h2>No course activity yet</h2><p>Courses and student progress will appear here.</p></div>';
        return;
      }
      container.innerHTML = teacherCourses.map(course => {
        const studentRows = ['student-1', 'student-2'].map(studentId => {
          const student = access.account(studentId);
          const shared = allCourses.find(item => item.id === access.sharedId(course.id, studentId));
          const summary = access.learningSummary(shared);
          const status = !shared ? 'Not shared' : summary.completed ? 'Completed' : summary.watched ? 'In progress' : 'Not started';
          const answers = summary.total ? `${summary.correct}/${summary.total} · ${summary.accuracy}%` : 'No answers yet';
          return `<div class="student-report-row"><strong>${escape(student.name)}</strong><span class="student-report-status ${shared ? 'is-shared' : ''}">${status}</span><span>${shared ? `${summary.progress}% watched` : '—'}</span><span>${answers}</span></div>`;
        }).join('');
        return `<article class="teacher-report-course"><header><div><span class="fade-eyebrow">${escape(language(course.sourceLanguage))} · ${escape(language(course.translationLanguage))}</span><h2>${escape(course.title)}</h2></div><span class="teacher-report-checkpoints">${course.teacherContent?.quizzes?.checkpoints?.length || 0} checkpoints</span></header><div class="student-report-head"><span>Student</span><span>Access</span><span>Viewing</span><span>Quiz accuracy</span></div>${studentRows}</article>`;
      }).join('');
    } catch (error) {
      container.innerHTML = `<p class="course-empty">Could not load student progress: ${escape(error.message)}</p>`;
    }
  }

  function chooseStudent() {
    const course = state().currentCourse;
    if (!course || window.FadeAuth?.role !== 'student' || !access.canOpen(course, window.FadeAuth.accountId)) return;
    course.mode = 'student';
    course.teacherContent = null;
    const content = editor.clone(course.originalContent);
    content.videoUrl = course.videoUrl;
    window.FadeCourseStore.put(course).then(() => window.FadeApp.startContent(content, course, 0)).catch(error => window.FadeApp.toast(`Could not save this course: ${error.message}`));
  }

  function chooseTeacher() {
    const current = state();
    if (!current.currentCourse || window.FadeAuth?.role !== 'teacher' || !access.canOpen(current.currentCourse, window.FadeAuth.accountId)) return;
    current.content = editor.clone(current.currentCourse.teacherContent || current.originalContent);
    current.currentCourse.mode = 'teacher';
    current.activeCourseId = current.currentCourse.id;
    renderReview();
    window.FadeApp.switchView('teacherReview');
  }

  function renderReview() {
    const content = state().content;
    if (!content) return;
    $('#reviewCourseTitle').textContent = content.title || 'Review lesson content';
    const cues = content.cues || [];
    const cueOptions = cues.map(cue => `<option value="${escape(cue.id)}">${time(cue.start)} · ${escape(cue.source_text.slice(0, 64))}</option>`).join('');
    $('#addAnnotationForm').elements.cueId.innerHTML = cueOptions;
    $('#addCultureForm').elements.cueId.innerHTML = '<option value="">None</option>' + cueOptions;
    $('#reviewTranslations').innerHTML = cues.map(cue => `<article class="editor-card"><div class="editor-card-context"><span>${escape(cue.id)} · ${time(cue.start)}</span><p>${escape(cue.source_text)}</p></div><label>Translation<textarea rows="2" data-translation-cue="${escape(cue.id)}">${escape(cue.translation_text || '')}</textarea></label></article>`).join('');

    const categoryOptions = ['fixed_expression', 'idiom', 'collocation', 'grammar_pattern', 'noun', 'verb', 'adjective', 'adverb', 'other'];
    const annotations = cues.flatMap(cue => (cue.annotations || []).map(annotation => ({ cue, annotation })));
    $('#reviewAnnotations').innerHTML = annotations.map(({ cue, annotation }) => {
      const concept = (content.vocabulary.items || []).find(item => String(item.id) === String(annotation.concept_id));
      const annotationId = annotation.id || annotation.occurrence_id;
      return `<article class="editor-card"><div class="editor-card-context"><span>${escape(cue.id)} · ${escape(annotation.category || 'other')}</span><p>${escape(annotation.text)}</p></div><div class="editor-form-grid"><label>Translation<input data-concept-field="translation" data-concept-id="${escape(annotation.concept_id)}" value="${escape(annotation.translation || concept?.translation || '')}"></label><label>Category<select data-concept-field="category" data-concept-id="${escape(annotation.concept_id)}">${categoryOptions.map(value => `<option value="${value}" ${value === (annotation.category || 'other') ? 'selected' : ''}>${value}</option>`).join('')}</select></label><label>Difficulty<select data-concept-field="difficulty" data-concept-id="${escape(annotation.concept_id)}">${[1,2,3,4].map(value => `<option value="${value}" ${Number(annotation.difficulty) === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label><button class="editor-remove" data-remove-annotation="${escape(annotationId)}" type="button">Remove element</button></div></article>`;
    }).join('') || '<p class="course-empty">No language elements yet. Add one using an exact phrase from a subtitle.</p>';

    $('#reviewCulture').innerHTML = (content.culture.notes || []).map(note => `<article class="editor-card" data-culture-card="${escape(note.id)}"><div class="editor-form-grid"><label>Appears at (seconds)<input type="number" min="0" step="0.1" data-culture-field="trigger_time" value="${Number(note.trigger_time) || 0}"></label><label>Title<input data-culture-field="title" value="${escape(note.title || 'Culture note')}"></label><label class="editor-wide">Explanation<textarea rows="3" data-culture-field="body">${escape(note.body || '')}</textarea></label><button class="fade-outline" data-save-culture="${escape(note.id)}" type="button">Save note</button><button class="editor-remove" data-remove-culture="${escape(note.id)}" type="button">Remove note</button></div></article>`).join('') || '<p class="course-empty">No culture notes yet.</p>';

    $('#reviewQuizzes').innerHTML = (content.quizzes.questions || []).map(question => `<article class="editor-card" data-question-card="${escape(question.id)}"><label>Question<textarea rows="2" data-question-field="prompt">${escape(question.prompt || '')}</textarea></label><label>Options, one per line<textarea rows="4" data-question-field="options">${escape((question.options || []).join('\n'))}</textarea></label><div class="editor-form-grid"><label>Correct answer<select data-question-field="correctIndex">${(question.options || []).map((option, index) => `<option value="${index}" ${index === Number(question.correct_option_index) ? 'selected' : ''}>${index + 1} · ${escape(option)}</option>`).join('')}</select></label><label>Knowledge point<input data-question-field="category" value="${escape(question.category || 'comprehension')}"></label><label class="editor-wide">Explanation<textarea rows="2" data-question-field="explanation">${escape(question.explanation || '')}</textarea></label><button class="fade-outline" data-save-question="${escape(question.id)}" type="button">Save question</button><button class="editor-remove" data-remove-question="${escape(question.id)}" type="button">Remove question</button></div></article>`).join('') || '<p class="course-empty">No quiz questions yet.</p>';
    updateAddQuestionOptions();
  }

  function updateAddQuestionOptions() {
    const form = $('#addQuestionForm');
    const options = form.elements.options.value.split('\n').map(value => value.trim()).filter(Boolean);
    const selected = Number(form.elements.correctIndex.value) || 0;
    form.elements.correctIndex.innerHTML = options.map((value, index) => `<option value="${index}">${index + 1} · ${escape(value)}</option>`).join('');
    if (options.length) form.elements.correctIndex.value = String(Math.min(selected, options.length - 1));
  }

  function saveReview() {
    const current = state();
    if (window.FadeAuth?.role !== 'teacher' || !access.canOpen(current.currentCourse, window.FadeAuth?.accountId)) return false;
    const content = current.content;
    for (const cue of content.cues || []) {
      const chars = Array.from(cue.source_text || '');
      for (const annotation of cue.annotations || []) {
        if (!Number.isInteger(annotation.start_char) || !Number.isInteger(annotation.end_char) || annotation.start_char < 0 || annotation.end_char <= annotation.start_char || annotation.end_char > chars.length || chars.slice(annotation.start_char, annotation.end_char).join('') !== String(annotation.text || '')) {
          window.FadeApp.toast(`A learning element no longer matches subtitle ${cue.id}.`);
          return false;
        }
      }
    }
    for (const note of content.culture.notes || []) {
      if (!Number.isFinite(Number(note.trigger_time)) || Number(note.trigger_time) < 0 || Number(note.trigger_time) > Number(content.duration || Infinity)) {
        window.FadeApp.toast(`Check the display time for culture note “${note.title || 'Untitled'}”.`);
        return false;
      }
    }
    for (const question of content.quizzes.questions || []) {
      if (!question.prompt.trim() || question.options.length < 2 || question.options.some(option => !option.trim()) || question.correct_option_index < 0 || question.correct_option_index >= question.options.length) {
        window.FadeApp.toast('Check each question, its options, and its correct answer.');
        return false;
      }
    }
    const course = current.currentCourse;
    course.mode = 'teacher';
    course.teacherContent = editor.clone(content);
    course.updatedAt = new Date().toISOString();
    return window.FadeCourseStore.put(course).then(() => true).catch(error => { window.FadeApp.toast(`Could not save this course: ${error.message}`); return false; });
  }

  $('#chooseStudentMode')?.addEventListener('click', chooseStudent);
  $('#chooseTeacherMode')?.addEventListener('click', chooseTeacher);
  $('#saveReviewStart')?.addEventListener('click', async () => { if (await saveReview()) window.FadeApp.startContent(editor.clone(state().currentCourse.teacherContent), state().currentCourse, 0); });
  $('#saveReviewHome')?.addEventListener('click', async () => { if (await saveReview()) window.FadeApp.switchView('home'); });
  $('#discardReviewChanges')?.addEventListener('click', () => { state().content = editor.clone(state().currentCourse.teacherContent || state().originalContent); renderReview(); });

  $('#reviewTranslations')?.addEventListener('input', event => {
    const cueId = event.target.dataset.translationCue;
    if (cueId) editor.updateTranslation(state().content, cueId, event.target.value);
  });
  $('#reviewAnnotations')?.addEventListener('change', event => {
    const field = event.target.dataset.conceptField;
    const conceptId = event.target.dataset.conceptId;
    if (!field || !conceptId) return;
    const value = field === 'difficulty' ? Number(event.target.value) : event.target.value;
    for (const cue of state().content.cues) for (const annotation of cue.annotations || []) if (String(annotation.concept_id) === conceptId) annotation[field] = value;
    const concept = state().content.vocabulary.items.find(item => String(item.id) === conceptId);
    if (concept) concept[field] = value;
    renderReview();
  });
  $('#reviewAnnotations')?.addEventListener('click', event => {
    const button = event.target.closest('[data-remove-annotation]');
    if (!button) return;
    editor.removeAnnotation(state().content, button.dataset.removeAnnotation);
    renderReview();
  });
  $('#addAnnotationForm')?.addEventListener('submit', event => {
    event.preventDefault();
    try { editor.addAnnotation(state().content, Object.fromEntries(new FormData(event.currentTarget))); event.currentTarget.reset(); renderReview(); }
    catch (error) { window.FadeApp.toast(error.message); }
  });

  $('#reviewCulture')?.addEventListener('click', event => {
    const remove = event.target.closest('[data-remove-culture]');
    const save = event.target.closest('[data-save-culture]');
    if (remove) { editor.removeCultureNote(state().content, remove.dataset.removeCulture); renderReview(); }
    if (save) {
      const card = save.closest('[data-culture-card]');
      const note = state().content.culture.notes.find(item => item.id === save.dataset.saveCulture);
      note.trigger_time = Number(card.querySelector('[data-culture-field="trigger_time"]').value);
      note.title = card.querySelector('[data-culture-field="title"]').value;
      note.body = card.querySelector('[data-culture-field="body"]').value;
      state().content.culture.notes.sort((a, b) => a.trigger_time - b.trigger_time);
      renderReview();
    }
  });
  $('#addCultureForm')?.addEventListener('submit', event => {
    event.preventDefault();
    try { editor.addCultureNote(state().content, Object.fromEntries(new FormData(event.currentTarget))); event.currentTarget.reset(); renderReview(); }
    catch (error) { window.FadeApp.toast(error.message); }
  });

  $('#reviewQuizzes')?.addEventListener('input', event => {
    if (event.target.dataset.questionField !== 'options') return;
    const card = event.target.closest('[data-question-card]');
    const select = card.querySelector('[data-question-field="correctIndex"]');
    const selected = Number(select.value) || 0;
    const options = event.target.value.split('\n').map(value => value.trim()).filter(Boolean);
    select.innerHTML = options.map((value, index) => `<option value="${index}">${index + 1} · ${escape(value)}</option>`).join('');
    if (options.length) select.value = String(Math.min(selected, options.length - 1));
  });
  $('#reviewQuizzes')?.addEventListener('click', event => {
    const remove = event.target.closest('[data-remove-question]');
    const save = event.target.closest('[data-save-question]');
    if (remove) { editor.removeQuestion(state().content, remove.dataset.removeQuestion); renderReview(); }
    if (save) {
      const card = save.closest('[data-question-card]');
      const input = field => card.querySelector(`[data-question-field="${field}"]`);
      try {
        editor.editQuestion(state().content, save.dataset.saveQuestion, { prompt: input('prompt').value, options: input('options').value.split('\n').map(value => value.trim()).filter(Boolean), correctIndex: input('correctIndex').value, explanation: input('explanation').value });
        const question = state().content.quizzes.questions.find(item => item.id === save.dataset.saveQuestion);
        question.category = input('category').value;
        renderReview();
      } catch (error) { window.FadeApp.toast(error.message); }
    }
  });
  $('#addQuestionForm')?.elements.options.addEventListener('input', updateAddQuestionOptions);
  $('#addQuestionForm')?.addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    values.options = values.options.split('\n');
    try { editor.addQuestion(state().content, values); form.reset(); renderReview(); }
    catch (error) { window.FadeApp.toast(error.message); }
  });

  window.FadeWorkflow = { createFromPackage, renderHome, renderTeacherReport, openCourse, showMode, renderReview };
})();
