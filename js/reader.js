// Open full manga info drawer from inside reader
async function openCurrentReaderInfo() {
  if (!currentReaderArcId) return;
  if (typeof currentArchive !== "undefined" && currentArchive?.arcid === currentReaderArcId && currentArchive.tags) {
    if (typeof openDrawer === "function") openDrawer(currentArchive);
    return;
  }
  try {
    const res = await fetch(`/api/archives/${encodeURIComponent(currentReaderArcId)}/metadata`);
    const data = res.ok ? await res.json() : null;
    if (data) {
      data.arcid = data.arcid || currentReaderArcId;
      currentArchive = data;
      if (typeof openDrawer === "function") openDrawer(data);
    }
  } catch (err) { console.debug("Failed to load metadata for reader info:", err); }
}

let currentReaderArcId = null, currentPages = [], currentPageIndex = 0;
let isWebtoonMode = false, isOverlayVisible = true, readingDirection = "RTL", isDoublePage = false, gridObserver = null;

function updateSpreadButton() {
  const btn = document.getElementById("reader-spread-btn");
  if (!btn) return;
  btn.title = isDoublePage ? "Double Page Spread" : "Single Page";
  btn.innerHTML = isDoublePage ? '<svg style="width: 16px; height: 16px;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="8" height="16" rx="1.5"/><rect x="13" y="4" width="8" height="16" rx="1.5"/></svg>' : '<svg style="width: 15px; height: 15px;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2"/></svg>';
}

function toggleReaderSettings() {
  if (window.innerWidth >= 1024) return;
  const dlg = document.getElementById("reader-settings-dialog");
  const bd = document.getElementById("reader-settings-backdrop");
  if (!dlg) return;
  const isOpen = dlg.classList.toggle("open");
  if (bd) bd.classList.toggle("open", isOpen);
  document.getElementById("reader-modal")?.classList.toggle("settings-open", isOpen);
}

function updateReaderSettingsUI() {
  const isRtl = (readingDirection === "RTL");
  document.getElementById("setting-dir-rtl")?.classList.toggle("active", isRtl);
  document.getElementById("setting-dir-ltr")?.classList.toggle("active", !isRtl);
  document.getElementById("setting-spread-single")?.classList.toggle("active", !isDoublePage);
  document.getElementById("setting-spread-double")?.classList.toggle("active", isDoublePage);
  document.getElementById("setting-mode-paged")?.classList.toggle("active", !isWebtoonMode);
  document.getElementById("setting-mode-webtoon")?.classList.toggle("active", isWebtoonMode);
}

function updateProgressDirection() { document.getElementById("reader-screen-progress")?.classList.toggle("rtl", readingDirection === "RTL"); }

function setReadingDirection(dir) {
  readingDirection = dir;
  updateReaderSettingsUI();
  updateProgressDirection();
  if (!isWebtoonMode) loadPagedPage(currentPageIndex);
}

function toggleReadingDirection() { setReadingDirection(readingDirection === "RTL" ? "LTR" : "RTL"); }

function setSpreadMode(isDouble) {
  isDoublePage = Boolean(isDouble);
  updateSpreadButton();
  updateReaderSettingsUI();
  loadPagedPage(currentPageIndex);
}

function toggleSpreadMode() { setSpreadMode(!isDoublePage); }

function setReaderMode(mode) {
  isWebtoonMode = (mode === "webtoon");
  updateReaderSettingsUI();
  switchReaderView();
}

function toggleReaderMode() { setReaderMode(isWebtoonMode ? "paged" : "webtoon"); }

function switchReaderView() {
  const readerModeBtn = document.getElementById("reader-mode-btn");
  const readerSpreadBtn = document.getElementById("reader-spread-btn");
  const pagedView = document.getElementById("paged-view");
  const webtoonView = document.getElementById("webtoon-view");
  const canvas = document.getElementById("reader-canvas");
  if (canvas) canvas.classList.toggle("webtoon-mode", isWebtoonMode);

  if (readerModeBtn) readerModeBtn.innerText = isWebtoonMode ? "Webtoon" : "Paged";
  if (readerSpreadBtn) readerSpreadBtn.style.display = isWebtoonMode ? "none" : "inline-flex";

  if (isWebtoonMode) {
    if (pagedView) pagedView.style.display = "none";
    if (webtoonView) { webtoonView.style.display = "flex"; renderWebtoonView(); }
    document.getElementById("reader-screen-progress")?.classList.remove("rtl");
    jumpToPage(currentPageIndex + 1);
  } else {
    if (webtoonView) webtoonView.style.display = "none";
    if (pagedView) { pagedView.style.display = "flex"; loadPagedPage(currentPageIndex); }
    updateProgressDirection();
  }
}

function renderPagedSpread(idx = currentPageIndex) { loadPagedPage(idx); }

async function openReader(arcid, targetPage = 1, title = null, pushHistory = true) {
  if (typeof targetPage === "string" && isNaN(Number(targetPage))) { title = targetPage; targetPage = 1; }
  targetPage = parseInt(targetPage, 10) || 1;
  currentReaderArcId = arcid;

  if (!title) {
    title = (typeof currentArchive !== "undefined" && currentArchive?.arcid === arcid && currentArchive.title)
      ? currentArchive.title
      : ((typeof ReadingHistory !== "undefined" ? ReadingHistory.getProgress(arcid)?.title : null) || "Manga Reader");
  }

  const readerTitle = document.getElementById("reader-title");
  if (readerTitle) readerTitle.innerText = title || "Manga Reader";
  if (typeof closeDrawer === "function") closeDrawer();

  document.getElementById("reader-modal")?.classList.add("active");
  document.body.classList.add("modal-open");
  currentPageIndex = 0;
  isOverlayVisible = true;
  setOverlayVisibility(true);

  isWebtoonMode = false;
  switchReaderView();
  updateSpreadButton();
  updateReaderSettingsUI();
  updateProgressDirection();

  document.getElementById("reader-settings-dialog")?.classList.remove("open");
  document.getElementById("reader-settings-backdrop")?.classList.remove("open");

  const readerSkeleton = document.getElementById("reader-skeleton");
  const pagedSpreadWrap = document.getElementById("paged-spread-wrap");
  if (readerSkeleton) readerSkeleton.style.display = "flex";
  if (pagedSpreadWrap) pagedSpreadWrap.style.opacity = "0";

  try {
    const res = await fetch(`/api/archives/${arcid}/files`);
    const data = await res.json();
    currentPages = data.pages || [];

    const scrubberSlider = document.getElementById("scrubber-slider");
    if (scrubberSlider) scrubberSlider.max = currentPages.length;
    if (readerSkeleton) readerSkeleton.style.display = "none";
    if (pagedSpreadWrap) pagedSpreadWrap.style.opacity = "1";

    const startIdx = (targetPage > 1 && currentPages.length > 0) ? Math.min(targetPage - 1, currentPages.length - 1) : 0;
    currentPageIndex = startIdx;
    if (pushHistory && window.history?.pushState) {
      const url = new URL(window.location);
      url.searchParams.set("id", arcid);
      url.searchParams.set("page", startIdx + 1);
      window.history.pushState({ type: "reader", id: arcid, page: startIdx + 1 }, "", url.pathname + url.search);
    }
    loadPagedPage(currentPageIndex);
  } catch (err) {
    if (readerSkeleton) readerSkeleton.style.display = "none";
    if (pagedSpreadWrap) pagedSpreadWrap.style.opacity = "1";
    alert("Failed to load archive pages: " + err);
    closeReader();
  }
}

function closeReader(pushHistory = true) {
  const spb = document.getElementById("reader-screen-progress-bar");
  if (spb) spb.style.width = "0%";

  const readerModal = document.getElementById("reader-modal");
  const wasActive = readerModal?.classList.contains("active");
  if (readerModal) readerModal.classList.remove("active", "sidebar-hidden", "settings-open");

  if (wasActive && pushHistory && window.history?.pushState) {
    const url = new URL(window.location);
    url.searchParams.delete("id");
    if (typeof currentPageNum !== "undefined" && currentPageNum > 1) url.searchParams.set("page", currentPageNum);
    else url.searchParams.delete("page");
    window.history.pushState({ type: "library", page: currentPageNum || 1 }, "", url.pathname + (url.search || ""));
  }
  closeReaderGrid();
  document.getElementById("reader-settings-dialog")?.classList.remove("open");
  document.getElementById("reader-settings-backdrop")?.classList.remove("open");
  document.body.classList.remove("modal-open");

  ["paged-img-left", "paged-img-right"].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.src = ""; el.classList.remove("skeleton-loading"); }
  });

  const readerSkeleton = document.getElementById("reader-skeleton");
  if (readerSkeleton) readerSkeleton.style.display = "none";
  const webtoonView = document.getElementById("webtoon-view");
  if (webtoonView) webtoonView.innerHTML = "";

  const activePane = document.querySelector(".view-pane.active");
  if (activePane?.id === "view-history") {
    if (typeof renderHistoryView === "function") renderHistoryView();
  } else if (currentReaderArcId && typeof updateCardProgressUI === "function") updateCardProgressUI(currentReaderArcId);
}

function setupImgLoad(img, src) {
  if (!img) return;
  img.style.display = "block";
  img.style.opacity = "0.3";
  img.classList.add("skeleton-loading");
  img.onload = () => { img.classList.remove("skeleton-loading"); img.style.opacity = "1"; };
  img.onerror = () => img.classList.remove("skeleton-loading");
  img.src = src;
}

function loadPagedPage(idx) {
  idx = Math.max(0, Math.min(idx, currentPages.length - 1));
  currentPageIndex = idx;
  updateProgressBar(idx, currentPages.length);

  if (window.history?.replaceState && currentReaderArcId) {
    const url = new URL(window.location);
    url.searchParams.set("id", currentReaderArcId);
    url.searchParams.set("page", idx + 1);
    window.history.replaceState({ type: "reader", id: currentReaderArcId, page: idx + 1 }, "", url.pathname + url.search);
  }

  if (currentReaderArcId && currentPages.length > 0 && typeof ReadingHistory !== "undefined") {
    ReadingHistory.saveProgress(currentReaderArcId, idx + 1, currentPages.length);
  }

  const pagedSpreadWrap = document.getElementById("paged-spread-wrap");
  const pagedImgLeft = document.getElementById("paged-img-left");
  const pagedImgRight = document.getElementById("paged-img-right");
  const scrubberSlider = document.getElementById("scrubber-slider");
  const scrubberCounter = document.getElementById("scrubber-counter");

  if (!isDoublePage) {
    if (pagedSpreadWrap) pagedSpreadWrap.classList.remove("double-mode");
    if (pagedImgLeft) { pagedImgLeft.style.display = "none"; pagedImgLeft.src = ""; pagedImgLeft.classList.remove("skeleton-loading"); }
    setupImgLoad(pagedImgRight, currentPages[idx]);
    if (scrubberSlider) scrubberSlider.value = idx + 1;
    if (scrubberCounter) scrubberCounter.innerText = `${idx + 1} / ${currentPages.length}`;
    if (idx + 1 < currentPages.length) new Image().src = currentPages[idx + 1];
  } else {
    if (pagedSpreadWrap) pagedSpreadWrap.classList.add("double-mode");
    const hasSecondPage = (idx + 1 < currentPages.length);
    if (hasSecondPage) {
      const isRtl = (readingDirection === "RTL");
      setupImgLoad(isRtl ? pagedImgRight : pagedImgLeft, currentPages[idx]);
      setupImgLoad(isRtl ? pagedImgLeft : pagedImgRight, currentPages[idx + 1]);
      if (scrubberSlider) scrubberSlider.value = idx + 1;
      if (scrubberCounter) scrubberCounter.innerText = `${idx + 1}-${idx + 2} / ${currentPages.length}`;
      if (idx + 2 < currentPages.length) new Image().src = currentPages[idx + 2];
      if (idx + 3 < currentPages.length) new Image().src = currentPages[idx + 3];
    } else {
      if (pagedImgLeft) { pagedImgLeft.style.display = "none"; pagedImgLeft.src = ""; pagedImgLeft.classList.remove("skeleton-loading"); }
      setupImgLoad(pagedImgRight, currentPages[idx]);
      if (scrubberSlider) scrubberSlider.value = idx + 1;
      if (scrubberCounter) scrubberCounter.innerText = `${idx + 1} / ${currentPages.length}`;
    }
  }
}

function prevPage() {
  if (!isWebtoonMode && currentPageIndex > 0) loadPagedPage(Math.max(0, currentPageIndex - (isDoublePage ? 2 : 1)));
}

function nextPage() {
  if (isWebtoonMode) return;
  const step = isDoublePage ? 2 : 1;
  if (currentPageIndex + step < currentPages.length) loadPagedPage(currentPageIndex + step);
  else if (isDoublePage && currentPageIndex + 1 < currentPages.length) loadPagedPage(currentPageIndex + 1);
}

function updateProgressBar(pageIndex, totalPages) {
  if (!totalPages || totalPages <= 0) return;
  const pct = Math.min(100, Math.max(0, ((pageIndex + 1) / totalPages) * 100));
  document.getElementById("reader-screen-progress-bar")?.style.setProperty("width", `${pct}%`);
}

function jumpToPage(num) {
  if (isWebtoonMode) document.getElementById(`webtoon-page-${num - 1}`)?.scrollIntoView({ behavior: "smooth" });
  else loadPagedPage(num - 1);
}

function toggleReaderOverlay() { setOverlayVisibility(!isOverlayVisible); }

function setOverlayVisibility(visible) {
  isOverlayVisible = visible;
  document.getElementById("reader-bottom")?.classList.toggle("hidden", !visible);
  document.getElementById("reader-modal")?.classList.toggle("sidebar-hidden", !visible);
}

function handleTouchLeft() { readingDirection === "RTL" ? nextPage() : prevPage(); }

function handleTouchRight() { readingDirection === "RTL" ? prevPage() : nextPage(); }

function handleWebtoonClick(e) {
  const canvas = document.getElementById("reader-canvas");
  if (!canvas) return;
  const clientY = e.clientY, vh = window.innerHeight, scrollStep = canvas.clientHeight * 0.75;
  if (clientY < vh * 0.3) canvas.scrollBy({ top: -scrollStep, behavior: "smooth" });
  else if (clientY > vh * 0.7) canvas.scrollBy({ top: scrollStep, behavior: "smooth" });
  else toggleReaderOverlay();
}

function handleCanvasScroll() {
  if (!isWebtoonMode) return;
  const canvas = document.getElementById("reader-canvas");
  if (!canvas || !currentPages.length) return;
  const maxScroll = canvas.scrollHeight - canvas.clientHeight;
  const pct = maxScroll > 0 ? Math.min(100, Math.max(0, (canvas.scrollTop / maxScroll) * 100)) : 0;
  const spb = document.getElementById("reader-screen-progress-bar");
  if (spb) spb.style.width = `${pct}%`;

  const canvasMid = canvas.scrollTop + (canvas.clientHeight / 2);
  let activeIdx = 0;
  for (let i = 0; i < currentPages.length; i++) {
    const img = document.getElementById(`webtoon-page-${i}`);
    if (img && img.offsetTop <= canvasMid) activeIdx = i;
    else if (img && img.offsetTop > canvasMid) break;
  }
  currentPageIndex = activeIdx;
  const counter = document.getElementById("scrubber-counter");
  if (counter) counter.innerText = `${activeIdx + 1} / ${currentPages.length}`;
  if (window.history?.replaceState && currentReaderArcId) {
    const url = new URL(window.location);
    url.searchParams.set("page", activeIdx + 1);
    window.history.replaceState({ type: "reader", id: currentReaderArcId, page: activeIdx + 1 }, "", url.pathname + url.search);
  }
}

function renderWebtoonView() {
  const webtoonView = document.getElementById("webtoon-view");
  if (!webtoonView) return;
  webtoonView.innerHTML = "";
  webtoonView.onclick = handleWebtoonClick;
  currentPages.forEach((url, i) => {
    const img = Object.assign(document.createElement("img"), { id: `webtoon-page-${i}`, src: url, loading: "lazy" });
    webtoonView.appendChild(img);
  });
}

function openReaderGrid() {
  try { history.pushState({ modal: 'readerGrid' }, ''); } catch(e) {}
  const gridSheetTotal = document.getElementById("grid-sheet-total");
  const gridSheetBody = document.getElementById("grid-sheet-body");
  const readerGridSheet = document.getElementById("reader-grid-sheet");
  if (!gridSheetBody) return;

  if (gridSheetTotal) gridSheetTotal.innerText = currentPages.length;
  gridSheetBody.innerHTML = "";

  if (gridObserver) gridObserver.disconnect();
  gridObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        if (img.dataset.src) { img.src = img.dataset.src; img.removeAttribute("data-src"); }
        gridObserver.unobserve(img);
      }
    });
  }, { root: gridSheetBody, rootMargin: "150px" });

  const fragment = document.createDocumentFragment();
  currentPages.forEach((pageUrl, idx) => {
    const card = document.createElement("div");
    const isActive = (idx === currentPageIndex || (isDoublePage && idx === currentPageIndex + 1));
    card.className = "page-thumb-card" + (isActive ? " active" : "");
    card.innerHTML = `<div class="page-thumb-img-wrap skeleton"><img data-src="${pageUrl}" alt="${idx + 1}" decoding="async" style="opacity: 0; transition: opacity 0.2s ease;"></div><div class="page-num">${idx + 1}</div>`;
    const img = card.querySelector("img"), wrap = card.querySelector(".page-thumb-img-wrap");
    img.onload = () => { if (wrap) wrap.classList.remove("skeleton"); img.style.opacity = "1"; };
    img.onerror = () => { if (wrap) wrap.classList.remove("skeleton"); };
    gridObserver.observe(img);
    card.onclick = () => { jumpToPage(idx + 1); closeReaderGrid(); };
    fragment.appendChild(card);
  });
  gridSheetBody.appendChild(fragment);

  document.getElementById("reader-grid-backdrop")?.classList.add("open");
  if (readerGridSheet) readerGridSheet.classList.add("open");
  const activeEl = gridSheetBody.querySelector(".page-thumb-card.active");
  if (activeEl) setTimeout(() => activeEl.scrollIntoView({ block: "center", behavior: "smooth" }), 60);
}

function closeReaderGrid() {
  document.getElementById("reader-grid-backdrop")?.classList.remove("open");
  document.getElementById("reader-grid-sheet")?.classList.remove("open");
  if (gridObserver) { gridObserver.disconnect(); gridObserver = null; }
}

// Touch Swipe Gestures
function setupSwipeGestures() {
  const pagedView = document.getElementById("paged-view");
  if (!pagedView) return;
  let touchStartX = 0, touchStartY = 0;
  pagedView.addEventListener("touchstart", (e) => {
    if (e.touches.length === 1) { touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY; }
  }, { passive: true });
  pagedView.addEventListener("touchend", (e) => {
    if (e.changedTouches.length === 1) {
      const deltaX = e.changedTouches[0].clientX - touchStartX;
      const deltaY = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
        (readingDirection === "RTL" ? deltaX > 0 : deltaX < 0) ? nextPage() : prevPage();
      }
    }
  }, { passive: true });
}

// Swipe down to dismiss reader settings bottom sheet
function initReaderSettingsSwipe() {
  const dlg = document.getElementById("reader-settings-dialog");
  const bd = document.getElementById("reader-settings-backdrop");
  if (!dlg) return;
  if (bd) bd.addEventListener("touchmove", (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
  let startY = 0, deltaY = 0, isDragging = false;

  dlg.addEventListener("touchstart", (e) => {
    if (!dlg.classList.contains("open") || e.touches.length !== 1 || window.innerWidth >= 1024) return;
    if (e.target.closest("button, .tab-trigger")) return;
    startY = e.touches[0].clientY;
    deltaY = 0;
    isDragging = true;
  }, { passive: true });

  dlg.addEventListener("touchmove", (e) => {
    if (!isDragging || e.touches.length !== 1) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 0) {
      deltaY = dy;
      dlg.classList.add("dragging");
      if (bd) bd.classList.add("dragging");
      dlg.style.transform = `translateY(${dy}px)`;
      if (bd) bd.style.opacity = Math.max(0, 1 - dy / 250).toString();
    } else {
      dlg.style.transform = "";
      if (bd) bd.style.opacity = "";
    }
  }, { passive: true });

  const endDrag = () => {
    if (!isDragging) return;
    isDragging = false;
    dlg.classList.remove("dragging");
    if (bd) bd.classList.remove("dragging");
    const cleanup = () => {
      dlg.style.transform = "";
      dlg.style.transition = "";
      if (bd) { bd.style.opacity = ""; bd.style.transition = ""; }
    };
    if (deltaY > 60) {
      dlg.style.transition = "transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)";
      if (bd) bd.style.transition = "opacity 0.22s ease";
      dlg.style.transform = "translateY(100%)";
      if (bd) bd.style.opacity = "0";
      setTimeout(() => { toggleReaderSettings(); cleanup(); }, 220);
    } else {
      dlg.style.transition = "transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)";
      if (bd) bd.style.transition = "opacity 0.2s ease";
      dlg.style.transform = "translateY(0)";
      if (bd) bd.style.opacity = "1";
      setTimeout(cleanup, 220);
    }
  };

  dlg.addEventListener("touchend", endDrag, { passive: true });
  dlg.addEventListener("touchcancel", endDrag, { passive: true });
}

function initReader() {
  const canvas = document.getElementById("reader-canvas");
  if (canvas) canvas.addEventListener("scroll", handleCanvasScroll, { passive: true });
  initReaderSettingsSwipe();
}

if (typeof document !== "undefined") {
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", initReader) : initReader();
}
