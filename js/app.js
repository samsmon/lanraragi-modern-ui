// =========================================================================
// Application State
// =========================================================================
let currentSearch = "";
let currentLanguage = "";
let currentPageNum = 1;
const PAGE_SIZE = 24;
let totalRecords = 0;
let totalPages = 1;
let isLoading = false;
let isDense = false;
let currentSortBy = "date_added";
let currentSortOrder = "desc";
let currentArchive = null;

// Taxonomy State
let rawTaxonomyStats = [];
let currentTaxonomyNamespace = "artist";
let taxonomyFilterQuery = "";
let searchDebounceTimeout = null;

// Scroll state
let lastScrollY = window.scrollY;
let scrollTicking = false;

// DOM Elements
let mangaGrid = null;
let searchInput = null;
let clearBtn = null;
let loadingSentinel = null;
let libraryCountText = null;
let currentFilterBadge = null;
let currentFilterText = null;
let sheet = null;
let sheetBackdrop = null;
let sheetContent = null;
let appFooter = null;

function initDOMElements() {
  mangaGrid = document.getElementById("manga-grid");
  searchInput = document.getElementById("search-input");
  clearBtn = document.getElementById("clear-search-btn");
  loadingSentinel = document.getElementById("loading-sentinel");
  libraryCountText = document.getElementById("library-count-text");
  currentFilterBadge = document.getElementById("current-filter-badge");
  currentFilterText = document.getElementById("current-filter-text");
  sheet = document.getElementById("sheet");
  sheetBackdrop = document.getElementById("sheet-backdrop");
  sheetContent = document.getElementById("sheet-content");
  appFooter = document.getElementById("app-footer");
}

// =========================================================================
// Initialization
// =========================================================================
function initApp() {
  initDOMElements();
  if (typeof preloadDatabaseTags === "function") preloadDatabaseTags();
  if (typeof updateReaderDirButton === "function") updateReaderDirButton();
  if (typeof updateSpreadButton === "function") updateSpreadButton();
  fetchArchives(1);
  setupKeyboardControls();
  if (typeof setupSwipeGestures === "function") setupSwipeGestures();
  setupSheetGestures();
}

window.addEventListener("DOMContentLoaded", initApp);
// Also initialize immediately if DOM is already parsed
if (document.readyState === "interactive" || document.readyState === "complete") {
  initApp();
}

// Toggle Grid Density
function toggleDensity() {
  if (!mangaGrid) mangaGrid = document.getElementById("manga-grid");
  isDense = !isDense;
  if (isDense) {
    mangaGrid.classList.remove("grid-comfortable");
    mangaGrid.classList.add("grid-dense");
  } else {
    mangaGrid.classList.remove("grid-dense");
    mangaGrid.classList.add("grid-comfortable");
  }
}

// Main View Switching (Library vs Explore vs History)
function switchMainView(viewName) {
  document.querySelectorAll(".view-pane").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".sidebar-nav-item").forEach(t => t.classList.remove("active"));
  const footPagination = document.getElementById("footer-pagination-wrap");
  const footSearchWrap = document.querySelector(".footer-search-wrap");

  if (viewName === "library") {
    const viewLib = document.getElementById("view-library");
    const tabLib = document.getElementById("nav-tab-library");
    if (viewLib) viewLib.classList.add("active");
    if (tabLib) tabLib.classList.add("active");
    const sideLib = document.getElementById("sidebar-nav-library");
    if (sideLib) sideLib.classList.add("active");
    if (footPagination) footPagination.style.display = "flex";
    if (footSearchWrap) footSearchWrap.style.display = "flex";
  } else if (viewName === "explore") {
    const viewExp = document.getElementById("view-explore");
    const tabExp = document.getElementById("nav-tab-explore");
    if (viewExp) viewExp.classList.add("active");
    if (tabExp) tabExp.classList.add("active");
    const sideExp = document.getElementById("sidebar-nav-explore");
    if (sideExp) sideExp.classList.add("active");
    if (footPagination) footPagination.style.display = "none";
    if (footSearchWrap) footSearchWrap.style.display = "flex";
    loadTaxonomyStats();
  } else if (viewName === "history") {
    const viewHist = document.getElementById("view-history");
    const tabHist = document.getElementById("nav-tab-history");
    if (viewHist) viewHist.classList.add("active");
    if (tabHist) tabHist.classList.add("active");
    const sideHist = document.getElementById("sidebar-nav-history");
    if (sideHist) sideHist.classList.add("active");
    if (footPagination) footPagination.style.display = "none";
    if (footSearchWrap) footSearchWrap.style.display = "none";
    renderHistoryView();
  }
  if (!appFooter) appFooter = document.getElementById("app-footer");
  if (appFooter) appFooter.classList.remove("footer-hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// =========================================================================
// Search & LANraragi Native Query Parsing
// =========================================================================
function handleSearchInput(val) {
  if (!clearBtn) clearBtn = document.getElementById("clear-search-btn");
  if (clearBtn) clearBtn.classList.toggle("visible", val.length > 0);
  if (typeof getActiveSearchToken === "function" && typeof renderTagSuggestions === "function") {
    const { token } = getActiveSearchToken(val);
    renderTagSuggestions(token);
  }
  clearTimeout(searchDebounceTimeout);
  searchDebounceTimeout = setTimeout(() => {
    executeSearch(val.trim());
  }, 400);
}

function handleSearchKeyDown(e) {
  if (e.key === "Enter") {
    clearTimeout(searchDebounceTimeout);
    if (!searchInput) searchInput = document.getElementById("search-input");
    executeSearch(searchInput ? searchInput.value.trim() : "");
  }
}

function executeSearch(query) {
  currentSearch = query;
  updateFilterBadge();
  goToPage(1);
}

function clearSearch() {
  if (!searchInput) searchInput = document.getElementById("search-input");
  if (!clearBtn) clearBtn = document.getElementById("clear-search-btn");
  if (searchInput) searchInput.value = "";
  if (clearBtn) clearBtn.classList.remove("visible");
  currentSearch = "";
  currentLanguage = "";
  document.querySelectorAll(".filter-row .badge").forEach(c => c.classList.remove("active"));
  const allChip = document.getElementById("filter-chip-all");
  if (allChip) allChip.classList.add("active");
  updateFilterBadge();
  goToPage(1);
}

function applyLanguageFilter(langTag, chipEl) {
  document.querySelectorAll(".filter-row .badge").forEach(c => c.classList.remove("active"));
  if (chipEl) {
    chipEl.classList.add("active");
  } else {
    const defaultChip = document.getElementById(langTag ? (langTag === "language:en" ? "filter-chip-en" : "filter-chip-ja") : "filter-chip-all");
    if (defaultChip) defaultChip.classList.add("active");
  }
  currentLanguage = langTag;
  updateFilterBadge();
  goToPage(1);
}

function updateFilterBadge() {
  if (!currentFilterBadge) currentFilterBadge = document.getElementById("current-filter-badge");
  if (!currentFilterText) currentFilterText = document.getElementById("current-filter-text");

  let activeParts = [];
  if (currentSearch) activeParts.push(`"${currentSearch}"`);
  if (currentLanguage) {
    activeParts.push(currentLanguage === "language:en" ? "English" : (currentLanguage === "language:ja" ? "Japanese" : currentLanguage));
  }

  if (activeParts.length > 0) {
    if (currentFilterText) currentFilterText.innerText = activeParts.join(" + ");
    if (currentFilterBadge) currentFilterBadge.style.display = "inline-flex";
  } else {
    if (currentFilterBadge) currentFilterBadge.style.display = "none";
  }
}

function changeSort(val) {
  const parts = val.split(":");
  currentSortBy = parts[0];
  currentSortOrder = parts[1];
  goToPage(1);
}

// Skeleton Cards Generator for Grid
function renderGridSkeletons(count = 10) {
  if (!mangaGrid) mangaGrid = document.getElementById("manga-grid");
  if (!mangaGrid) return;
  mangaGrid.innerHTML = "";
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const card = document.createElement("div");
    card.className = "manga-card manga-card-skeleton";
    card.innerHTML = `
      <div class="card-thumb-wrap skeleton"></div>
      <div class="card-info" style="display: flex; flex-direction: column; gap: 6px; padding: 10px;">
        <div class="skeleton" style="height: 13px; width: 85%; border-radius: 4px;"></div>
        <div class="skeleton" style="height: 11px; width: 55%; border-radius: 4px;"></div>
        <div class="card-meta" style="margin-top: 4px; display: flex; justify-content: space-between; align-items: center;">
          <div class="skeleton" style="height: 14px; width: 52px; border-radius: 4px;"></div>
          <div class="skeleton" style="height: 11px; width: 26px; border-radius: 4px;"></div>
        </div>
      </div>
    `;
    fragment.appendChild(card);
  }
  mangaGrid.appendChild(fragment);
}

// =========================================================================
// Fetch Archives from LANraragi Proxy API (Pagination Based)
// =========================================================================
async function fetchArchives(pageNum = 1) {
  if (isLoading) return;
  if (pageNum < 1) pageNum = 1;
  currentPageNum = pageNum;
  const startRecord = (currentPageNum - 1) * PAGE_SIZE;

  if (!mangaGrid) mangaGrid = document.getElementById("manga-grid");
  if (!libraryCountText) libraryCountText = document.getElementById("library-count-text");

  isLoading = true;
  if (mangaGrid && mangaGrid.children.length > 0 && !mangaGrid.querySelector(".manga-card-skeleton")) {
    mangaGrid.style.transition = "opacity 0.15s ease";
    mangaGrid.style.opacity = "0.35";
    mangaGrid.style.pointerEvents = "none";
  } else {
    renderGridSkeletons(10);
  }

  try {
    let filterComponents = [];
    if (currentSearch) filterComponents.push(currentSearch);
    if (currentLanguage && !currentSearch.toLowerCase().includes("language:")) {
      filterComponents.push(currentLanguage);
    }
    const finalFilter = typeof normalizeQuery === "function" ? normalizeQuery(filterComponents.join(", ")) : filterComponents.join(", ");

    let url = `/api/search?start=${startRecord}&length=${PAGE_SIZE}&sortby=${currentSortBy}&order=${currentSortOrder}`;
    if (finalFilter) {
      url += `&filter=${encodeURIComponent(finalFilter)}`;
    }

    const res = await fetch(url);
    const data = await res.json();

    totalRecords = data.recordsFiltered ?? data.recordsTotal ?? 0;
    totalPages = Math.max(1, Math.ceil(totalRecords / PAGE_SIZE));
    if (libraryCountText) libraryCountText.innerText = `${totalRecords.toLocaleString()} Archives`;

    updatePaginationUI();

    const rawItems = data.data ?? [];
    const items = rawItems.slice(0, PAGE_SIZE);
    if (items.length === 0) {
      if (mangaGrid) mangaGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--muted);">No manga found matching your query.</div>`;
      return;
    }

    renderMangaCards(items);
  } catch (err) {
    console.error("Error fetching archives:", err);
    if (libraryCountText) libraryCountText.innerText = "Error connecting to server";
    if (mangaGrid) mangaGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px 20px; color: var(--muted);">Failed to load page.</div>`;
  } finally {
    isLoading = false;
    if (mangaGrid) {
      mangaGrid.style.opacity = "1";
      mangaGrid.style.pointerEvents = "auto";
    }
  }
}

function goToPage(pageNum) {
  if (isNaN(pageNum) || pageNum < 1) pageNum = 1;
  if (pageNum > totalPages) pageNum = totalPages;
  window.scrollTo({ top: 0, behavior: "smooth" });
  fetchArchives(pageNum);
}

function updatePaginationUI() {
  const pageInput = document.getElementById("page-input");
  const pageTotalText = document.getElementById("page-total-text");
  const prevBtn = document.getElementById("page-prev-btn");
  const nextBtn = document.getElementById("page-next-btn");
  const firstBtn = document.getElementById("page-first-btn");
  const lastBtn = document.getElementById("page-last-btn");

  if (pageInput) pageInput.value = currentPageNum;
  if (pageTotalText) pageTotalText.innerText = totalPages;

  if (prevBtn) prevBtn.disabled = (currentPageNum <= 1);
  if (firstBtn) firstBtn.disabled = (currentPageNum <= 1);
  if (nextBtn) nextBtn.disabled = (currentPageNum >= totalPages);
  if (lastBtn) lastBtn.disabled = (currentPageNum >= totalPages);
}

// Render Cards
function renderMangaCards(items) {
  if (!mangaGrid) mangaGrid = document.getElementById("manga-grid");
  if (!mangaGrid) return;
  mangaGrid.innerHTML = "";
  const fragment = document.createDocumentFragment();
  items.forEach(item => {
    const card = document.createElement("div");
    card.className = "manga-card";
    card.dataset.arcid = item.arcid;

    const tags = (item.tags || "").split(",").map(t => t.trim());
    let artist = "";
    let lang = "";
    tags.forEach(t => {
      if (t.startsWith("artist:")) artist = t.replace("artist:", "");
      if (t === "language:english" || t === "language:en") lang = "EN";
      if (t === "language:japanese" || t === "language:ja") lang = "JA";
    });

    const thumbUrl = `/api/archives/${item.arcid}/thumbnail`;
    const prog = typeof ReadingHistory !== "undefined" ? ReadingHistory.getProgress(item.arcid, item) : null;
    const hasProgress = prog && prog.lastPage > 1;
    const totalP = item.pagecount || (prog ? prog.pagecount : 0) || 0;
    const percent = (hasProgress && totalP > 0) ? Math.min(100, Math.round((prog.lastPage / totalP) * 100)) : 0;

    card.innerHTML = `
      <div class="card-thumb-wrap">
        <img class="card-thumb" src="${thumbUrl}" loading="lazy" alt="${escapeHtml(item.title)}">
        ${lang ? `<span class="card-badge-top">${lang}</span>` : ""}
        ${hasProgress ? `<div class="card-progress-bar"><div class="card-progress-fill" style="width: ${percent}%;"></div></div>` : ""}
      </div>
      <div class="card-info">
        <div class="card-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
        <div class="card-meta">
          <span class="artist-badge">${escapeHtml(artist || "Unknown")}</span>
          ${hasProgress 
            ? `<span class="progress-badge">p. ${prog.lastPage}/${totalP || "?"}</span>` 
            : `<span>${item.pagecount || "?"}p</span>`
          }
        </div>
      </div>
    `;

    card.onclick = () => openDrawer(item);
    fragment.appendChild(card);
  });
  mangaGrid.appendChild(fragment);
}

// =========================================================================
// Dedicated Taxonomy / Browse Page Logic
// =========================================================================
async function loadTaxonomyStats() {
  if (rawTaxonomyStats.length > 0) {
    renderTaxonomy();
    return;
  }
  try {
    const res = await fetch("/api/database/stats");
    rawTaxonomyStats = await res.json();
    renderTaxonomy();
  } catch (err) {
    const taxGrid = document.getElementById("taxonomy-grid");
    if (taxGrid) taxGrid.innerHTML = `<div style="color: var(--muted); padding: 20px;">Failed to load tags taxonomy.</div>`;
  }
}

function switchTaxonomyNamespace(ns, btnEl) {
  document.querySelectorAll(".taxonomy-tabs .badge").forEach(b => b.classList.remove("active"));
  if (btnEl) btnEl.classList.add("active");
  currentTaxonomyNamespace = ns;
  const taxInput = document.getElementById("taxonomy-search-input");
  if (taxInput) taxInput.value = "";
  taxonomyFilterQuery = "";
  renderTaxonomy();
}

function filterTaxonomyList(query) {
  taxonomyFilterQuery = query.toLowerCase().trim();
  renderTaxonomy();
}

function renderTaxonomy() {
  const container = document.getElementById("taxonomy-grid");
  const sortSelect = document.getElementById("taxonomy-sort-select");
  if (!container || !sortSelect) return;
  const sortType = sortSelect.value;

  // Filter by current namespace (excluding date_added and source URLs)
  let filtered = rawTaxonomyStats.filter(item => {
    const ns = item.namespace || "";
    if (ns === "date_added" || ns === "source") return false;
    return ns === currentTaxonomyNamespace;
  });

  // Filter by user input
  if (taxonomyFilterQuery) {
    filtered = filtered.filter(item => (item.text || "").toLowerCase().includes(taxonomyFilterQuery));
  }

  // Sort
  if (sortType === "count") {
    filtered.sort((a, b) => (b.weight || 0) - (a.weight || 0));
  } else {
    filtered.sort((a, b) => (a.text || "").localeCompare(b.text || ""));
  }

  if (filtered.length === 0) {
    container.innerHTML = `<div style="color: var(--muted); padding: 30px; width: 100%; text-align: center;">No items found.</div>`;
    return;
  }

  // Limit to 400 for snappy DOM rendering
  const displayItems = filtered.slice(0, 400);
  container.innerHTML = displayItems.map(item => {
    const fullTag = item.namespace ? `${item.namespace}:${item.text}` : item.text;
    // Search format: exact match with $ if namespace like artist or group
    const queryTag = (item.namespace === "artist" || item.namespace === "group") ? `${item.namespace}:${item.text}$` : fullTag;
    return `
      <div class="tag-pill" onclick="selectTaxonomyTag('${escapeJs(queryTag)}')">
        <span>${escapeHtml(item.text)}</span>
        <span class="count">${item.weight}</span>
      </div>
    `;
  }).join("");
}

function selectTaxonomyTag(tagQuery) {
  if (!searchInput) searchInput = document.getElementById("search-input");
  if (!clearBtn) clearBtn = document.getElementById("clear-search-btn");
  if (searchInput) searchInput.value = tagQuery;
  if (clearBtn) clearBtn.classList.toggle("visible", true);
  switchMainView("library");
  executeSearch(tagQuery);
}

// =========================================================================
// Archive Detail Sheet (Drawer)
// =========================================================================
function openDrawer(item) {
  currentArchive = item;
  document.body.classList.add("modal-open");
  const tags = (item.tags || "").split(",").map(t => t.trim()).filter(Boolean);
  const thumbUrl = `/api/archives/${item.arcid}/thumbnail`;

  const grouped = { artist: [], group: [], language: [], character: [], parody: [], general: [] };
  tags.forEach(t => {
    if (t.startsWith("artist:")) grouped.artist.push(t);
    else if (t.startsWith("group:")) grouped.group.push(t);
    else if (t.startsWith("language:")) grouped.language.push(t);
    else if (t.startsWith("character:")) grouped.character.push(t);
    else if (t.startsWith("parody:")) grouped.parody.push(t);
    else if (!t.startsWith("date_added:") && !t.startsWith("source:")) grouped.general.push(t);
  });

  let tagsHtml = "";
  for (const [category, tagList] of Object.entries(grouped)) {
    if (tagList.length > 0) {
      tagsHtml += `
        <div>
          <div class="tag-category-title">${category}</div>
          <div class="tag-chips-wrap">
            ${tagList.map(t => `<span class="badge" onclick="searchByTag('${escapeJs(t)}')">${escapeHtml(t)}</span>`).join("")}
          </div>
        </div>
      `;
    }
  }

  // Check reading progress
  const progress = typeof ReadingHistory !== "undefined" ? ReadingHistory.getProgress(item.arcid, item) : null;
  const totalPagesCount = item.pagecount || (progress ? progress.pagecount : 0) || 0;
  const hasProgress = progress && progress.lastPage > 1;

  let actionButtonsHtml = "";
  let progressSummaryHtml = "";

  if (hasProgress) {
    const percent = totalPagesCount > 0 ? Math.min(100, Math.round((progress.lastPage / totalPagesCount) * 100)) : 0;
    progressSummaryHtml = `
      <div class="drawer-progress-box">
        <div class="drawer-progress-header">
          <span>Reading Progress</span>
          <strong>Page ${progress.lastPage} of ${totalPagesCount || "?"} (${percent}%)</strong>
        </div>
        <div class="drawer-progress-bar">
          <div class="drawer-progress-fill" style="width: ${percent}%;"></div>
        </div>
      </div>
    `;
    actionButtonsHtml = `
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <button class="btn btn-default" style="width: 100%;" onclick="openReader('${item.arcid}', ${progress.lastPage})">
          <svg style="width: 16px; height: 16px;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Resume (Page ${progress.lastPage})
        </button>
        <button class="btn btn-outline" style="width: 100%;" onclick="openReader('${item.arcid}', 1)">
          <svg style="width: 14px; height: 14px;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/></svg>
          Read from Beginning
        </button>
      </div>
    `;
  } else {
    actionButtonsHtml = `
      <button class="btn btn-default" style="width: 100%;" onclick="openReader('${item.arcid}', 1)">
        <svg style="width: 16px; height: 16px;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        Start Reading
      </button>
    `;
  }

  if (!sheetContent) sheetContent = document.getElementById("sheet-content");
  if (!sheet) sheet = document.getElementById("sheet");
  if (!sheetBackdrop) sheetBackdrop = document.getElementById("sheet-backdrop");

  if (sheetContent) {
    sheetContent.innerHTML = `
      <div class="detail-header" style="position: relative;">
        <button class="sheet-close-btn" onclick="closeDrawer()" title="Close details" aria-label="Close">✕</button>
        <img class="detail-thumb" src="${thumbUrl}" alt="Cover">
        <div class="detail-info" style="padding-right: 28px;">
          <div class="detail-title">${escapeHtml(item.title)}</div>
          <div style="font-size: 12px; color: var(--muted-foreground);">
            ${item.pagecount || "?"} pages &bull; ${formatBytes(item.arcsize || item.size)}
          </div>
          ${progressSummaryHtml}
          ${actionButtonsHtml}
          <div>
            <a href="/api/archives/${item.arcid}/download" download class="btn btn-secondary" style="width: 100%;">
              <svg style="width: 14px; height: 14px;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download CBZ
            </a>
          </div>
        </div>
      </div>
      <div style="border-top: 1px solid var(--border); padding-top: 14px; display: flex; flex-direction: column; gap: 12px;">
        ${tagsHtml}
      </div>
    `;
  }

  if (sheet) sheet.classList.add("open");
  if (sheetBackdrop) sheetBackdrop.classList.add("open");
}

function closeDrawer() {
  if (!sheet) sheet = document.getElementById("sheet");
  if (!sheetBackdrop) sheetBackdrop = document.getElementById("sheet-backdrop");

  if (sheet) {
    sheet.style.transform = "";
    sheet.style.transition = "";
    sheet.classList.remove("open", "dragging");
  }
  if (sheetBackdrop) {
    sheetBackdrop.style.opacity = "";
    sheetBackdrop.style.transition = "";
    sheetBackdrop.classList.remove("open", "dragging");
  }
  document.body.classList.remove("modal-open");
}

function setupSheetGestures() {
  if (!sheet) sheet = document.getElementById("sheet");
  if (!sheetBackdrop) sheetBackdrop = document.getElementById("sheet-backdrop");
  if (!sheetContent) sheetContent = document.getElementById("sheet-content");
  if (!sheet) return;

  let touchStartY = 0;
  let touchStartX = 0;
  let currentDeltaY = 0;
  let isDragging = false;
  let canDrag = false;

  sheet.addEventListener("touchstart", (e) => {
    if (!sheet.classList.contains("open") || e.touches.length !== 1) return;
    if (window.innerWidth >= 640) return; // Desktop is side panel

    touchStartY = e.touches[0].clientY;
    touchStartX = e.touches[0].clientX;
    currentDeltaY = 0;
    isDragging = false;

    const isHandle = e.target.closest(".sheet-handle-bar");
    const isAtTop = sheetContent ? sheetContent.scrollTop <= 0 : true;
    canDrag = Boolean(isHandle || isAtTop);
  }, { passive: true });

  sheet.addEventListener("touchmove", (e) => {
    if (!canDrag || e.touches.length !== 1) return;
    if (window.innerWidth >= 640) return;

    const touchY = e.touches[0].clientY;
    const touchX = e.touches[0].clientX;
    const deltaY = touchY - touchStartY;
    const deltaX = Math.abs(touchX - touchStartX);

    const isAtTop = sheetContent ? sheetContent.scrollTop <= 0 : true;

    if (deltaY > 4 && deltaY > deltaX && isAtTop) {
      if (e.cancelable) e.preventDefault();
      isDragging = true;
      currentDeltaY = deltaY;
      sheet.classList.add("dragging");
      sheetBackdrop.classList.add("dragging");
      sheet.style.transform = `translateY(${deltaY}px)`;
      const opacity = Math.max(0, Math.min(1, 1 - (deltaY / 260)));
      sheetBackdrop.style.opacity = opacity.toString();
    } else if (deltaY <= 0 && isDragging) {
      isDragging = false;
      sheet.classList.remove("dragging");
      sheetBackdrop.classList.remove("dragging");
      sheet.style.transform = "";
      sheetBackdrop.style.opacity = "";
    }
  }, { passive: false });

  const handleTouchEnd = () => {
    if (!isDragging) {
      canDrag = false;
      return;
    }
    isDragging = false;
    canDrag = false;
    sheet.classList.remove("dragging");
    sheetBackdrop.classList.remove("dragging");

    if (currentDeltaY > 80) {
      sheet.style.transition = "transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)";
      sheetBackdrop.style.transition = "opacity 0.22s ease";
      sheet.style.transform = "translateY(100%)";
      sheetBackdrop.style.opacity = "0";
      setTimeout(() => {
        closeDrawer();
      }, 220);
    } else {
      sheet.style.transition = "transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)";
      sheetBackdrop.style.transition = "opacity 0.2s ease";
      sheet.style.transform = "translateY(0)";
      sheetBackdrop.style.opacity = "1";
      setTimeout(() => {
        sheet.style.transform = "";
        sheet.style.transition = "";
        sheetBackdrop.style.opacity = "";
        sheetBackdrop.style.transition = "";
      }, 220);
    }
  };

  sheet.addEventListener("touchend", handleTouchEnd, { passive: true });
  sheet.addEventListener("touchcancel", handleTouchEnd, { passive: true });
}

function searchByTag(tag) {
  closeDrawer();
  selectTaxonomyTag(tag);
}

// Random Archive Action
async function triggerRandom() {
  try {
    const randomStart = totalRecords > 0 ? Math.floor(Math.random() * totalRecords) : 0;
    const res = await fetch(`/api/search?start=${randomStart}&length=1`);
    const data = await res.json();
    if (data.data && data.data.length > 0) {
      openDrawer(data.data[0]);
    }
  } catch (e) {
    console.error("Random archive error:", e);
  }
}

// Keyboard Shortcuts
function setupKeyboardControls() {
  window.addEventListener("keydown", (e) => {
    const readerGridSheet = document.getElementById("reader-grid-sheet");
    const readerModal = document.getElementById("reader-modal");
    if (!sheet) sheet = document.getElementById("sheet");

    if (e.key === "Escape") {
      if (readerGridSheet && readerGridSheet.classList.contains("open")) {
        if (typeof closeReaderGrid === "function") closeReaderGrid();
        return;
      }
      if (readerModal && readerModal.classList.contains("active")) {
        if (typeof closeReader === "function") closeReader();
        return;
      }
      if (sheet && sheet.classList.contains("open")) {
        closeDrawer();
        return;
      }
    }
    if (!readerModal || !readerModal.classList.contains("active")) return;
    if (readerGridSheet && readerGridSheet.classList.contains("open")) return;

    if (typeof readingDirection !== "undefined") {
      if (e.key === "ArrowRight") {
        readingDirection === "RTL" ? prevPage() : nextPage();
      } else if (e.key === "ArrowLeft") {
        readingDirection === "RTL" ? nextPage() : prevPage();
      } else if (e.key === " " || e.key === "PageDown") {
        nextPage();
      } else if (e.key === "PageUp") {
        prevPage();
      }
    }
  });
}

// =========================================================================
// History View & Progress UI Helpers
// =========================================================================
function renderHistoryView() {
  const container = document.getElementById("history-list");
  const badge = document.getElementById("history-count-badge");
  const sidebarBadge = document.getElementById("sidebar-history-count");
  if (!container) return;

  const items = typeof ReadingHistory !== "undefined" ? ReadingHistory.getList() : [];
  if (badge) badge.innerText = `${items.length} ${items.length === 1 ? 'item' : 'items'}`;
  if (sidebarBadge) sidebarBadge.innerText = items.length;

  if (items.length === 0) {
    container.innerHTML = `
      <div class="history-empty-state">
        <svg style="width: 48px; height: 48px; color: var(--muted);" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        <div style="font-size: 15px; font-weight: 600; color: var(--foreground);">No reading history yet</div>
        <div style="font-size: 13px; max-width: 320px; line-height: 1.4;">
          Manga you read will automatically be recorded here with your current progress.
        </div>
        <button class="btn btn-secondary" onclick="switchMainView('library')" style="margin-top: 8px;">
          Browse Library
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = items.map(item => {
    const thumbUrl = `/api/archives/${item.arcid}/thumbnail`;
    const totalP = item.pagecount || 0;
    const curP = item.lastPage || 1;
    const percent = totalP > 0 ? Math.min(100, Math.round((curP / totalP) * 100)) : 0;
    const timeAgo = formatRelativeTime(item.updatedAt);

    return `
      <div class="history-card" data-arcid="${item.arcid}">
        <div class="history-thumb-wrap" onclick="openDrawerFromHistory('${item.arcid}')" title="View details">
          <img class="history-thumb" src="${thumbUrl}" loading="lazy" alt="${escapeHtml(item.title)}">
        </div>
        <div class="history-details">
          <div class="history-title" onclick="openDrawerFromHistory('${item.arcid}')" title="${escapeHtml(item.title)}">
            ${escapeHtml(item.title)}
          </div>
          <div class="history-meta-row">
            <span style="font-weight: 500; color: var(--foreground);">Page ${curP} of ${totalP || '?'} (${percent}%)</span>
            <span>&bull;</span>
            <span>${timeAgo}</span>
          </div>
          <div class="history-progress-track">
            <div class="history-progress-fill" style="width: ${percent}%;"></div>
          </div>
          <div class="history-actions">
            <button class="btn btn-default" style="height: 28px; font-size: 11.5px; padding: 0 12px; gap: 5px;" onclick="openReader('${item.arcid}', ${curP})">
              <svg style="width: 12px; height: 12px;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              Resume (p. ${curP})
            </button>
            <button class="btn btn-outline" style="height: 28px; font-size: 11.5px; padding: 0 10px; gap: 4px;" onclick="openReader('${item.arcid}', 1)">
              <svg style="width: 12px; height: 12px;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/></svg>
              From Start
            </button>
            <button class="btn btn-ghost btn-icon" style="height: 28px; width: 28px; margin-left: auto; color: var(--muted);" title="Remove from history" onclick="removeHistoryItem('${item.arcid}')">
              <svg style="width: 14px; height: 14px;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function openDrawerFromHistory(arcid) {
  if (typeof ReadingHistory === "undefined") return;
  const prog = ReadingHistory.getProgress(arcid);
  if (!prog) return;
  openDrawer({
    arcid: prog.arcid,
    title: prog.title,
    tags: prog.tags || "",
    pagecount: prog.pagecount || 0
  });
}

function removeHistoryItem(arcid) {
  if (typeof ReadingHistory === "undefined") return;
  ReadingHistory.removeProgress(arcid);
  renderHistoryView();
  updateCardProgressUI(arcid);
}

function clearReadingHistoryPrompt() {
  if (typeof ReadingHistory === "undefined") return;
  if (confirm("Are you sure you want to clear your entire reading history?")) {
    ReadingHistory.clearAll();
    renderHistoryView();
    document.querySelectorAll(".card-progress-bar").forEach(b => b.remove());
    document.querySelectorAll(".progress-badge").forEach(b => {
      b.className = "";
    });
  }
}

function updateCardProgressUI(arcid) {
  const card = document.querySelector(`.manga-card[data-arcid="${arcid}"]`);
  if (!card) return;
  if (typeof ReadingHistory === "undefined") return;
  const prog = ReadingHistory.getProgress(arcid);
  const thumbWrap = card.querySelector(".card-thumb-wrap");
  const cardMeta = card.querySelector(".card-meta");
  if (!thumbWrap || !cardMeta) return;

  const existingBar = thumbWrap.querySelector(".card-progress-bar");

  if (prog && prog.lastPage > 1) {
    const totalP = prog.pagecount || 0;
    const pct = totalP > 0 ? Math.min(100, Math.round((prog.lastPage / totalP) * 100)) : 0;
    if (existingBar) {
      const fill = existingBar.querySelector(".card-progress-fill");
      if (fill) fill.style.width = `${pct}%`;
    } else {
      const bar = document.createElement("div");
      bar.className = "card-progress-bar";
      bar.innerHTML = `<div class="card-progress-fill" style="width: ${pct}%;"></div>`;
      thumbWrap.appendChild(bar);
    }

    const pageSpan = cardMeta.querySelector("span:last-child");
    if (pageSpan) {
      pageSpan.className = "progress-badge";
      pageSpan.innerText = `p. ${prog.lastPage}/${totalP || "?"}`;
    }
  } else {
    if (existingBar) existingBar.remove();
    const pageSpan = cardMeta.querySelector(".progress-badge");
    if (pageSpan) {
      pageSpan.className = "";
      pageSpan.innerText = `${(prog && prog.pagecount) ? prog.pagecount : "?"}p`;
    }
  }
}

// =========================================================================
// Auto-hide & Auto-show Floating Footer on Scroll
// =========================================================================
function handleWindowScroll() {
  const currentScrollY = window.scrollY;
  const windowHeight = window.innerHeight;
  const docHeight = document.documentElement.scrollHeight;
  const isAtBottom = (currentScrollY + windowHeight >= docHeight - 40);
  const isAtTop = (currentScrollY <= 20);

  if (!appFooter) appFooter = document.getElementById("app-footer");
  if (!appFooter) return;
  if (window.innerWidth >= 1024) {
    appFooter.classList.remove("footer-hidden");
    lastScrollY = currentScrollY;
    scrollTicking = false;
    return;
  }

  if (isAtTop || isAtBottom) {
    appFooter.classList.remove("footer-hidden");
  } else if (currentScrollY > lastScrollY + 6 && currentScrollY > 70) {
    appFooter.classList.add("footer-hidden");
  } else if (currentScrollY < lastScrollY - 6) {
    appFooter.classList.remove("footer-hidden");
  }
  lastScrollY = currentScrollY;
  scrollTicking = false;
}

window.addEventListener("scroll", () => {
  if (!scrollTicking) {
    window.requestAnimationFrame(handleWindowScroll);
    scrollTicking = true;
  }
}, { passive: true });

// Browser / Hardware Back Navigation (Closes Pages Overview first, then reader, then drawer)
window.addEventListener("popstate", (e) => {
  const readerGridSheet = document.getElementById("reader-grid-sheet");
  const readerModal = document.getElementById("reader-modal");
  if (!sheet) sheet = document.getElementById("sheet");

  if (readerGridSheet && readerGridSheet.classList.contains("open")) {
    if (typeof closeReaderGrid === "function") closeReaderGrid();
    return;
  }
  if (readerModal && readerModal.classList.contains("active")) {
    if (typeof closeReader === "function") closeReader();
    return;
  }
  if (sheet && sheet.classList.contains("open")) {
    closeDrawer();
    return;
  }
});
