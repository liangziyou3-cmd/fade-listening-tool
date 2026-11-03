(function () {
  const KEY = 'fade-demo-account-id';
  const access = window.FadeCourseAccess;
  let current = null;
  let authRevision = 0;
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
    const form = event.currentTarget;
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    const inviteCode = form.elements.invite_code.value.trim();
    if (!inviteCode || !email || !password) {
      $('#authMessage').textContent = 'Enter the invite code, email, and password to continue.';
      return;
    }
    const accountId = new FormData(form).get('role') === 'teacher' ? 'teacher-1' : 'student-1';
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    $('#authMessage').textContent = 'Checking invite code…';
    fetch('/api/access', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invite_code: inviteCode }) })
      .then(async response => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || `Access check failed (${response.status}).`);
        authRevision += 1;
        try { localStorage.setItem(KEY, accountId); } catch {}
        form.reset();
        showApp(accountId);
      })
      .catch(error => { $('#authMessage').textContent = error.message; })
      .finally(() => { submit.disabled = false; });
  });
  $('#registerPanel').addEventListener('submit', event => {
    event.preventDefault();
    $('#authMessage').textContent = 'Registration is not available in this demo. Choose Login to enter a preset account.';
  });
  $('#demoLogout').addEventListener('click', async () => {
    authRevision += 1;
    if (window.FadeApp?.state.currentCourse) await window.FadeApp.persistCourse();
    const accountId = current?.id;
    clearLesson();
    try { if (accountId) localStorage.removeItem(`fade-analysis-draft:${accountId}`); } catch {}
    try { localStorage.removeItem(KEY); } catch {}
    await fetch('/api/access', { method: 'DELETE', credentials: 'same-origin' }).catch(() => {});
    showApp(null);
    setPanel('login');
  });
  $('#landingLogout')?.addEventListener('click', () => $('#demoLogout').click());
  window.FadeAuth = { get current() { return current; }, get accountId() { return current?.id || null; }, get role() { return current?.role || null; } };
  (async () => {
    const revision = authRevision;
    try { await window.FadeCourseStore.migrateLegacyCourses(); } catch (error) { $('#authMessage').textContent = `Local courses could not be migrated: ${error.message}`; }
    let saved = null;
    try { saved = localStorage.getItem(KEY); } catch {}
    const session = await fetch('/api/access', { credentials: 'same-origin' }).then(response => response.ok).catch(() => false);
    if (revision === authRevision) showApp(session && (saved === 'teacher-1' || saved === 'student-1') ? saved : null);
  })();
})();
