// =========================================================================
// LANraragi Desktop Ergonomics, Hotkeys & State Sync
// =========================================================================

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
  const params = new URLSearchParams(window.location.search);
  const arcId = params.get('id');
  if (!arcId) return;

  const pageParam = parseInt(params.get('page'), 10);
  try {
    const res = await fetch(`/api/archives/${encodeURIComponent(arcId)}/metadata`);
    if (!res.ok) return;
    const data = await res.json();
    if (!data) return;
    if (!data.arcid) data.arcid = arcId;

    if (!isNaN(pageParam) && pageParam >= 1) {
      if (typeof openReader === 'function') {
        openReader(arcId, pageParam, data.title, false);
      }
    } else {
      if (typeof openDrawer === 'function') {
        openDrawer(data, false);
      }
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
      const readerModal = document.getElementById('reader-modal');
      if (readerModal && readerModal.classList.contains('active')) return;
      if (window.history && window.history.replaceState) {
        const u = new URL(window.location);
        if (u.searchParams.has('id')) {
          u.searchParams.delete('id');
          if (typeof currentPageNum !== 'undefined' && currentPageNum > 1) {
            u.searchParams.set('page', currentPageNum);
          }
          window.history.replaceState({ type: 'library', page: currentPageNum || 1 }, '', u.pathname + (u.search || '') + u.hash);
        }
      }
    };
  }
}

// Setup popstate listener for back/forward navigation sync
function setupUrlRouting() {
  window.addEventListener('popstate', (e) => {
    const params = new URLSearchParams(window.location.search);
    const arcId = params.get('id');
    const pageParam = parseInt(params.get('page'), 10);
    const targetPage = (!isNaN(pageParam) && pageParam >= 1) ? pageParam : 1;

    const readerModal = document.getElementById('reader-modal');
    const isReaderOpen = readerModal && readerModal.classList.contains('active');
    const sheet = document.getElementById('sheet');
    const isDrawerOpen = sheet && sheet.classList.contains('open');

    if (arcId) {
      if (params.has('page')) {
        if (isReaderOpen && typeof currentReaderArcId !== 'undefined' && currentReaderArcId === arcId) {
          if (typeof isWebtoonMode !== 'undefined' && isWebtoonMode && typeof jumpToPage === 'function') {
            jumpToPage(targetPage);
          } else if (typeof loadPagedPage === 'function') {
            loadPagedPage(targetPage - 1);
          }
        } else {
          if (typeof openReader === 'function') openReader(arcId, targetPage, null, false);
        }
      } else {
        if (isReaderOpen && typeof closeReader === 'function') closeReader(false);
        if (!isDrawerOpen && typeof openDrawerFromHistory === 'function') openDrawerFromHistory(arcId);
      }
    } else {
      if (isReaderOpen && typeof closeReader === 'function') closeReader(false);
      if (isDrawerOpen && typeof closeDrawer === 'function') closeDrawer();
      if (typeof currentPageNum !== 'undefined' && currentPageNum !== targetPage) {
        if (typeof goToPage === 'function') goToPage(targetPage, false);
      }
    }
  });
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
  hookViewSwitching();
  hookCloseDrawer();
  setupDesktopPagination();
  syncSidebarActive('library');
  syncSidebarHistoryCount();
  registerServiceWorker();
  handleUrlSearchParam();
  setupUrlRouting();

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
