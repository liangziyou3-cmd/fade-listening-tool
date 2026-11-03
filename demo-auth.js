(function () {
  const KEY = 'fade-demo-account-id';
  const access = window.FadeCourseAccess;
  let current = null;
  const $ = selector => document.querySelector(selector);
  function showApp(accountId) {
    const next = access.account(accountId);
    if (current?.id !== next?.id) clearLesson();
    current = next;
    const signedIn = Boolean(current);
    document.body.classList.toggle('auth-signed-in', signedIn);
    $('#demoAccountName').textContent = current?.name || '';
    $('#authView').hidden = signedIn;
    window.FadeApp?.updateAnalyzerActionLabels();
    window.FadeApp?.restoreAnalyzerDraft(current?.id);
    if (signedIn) window.FadeApp?.switchView('import');
  }
  function clearLesson() {
    const app = window.FadeApp;
    if (!app) return;
    const state = app.state;
    clearInterval(state.poll);
    clearInterval(state.analysisTimer);
    clearTimeout(state.analysisPoll);
    clearTimeout(state.cultureAlertTimer);
    try { state.player?.destroy(); } catch {}
    Object.assign(state, { player: null, playerReady: false, content: null, session: null, currentCourse: null, activeCourseId: null, pendingPackage: null, pendingContent: null, originalContent: null, agentReady: false });
    window.FadeApp?.resetAnalyzerState();
    $('#quizModal').classList.remove('show');
  }
  function setPanel(panel) {
    const register = panel === 'register';
    $('#loginPanel').hidden = register;
    $('#registerPanel').hidden = !register;
    $('#authLoginTab').classList.toggle('active', !register);
    $('#authRegisterTab').classList.toggle('active', register);
    $('#authLoginTab').setAttribute('aria-selected', String(!register));
    $('#authRegisterTab').setAttribute('aria-selected', String(register));
    $('#authMessage').textContent = '';
  }
  $('#authLoginTab').addEventListener('click', () => setPanel('login'));
  $('#authRegisterTab').addEventListener('click', () => setPanel('register'));
  $('#loginPanel').addEventListener('submit', event => {
    event.preventDefault();
    const email = event.currentTarget.elements.email.value.trim();
    const password = event.currentTarget.elements.password.value;
    if (!email || !password) {
      $('#authMessage').textContent = 'Enter an email and password to continue.';
      return;
    }
    const accountId = new FormData(event.currentTarget).get('role') === 'teacher' ? 'teacher-1' : 'student-1';
    try { localStorage.setItem(KEY, accountId); } catch {}
    showApp(accountId);
  });
  $('#registerPanel').addEventListener('submit', event => {
    event.preventDefault();
    $('#authMessage').textContent = 'Registration is not available in this demo. Choose Login to enter a preset account.';
  });
  $('#demoLogout').addEventListener('click', async () => {
    if (window.FadeApp?.state.currentCourse) await window.FadeApp.persistCourse();
    const accountId = current?.id;
    clearLesson();
    try { if (accountId) localStorage.removeItem(`fade-analysis-draft:${accountId}`); } catch {}
    try { localStorage.removeItem(KEY); } catch {}
    showApp(null);
    setPanel('login');
  });
  $('#landingLogout')?.addEventListener('click', () => $('#demoLogout').click());
  window.FadeAuth = { get current() { return current; }, get accountId() { return current?.id || null; }, get role() { return current?.role || null; } };
  (async () => {
    try { await window.FadeCourseStore.migrateLegacyCourses(); } catch (error) { $('#authMessage').textContent = `Local courses could not be migrated: ${error.message}`; }
    let saved = null;
    try { saved = localStorage.getItem(KEY); } catch {}
    showApp(saved === 'teacher-1' || saved === 'student-1' ? saved : null);
  })();
})();
