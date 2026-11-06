// =========================================================================
// LANraragi Desktop Ergonomics, Hotkeys & State Sync
// =========================================================================

function isInputElement(el) {
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

// Sync active state between sidebar and navigation views
function syncSidebarActive(viewName) {
  document.querySelectorAll('.sidebar-nav-item').forEach(i => i.classList.remove('active'));
  const target = document.getElementById(`sidebar-nav-${viewName}`);
  if (target) target.classList.add('active');
}

// Sync reading history count badge in the sidebar
function syncSidebarHistoryCount() {
  const sidebarBadge = document.getElementById('sidebar-history-count');
  if (!sidebarBadge) return;
  try {
    const items = typeof ReadingHistory !== 'undefined' ? ReadingHistory.getList() : [];
    sidebarBadge.innerText = items.length;
  } catch (err) {
    console.debug('Could not sync history count:', err);
  }
}

// Desktop Keyboard Shortcuts
function setupDesktopHotkeys() {
  window.addEventListener('keydown', (e) => {
    const readerModal = document.getElementById('reader-modal');
    if (readerModal && readerModal.classList.contains('active')) return;

    const searchInput = document.getElementById('search-input');
    const searchSuggestions = document.getElementById('search-suggestions');
    const sheetEl = document.getElementById('sheet');
    const isInputFocused = isInputElement(document.activeElement);

    // Escape Key: blur search / dismiss suggestions / close drawer
    if (e.key === 'Escape') {
      if (document.activeElement === searchInput) {
        searchInput.blur();
        if (searchSuggestions) searchSuggestions.style.display = 'none';
        return;
      }
      if (searchSuggestions && searchSuggestions.style.display !== 'none') {
        searchSuggestions.style.display = 'none';
        return;
      }
      if (sheetEl && sheetEl.classList.contains('open')) {
        if (typeof closeDrawer === 'function') closeDrawer();
        return;
      }
    }

    // Quick Search Focus: '/' or Ctrl+K / Cmd+K
    if ((e.key === '/' && !isInputFocused) || ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K'))) {
      e.preventDefault();
      if (searchInput) { searchInput.focus(); searchInput.select(); }
      return;
    }

    if (isInputFocused) return;

    // View Switching: '1' -> Library, '2' -> Explore, '3' -> History
    if (['1', '2', '3'].includes(e.key)) {
      e.preventDefault();
      const views = { '1': 'library', '2': 'explore', '3': 'history' };
      if (typeof switchMainView === 'function') switchMainView(views[e.key]);
      return;
    }

    // 'r' or 'R': Trigger random archive drawer
    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      if (typeof triggerRandom === 'function') triggerRandom();
    }
  });
}

// Manage pagination placement based on viewport
function setupDesktopPagination() {
  function repositionPagination() {
    const paginationWrap = document.getElementById('footer-pagination-wrap');
    const viewLibrary = document.getElementById('view-library');
    const mangaGrid = document.getElementById('manga-grid');
    const appFooter = document.getElementById('app-footer');
    const searchWrap = document.querySelector('.footer-search-wrap');
    if (!paginationWrap) return;

    if (window.innerWidth >= 1024) {
      if (viewLibrary && paginationWrap.parentElement !== viewLibrary) {
        if (mangaGrid && mangaGrid.nextSibling) viewLibrary.insertBefore(paginationWrap, mangaGrid.nextSibling);
        else viewLibrary.appendChild(paginationWrap);
      }
    } else if (appFooter && paginationWrap.parentElement !== appFooter) {
      if (searchWrap) appFooter.insertBefore(paginationWrap, searchWrap);
      else appFooter.prepend(paginationWrap);
    }
  }

  repositionPagination();
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(repositionPagination, 150);
  });
}

// Automatically load archive modal when page loads with ?id=...
async function handleUrlSearchParam() {
  const arcId = new URLSearchParams(window.location.search).get('id');
  if (!arcId) return;
  try {
    const res = await fetch(`/api/archives/${encodeURIComponent(arcId)}/metadata`);
    if (!res.ok) return;
    const data = await res.json();
    if (data) {
      if (!data.arcid) data.arcid = arcId;
      if (typeof openDrawer === 'function') openDrawer(data);
    }
  } catch (err) {
    console.debug('Failed to load archive from URL id param:', err);
  }
}

// Hook switchMainView to sync sidebar active item
function hookViewSwitching() {
  if (typeof switchMainView === 'function') {
    const originalSwitchMainView = switchMainView;
    window.switchMainView = function (viewName) {
      originalSwitchMainView(viewName);
      syncSidebarActive(viewName);
      syncSidebarHistoryCount();
    };
  }
}

// Hook closeDrawer to clean up ?id= param from URL without reload
function hookCloseDrawer() {
  if (typeof closeDrawer === 'function') {
    const orig = closeDrawer;
    window.closeDrawer = function () {
      orig();
      if (window.history && window.history.replaceState) {
        const u = new URL(window.location);
        if (u.searchParams.has('id')) {
          u.searchParams.delete('id');
          window.history.replaceState({}, '', u.pathname + (u.search || '') + u.hash);
        }
      }
    };
  }
}

// Register PWA Service Worker
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(err => console.debug('SW skipped:', err));
    });
  }
}

// Initialize Desktop Integration
function initDesktop() {
  setupDesktopHotkeys();
  hookViewSwitching();
  hookCloseDrawer();
  setupDesktopPagination();
  syncSidebarActive('library');
  syncSidebarHistoryCount();
  registerServiceWorker();
  handleUrlSearchParam();

  const historyBadge = document.getElementById('history-count-badge');
  if (historyBadge && window.MutationObserver) {
    const observer = new MutationObserver(() => syncSidebarHistoryCount());
    observer.observe(historyBadge, { childList: true, characterData: true, subtree: true });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDesktop);
} else {
  initDesktop();
}
