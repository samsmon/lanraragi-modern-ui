// =========================================================================
// Reading History & Local Storage Manager
// =========================================================================
const ReadingHistory = {
  STORAGE_KEY: "lrr_reading_history",

  getAll() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.warn("Failed to read reading history:", e);
      return {};
    }
  },

  getProgress(arcid, fallbackItem = null) {
    if (!arcid) return null;
    const all = this.getAll();
    if (all[arcid]) return all[arcid];
    if (fallbackItem && fallbackItem.progress && fallbackItem.progress > 0) {
      return {
        arcid: fallbackItem.arcid,
        lastPage: fallbackItem.progress,
        pagecount: fallbackItem.pagecount || 0,
        title: fallbackItem.title || "",
        tags: fallbackItem.tags || "",
        updatedAt: fallbackItem.lastreadtime ? fallbackItem.lastreadtime * 1000 : Date.now()
      };
    }
    return null;
  },

  saveProgress(arcid, page, pagecount, meta = {}) {
    if (!arcid || !page) return;
    try {
      const all = this.getAll();
      const existing = all[arcid] || {};
      const activeArchive = (typeof currentArchive !== "undefined" && currentArchive && currentArchive.arcid === arcid) ? currentArchive : null;
      let title = meta.title || existing.title;
      if (!title && activeArchive) {
        title = activeArchive.title;
      }
      let tags = meta.tags !== undefined ? meta.tags : existing.tags;
      if (tags === undefined && activeArchive) {
        tags = activeArchive.tags;
      }
      const totalPages = pagecount || existing.pagecount || (activeArchive ? activeArchive.pagecount : 0) || 0;

      const updated = {
        arcid: arcid,
        lastPage: page,
        pagecount: totalPages,
        title: title || "Untitled Manga",
        tags: tags || "",
        updatedAt: Date.now()
      };

      all[arcid] = updated;
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(all));

      // Asynchronously sync with LANraragi backend without blocking
      this.syncBackend(arcid, page);
    } catch (e) {
      console.warn("Failed to save reading history:", e);
    }
  },

  async syncBackend(arcid, page) {
    try {
      await fetch(`/api/archives/${arcid}/progress/${page}`, { method: 'PUT' });
    } catch (err) {
      console.debug("Backend progress sync failed:", err);
    }
  },

  removeProgress(arcid) {
    if (!arcid) return;
    try {
      const all = this.getAll();
      if (all[arcid]) {
        delete all[arcid];
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(all));
      }
    } catch (e) {
      console.warn("Failed to remove progress:", e);
    }
  },

  clearAll() {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (e) {
      console.warn("Failed to clear reading history:", e);
    }
  },

  getList() {
    const all = this.getAll();
    return Object.values(all).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }
};
