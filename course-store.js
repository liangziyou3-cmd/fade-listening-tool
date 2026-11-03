(function () {
  const DB_NAME = 'fade-listening-mvp';
  const STORE_NAME = 'courses';
  let databasePromise;

  function openDatabase() {
    if (!('indexedDB' in window)) return Promise.reject(new Error('This browser does not support local course storage.'));
    if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open local course storage.'));
    });
    return databasePromise;
  }

  async function request(mode, operation) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const result = operation(transaction.objectStore(STORE_NAME));
      transaction.oncomplete = () => resolve(result?.result);
      transaction.onerror = () => reject(transaction.error || result?.error || new Error('Could not save the course.'));
      transaction.onabort = () => reject(transaction.error || new Error('Course storage transaction was cancelled.'));
    });
  }

  window.FadeCourseStore = {
    getAll: () => request('readonly', store => store.getAll()),
    get: id => request('readonly', store => store.get(String(id))),
    put: course => request('readwrite', store => store.put(course)),
    remove: id => request('readwrite', store => store.delete(String(id))),
    async migrateLegacyCourses() {
      const courses = await this.getAll();
      for (const course of courses) {
        if (course.ownerId) continue;
        course.ownerId = course.mode === 'student' ? 'student-1' : 'teacher-1';
        await this.put(course);
      }
    }
  };
})();
