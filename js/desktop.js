// =========================================================================
// LANraragi Desktop Ergonomics, Hotkeys & State Sync
// =========================================================================

function isInputElement(el) {
  if (!el) return false;
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.isContentEditable
  );
}

// Sync active state between sidebar and navigation views
function syncSidebarActive(viewName) {
  document.querySelectorAll('.sidebar-nav-item').forEach((item) => {
    item.classList.remove('active');
  });
  const target = document.getElementById(`sidebar-nav-${viewName}`);
  if (target) {
    target.classList.add('active');
  }
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
    if (readerModal && readerModal.classList.contains('active')) {
      // Reader has its own keyboard navigation
      return;
    }

    const searchInput = document.getElementById('search-input');
    const searchSuggestions = document.getElementById('search-suggestions');
    const sheetEl = document.getElementById('sheet');
    const isInputFocused = isInputElement(document.activeElement);

    // Escape Key: blur search input / dismiss suggestions / close drawer
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
    if (
      (e.key === '/' && !isInputFocused) ||
      ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K'))
    ) {
      e.preventDefault();
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
      return;
    }

    // Single key triggers: ignore if typing in any form input
    if (isInputFocused) return;

    // View Switching: '1' -> Library, '2' -> Explore, '3' -> History
    if (e.key === '1') {
      e.preventDefault();
      if (typeof switchMainView === 'function') switchMainView('library');
      return;
    }
    if (e.key === '2') {
      e.preventDefault();
      if (typeof switchMainView === 'function') switchMainView('explore');
      return;
    }
    if (e.key === '3') {
      e.preventDefault();
      if (typeof switchMainView === 'function') switchMainView('history');
      return;
    }

    // 'r' or 'R': Trigger random archive drawer
    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      if (typeof triggerRandom === 'function') triggerRandom();
      return;
    }
  });
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

// Register PWA Service Worker
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.debug('ServiceWorker registration skipped:', err);
      });
    });
  }
}

// Initialize Desktop Integration
function initDesktop() {
  setupDesktopHotkeys();
  hookViewSwitching();
  syncSidebarActive('library');
  syncSidebarHistoryCount();
  registerServiceWorker();

  // Watch for history changes to keep sidebar counter badge updated
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
