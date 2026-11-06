// Open full manga info drawer from inside reader
async function openCurrentReaderInfo() {
  if (!currentReaderArcId) return;
  if (typeof currentArchive !== "undefined" && currentArchive && currentArchive.arcid === currentReaderArcId && currentArchive.tags) {
    if (typeof openDrawer === "function") openDrawer(currentArchive);
    return;
  }
  try {
    const res = await fetch(`/api/archives/${encodeURIComponent(currentReaderArcId)}/metadata`);
    if (!res.ok) return;
    const data = await res.json();
    if (data) {
      if (!data.arcid) data.arcid = currentReaderArcId;
      currentArchive = data;
      if (typeof openDrawer === "function") openDrawer(data);
    }
  } catch (err) {
    console.debug("Failed to load metadata for reader info:", err);
  }
}

// =========================================================================
// Fullscreen Modern Reader
// =========================================================================
let currentReaderArcId = null;
let currentPages = [];
let currentPageIndex = 0;
let isWebtoonMode = false;
let isOverlayVisible = true;
let readingDirection = "RTL"; // Standard Japanese manga right-to-left
let isDoublePage = false;
let gridObserver = null;

function updateReaderDirButton() {
  const btn = document.getElementById("reader-dir-btn");
  if (!btn) return;
  const isRtl = readingDirection === "RTL";
  btn.title = isRtl ? "Right-to-Left (Manga)" : "Left-to-Right (Western)";
  btn.innerHTML = isRtl
    ? '<svg style="width: 15px; height: 15px;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>'
    : '<svg style="width: 15px; height: 15px;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>';
}

function updateSpreadButton() {
  const btn = document.getElementById("reader-spread-btn");
  if (!btn) return;
  btn.title = isDoublePage ? "Double Page Spread" : "Single Page";
  btn.innerHTML = isDoublePage
    ? '<svg style="width: 16px; height: 16px;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="8" height="16" rx="1.5"/><rect x="13" y="4" width="8" height="16" rx="1.5"/></svg>'
    : '<svg style="width: 15px; height: 15px;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2"/></svg>';
}

function toggleReaderSettings() {
  const dlg = document.getElementById("reader-settings-dialog");
  if (!dlg) return;
  const isHidden = (dlg.style.display === "none" || !dlg.style.display);
  dlg.style.display = isHidden ? "flex" : "none";
  if (isHidden) updateReaderSettingsUI();
}

function updateReaderSettingsUI() {
  const dirRtl = document.getElementById("setting-dir-rtl");
  const dirLtr = document.getElementById("setting-dir-ltr");
  if (dirRtl) dirRtl.classList.toggle("active", readingDirection === "RTL");
  if (dirLtr) dirLtr.classList.toggle("active", readingDirection === "LTR");

  const spreadSingle = document.getElementById("setting-spread-single");
  const spreadDouble = document.getElementById("setting-spread-double");
  if (spreadSingle) spreadSingle.classList.toggle("active", !isDoublePage);
  if (spreadDouble) spreadDouble.classList.toggle("active", isDoublePage);

  const modePaged = document.getElementById("setting-mode-paged");
  const modeWebtoon = document.getElementById("setting-mode-webtoon");
  if (modePaged) modePaged.classList.toggle("active", !isWebtoonMode);
  if (modeWebtoon) modeWebtoon.classList.toggle("active", isWebtoonMode);
}

function setReadingDirection(dir) {
  readingDirection = dir;
  updateReaderDirButton();
  updateReaderSettingsUI();
  if (!isWebtoonMode) renderPagedSpread(currentPageIndex);
}

function toggleReadingDirection() {
  setReadingDirection(readingDirection === "RTL" ? "LTR" : "RTL");
}

function setSpreadMode(isDouble) {
  isDoublePage = Boolean(isDouble);
  updateSpreadButton();
  updateReaderSettingsUI();
  renderPagedSpread(currentPageIndex);
}

function toggleSpreadMode() {
  setSpreadMode(!isDoublePage);
}

function setReaderMode(mode) {
  isWebtoonMode = (mode === "webtoon");
  updateReaderSettingsUI();
  switchReaderView();
}

function toggleReaderMode() {
  setReaderMode(isWebtoonMode ? "paged" : "webtoon");
}

function switchReaderView() {
  const readerModeBtn = document.getElementById("reader-mode-btn");
  const readerSpreadBtn = document.getElementById("reader-spread-btn");
  const pagedView = document.getElementById("paged-view");
  const webtoonView = document.getElementById("webtoon-view");

  if (readerModeBtn) readerModeBtn.innerText = isWebtoonMode ? "Webtoon" : "Paged";
  if (readerSpreadBtn) readerSpreadBtn.style.display = isWebtoonMode ? "none" : "inline-flex";

  if (isWebtoonMode) {
    if (pagedView) pagedView.style.display = "none";
    if (webtoonView) {
      webtoonView.style.display = "flex";
      renderWebtoonView();
    }
  } else {
    if (webtoonView) webtoonView.style.display = "none";
    if (pagedView) {
      pagedView.style.display = "flex";
      renderPagedSpread(currentPageIndex);
    }
  }
}

function renderPagedSpread(idx = currentPageIndex) {
  loadPagedPage(idx);
}

async function openReader(arcid, targetPage = 1, title = null, pushHistory = true) {
  if (typeof targetPage === "string" && isNaN(Number(targetPage))) {
    title = targetPage;
    targetPage = 1;
  }
  targetPage = parseInt(targetPage, 10) || 1;
  currentReaderArcId = arcid;

  if (!title) {
    if (typeof currentArchive !== "undefined" && currentArchive?.arcid === arcid && currentArchive.title) {
      title = currentArchive.title;
    } else {
      const prog = typeof ReadingHistory !== "undefined" ? ReadingHistory.getProgress(arcid) : null;
      title = (prog && prog.title) || "Manga Reader";
    }
  }

  const readerTitle = document.getElementById("reader-title");
  if (readerTitle) readerTitle.innerText = title || "Manga Reader";
  if (typeof closeDrawer === "function") closeDrawer();

  const readerModal = document.getElementById("reader-modal");
  if (readerModal) readerModal.classList.add("active");
  document.body.classList.add("modal-open");
  currentPageIndex = 0;
  isOverlayVisible = true;
  setOverlayVisibility(true);

  isWebtoonMode = false;
  switchReaderView();
  updateReaderDirButton();
  updateSpreadButton();
  updateReaderSettingsUI();

  const settingsDlg = document.getElementById("reader-settings-dialog");
  if (settingsDlg) settingsDlg.style.display = "none";

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

    let startIdx = 0;
    if (targetPage > 1 && currentPages.length > 0) {
      startIdx = Math.min(targetPage - 1, currentPages.length - 1);
    }
    currentPageIndex = startIdx;
    if (pushHistory && window.history && window.history.pushState) {
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
  const readerModal = document.getElementById("reader-modal");
  const wasActive = readerModal && readerModal.classList.contains("active");
  if (readerModal) readerModal.classList.remove("active");
  if (wasActive && pushHistory && window.history && window.history.pushState) {
    const url = new URL(window.location);
    url.searchParams.delete("id");
    if (typeof currentPageNum !== "undefined" && currentPageNum > 1) {
      url.searchParams.set("page", currentPageNum);
    } else {
      url.searchParams.delete("page");
    }
    window.history.pushState({ type: "library", page: currentPageNum || 1 }, "", url.pathname + (url.search || ""));
  }
  closeReaderGrid();
  const settingsDlg = document.getElementById("reader-settings-dialog");
  if (settingsDlg) settingsDlg.style.display = "none";
  document.body.classList.remove("modal-open");

  const resetImg = (id) => {
    const el = document.getElementById(id);
    if (el) { el.src = ""; el.classList.remove("skeleton-loading"); }
  };
  resetImg("paged-img-left");
  resetImg("paged-img-right");

  const readerSkeleton = document.getElementById("reader-skeleton");
  if (readerSkeleton) readerSkeleton.style.display = "none";
  const webtoonView = document.getElementById("webtoon-view");
  if (webtoonView) webtoonView.innerHTML = "";

  const activePane = document.querySelector(".view-pane.active");
  if (activePane && activePane.id === "view-history") {
    if (typeof renderHistoryView === "function") renderHistoryView();
  } else if (currentReaderArcId && typeof updateCardProgressUI === "function") {
    updateCardProgressUI(currentReaderArcId);
  }
}

function setupImgLoad(img, src) {
  if (!img) return;
  img.style.display = "block";
  img.style.opacity = "0.3";
  img.classList.add("skeleton-loading");
  img.onload = () => { img.classList.remove("skeleton-loading"); img.style.opacity = "1"; };
  img.onerror = () => { img.classList.remove("skeleton-loading"); };
  img.src = src;
}

function loadPagedPage(idx) {
  if (idx < 0) idx = 0;
  if (idx >= currentPages.length) idx = currentPages.length - 1;
  currentPageIndex = idx;

  if (window.history && window.history.replaceState && currentReaderArcId) {
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
      if (readingDirection === "RTL") {
        setupImgLoad(pagedImgRight, currentPages[idx]);
        setupImgLoad(pagedImgLeft, currentPages[idx + 1]);
      } else {
        setupImgLoad(pagedImgLeft, currentPages[idx]);
        setupImgLoad(pagedImgRight, currentPages[idx + 1]);
      }
      if (scrubberSlider) scrubberSlider.value = idx + 1;
      if (scrubberCounter) scrubberCounter.innerText = `${idx + 1}-${idx + 2} / ${currentPages.length}`;
      if (idx + 2 < currentPages.length) {
        new Image().src = currentPages[idx + 2];
        if (idx + 3 < currentPages.length) new Image().src = currentPages[idx + 3];
      }
    } else {
      if (pagedImgLeft) { pagedImgLeft.style.display = "none"; pagedImgLeft.src = ""; pagedImgLeft.classList.remove("skeleton-loading"); }
      setupImgLoad(pagedImgRight, currentPages[idx]);
      if (scrubberSlider) scrubberSlider.value = idx + 1;
      if (scrubberCounter) scrubberCounter.innerText = `${idx + 1} / ${currentPages.length}`;
    }
  }
}

function prevPage() {
  if (isWebtoonMode) return;
  const step = isDoublePage ? 2 : 1;
  if (currentPageIndex > 0) loadPagedPage(Math.max(0, currentPageIndex - step));
}

function nextPage() {
  if (isWebtoonMode) return;
  const step = isDoublePage ? 2 : 1;
  if (currentPageIndex + step < currentPages.length) {
    loadPagedPage(currentPageIndex + step);
  } else if (isDoublePage && currentPageIndex + 1 < currentPages.length) {
    loadPagedPage(currentPageIndex + 1);
  }
}

function jumpToPage(num) {
  if (isWebtoonMode) {
    const targetImg = document.getElementById(`webtoon-page-${num - 1}`);
    if (targetImg) targetImg.scrollIntoView({ behavior: "smooth" });
  } else {
    loadPagedPage(num - 1);
  }
}

function toggleReaderOverlay() {
  isOverlayVisible = !isOverlayVisible;
  setOverlayVisibility(isOverlayVisible);
}

function setOverlayVisibility(visible) {
  const readerBottom = document.getElementById("reader-bottom");
  if (readerBottom) readerBottom.classList.toggle("hidden", !visible);
}

function handleTouchLeft() {
  readingDirection === "RTL" ? nextPage() : prevPage();
}

function handleTouchRight() {
  readingDirection === "RTL" ? prevPage() : nextPage();
}

function renderWebtoonView() {
  const webtoonView = document.getElementById("webtoon-view");
  if (!webtoonView) return;
  webtoonView.innerHTML = "";
  currentPages.forEach((url, i) => {
    const img = document.createElement("img");
    img.id = `webtoon-page-${i}`;
    img.src = url;
    img.loading = "lazy";
    img.onclick = toggleReaderOverlay;
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
        if (img.dataset.src) {
          img.src = img.dataset.src;
          img.removeAttribute("data-src");
        }
        gridObserver.unobserve(img);
      }
    });
  }, { root: gridSheetBody, rootMargin: "150px" });

  const fragment = document.createDocumentFragment();
  currentPages.forEach((pageUrl, idx) => {
    const card = document.createElement("div");
    const isActive = (idx === currentPageIndex || (isDoublePage && idx === currentPageIndex + 1));
    card.className = "page-thumb-card" + (isActive ? " active" : "");
    card.innerHTML = `
      <div class="page-thumb-img-wrap skeleton">
        <img data-src="${pageUrl}" alt="${idx + 1}" decoding="async" style="opacity: 0; transition: opacity 0.2s ease;">
      </div>
      <div class="page-num">${idx + 1}</div>
    `;
    const img = card.querySelector("img");
    const wrap = card.querySelector(".page-thumb-img-wrap");
    img.onload = () => {
      if (wrap) wrap.classList.remove("skeleton");
      img.style.opacity = "1";
    };
    img.onerror = () => {
      if (wrap) wrap.classList.remove("skeleton");
    };
    gridObserver.observe(img);

    card.onclick = () => {
      jumpToPage(idx + 1);
      closeReaderGrid();
    };
    fragment.appendChild(card);
  });
  gridSheetBody.appendChild(fragment);

  const gridBackdrop = document.getElementById("reader-grid-backdrop");
  if (gridBackdrop) gridBackdrop.classList.add("open");
  if (readerGridSheet) readerGridSheet.classList.add("open");

  const activeEl = gridSheetBody.querySelector(".page-thumb-card.active");
  if (activeEl) {
    setTimeout(() => activeEl.scrollIntoView({ block: "center", behavior: "smooth" }), 60);
  }
}

function closeReaderGrid() {
  const gridBackdrop = document.getElementById("reader-grid-backdrop");
  if (gridBackdrop) gridBackdrop.classList.remove("open");
  const readerGridSheet = document.getElementById("reader-grid-sheet");
  if (readerGridSheet) readerGridSheet.classList.remove("open");
  if (gridObserver) {
    gridObserver.disconnect();
    gridObserver = null;
  }
}

// Touch Swipe Gestures
function setupSwipeGestures() {
  const pagedView = document.getElementById("paged-view");
  if (!pagedView) return;
  let touchStartX = 0;
  let touchStartY = 0;
  pagedView.addEventListener("touchstart", (e) => {
    if (e.touches.length === 1) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }
  }, { passive: true });

  pagedView.addEventListener("touchend", (e) => {
    if (e.changedTouches.length === 1) {
      const deltaX = e.changedTouches[0].clientX - touchStartX;
      const deltaY = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
        if (readingDirection === "RTL") {
          deltaX > 0 ? nextPage() : prevPage();
        } else {
          deltaX < 0 ? nextPage() : prevPage();
        }
      }
    }
  }, { passive: true });
}
