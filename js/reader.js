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
  const readerDirBtn = document.getElementById("reader-dir-btn");
  if (!readerDirBtn) return;
  if (readingDirection === "RTL") {
    readerDirBtn.title = "Right-to-Left (Manga)";
    readerDirBtn.innerHTML = `<svg style="width: 15px; height: 15px;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>`;
  } else {
    readerDirBtn.title = "Left-to-Right (Western)";
    readerDirBtn.innerHTML = `<svg style="width: 15px; height: 15px;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`;
  }
}

function updateSpreadButton() {
  const readerSpreadBtn = document.getElementById("reader-spread-btn");
  if (!readerSpreadBtn) return;
  if (isDoublePage) {
    readerSpreadBtn.title = "Double Page Spread";
    readerSpreadBtn.innerHTML = `<svg style="width: 16px; height: 16px;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="8" height="16" rx="1.5"/><rect x="13" y="4" width="8" height="16" rx="1.5"/></svg>`;
  } else {
    readerSpreadBtn.title = "Single Page";
    readerSpreadBtn.innerHTML = `<svg style="width: 15px; height: 15px;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2"/></svg>`;
  }
}

async function openReader(arcid, targetPage = 1, title = null) {
  if (typeof targetPage === "string" && isNaN(Number(targetPage))) {
    title = targetPage;
    targetPage = 1;
  }
  targetPage = parseInt(targetPage, 10) || 1;
  currentReaderArcId = arcid;

  if (!title) {
    if (typeof currentArchive !== "undefined" && currentArchive && currentArchive.arcid === arcid && currentArchive.title) {
      title = currentArchive.title;
    } else {
      const prog = typeof ReadingHistory !== "undefined" ? ReadingHistory.getProgress(arcid) : null;
      if (prog && prog.title) title = prog.title;
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

  // Automatic default: Paged mode
  isWebtoonMode = false;
  const readerModeBtn = document.getElementById("reader-mode-btn");
  const readerSpreadBtn = document.getElementById("reader-spread-btn");
  const pagedView = document.getElementById("paged-view");
  const webtoonView = document.getElementById("webtoon-view");
  const pagedSpreadWrap = document.getElementById("paged-spread-wrap");

  if (readerModeBtn) readerModeBtn.innerText = "Paged";
  if (readerSpreadBtn) readerSpreadBtn.style.display = "inline-flex";
  if (pagedView) pagedView.style.display = "flex";
  if (webtoonView) webtoonView.style.display = "none";

  const readerSkeleton = document.getElementById("reader-skeleton");
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

    // Jump to targetPage directly if specified
    let startIdx = 0;
    if (targetPage > 1 && currentPages.length > 0) {
      startIdx = Math.min(targetPage - 1, currentPages.length - 1);
    }
    currentPageIndex = startIdx;
    loadPagedPage(currentPageIndex);
  } catch (err) {
    if (readerSkeleton) readerSkeleton.style.display = "none";
    if (pagedSpreadWrap) pagedSpreadWrap.style.opacity = "1";
    alert("Failed to load archive pages: " + err);
    closeReader();
  }
}

function closeReader() {
  const readerModal = document.getElementById("reader-modal");
  if (readerModal) readerModal.classList.remove("active");
  closeReaderGrid();
  document.body.classList.remove("modal-open");

  const pagedImgLeft = document.getElementById("paged-img-left");
  const pagedImgRight = document.getElementById("paged-img-right");
  if (pagedImgLeft) {
    pagedImgLeft.src = "";
    pagedImgLeft.classList.remove("skeleton-loading");
  }
  if (pagedImgRight) {
    pagedImgRight.src = "";
    pagedImgRight.classList.remove("skeleton-loading");
  }

  const readerSkeleton = document.getElementById("reader-skeleton");
  if (readerSkeleton) readerSkeleton.style.display = "none";
  const webtoonView = document.getElementById("webtoon-view");
  if (webtoonView) webtoonView.innerHTML = "";

  // Refresh history view or library card progress indicator
  const activePane = document.querySelector(".view-pane.active");
  if (activePane && activePane.id === "view-history") {
    if (typeof renderHistoryView === "function") renderHistoryView();
  } else if (currentReaderArcId) {
    if (typeof updateCardProgressUI === "function") updateCardProgressUI(currentReaderArcId);
  }
}

function toggleSpreadMode() {
  isDoublePage = !isDoublePage;
  updateSpreadButton();
  loadPagedPage(currentPageIndex);
}

function loadPagedPage(idx) {
  if (idx < 0) idx = 0;
  if (idx >= currentPages.length) idx = currentPages.length - 1;
  currentPageIndex = idx;

  // Update reading history on page turn
  if (currentReaderArcId && currentPages.length > 0 && typeof ReadingHistory !== "undefined") {
    ReadingHistory.saveProgress(currentReaderArcId, idx + 1, currentPages.length);
  }

  const pagedSpreadWrap = document.getElementById("paged-spread-wrap");
  const pagedImgLeft = document.getElementById("paged-img-left");
  const pagedImgRight = document.getElementById("paged-img-right");
  const scrubberSlider = document.getElementById("scrubber-slider");
  const scrubberCounter = document.getElementById("scrubber-counter");

  if (!isDoublePage) {
    // Single Page Mode
    if (pagedSpreadWrap) pagedSpreadWrap.classList.remove("double-mode");
    if (pagedImgLeft) {
      pagedImgLeft.style.display = "none";
      pagedImgLeft.src = "";
      pagedImgLeft.classList.remove("skeleton-loading");
    }
    if (pagedImgRight) {
      pagedImgRight.style.display = "block";
      pagedImgRight.style.opacity = "0.3";
      pagedImgRight.classList.add("skeleton-loading");
      pagedImgRight.src = currentPages[idx];
      pagedImgRight.onload = () => {
        pagedImgRight.classList.remove("skeleton-loading");
        pagedImgRight.style.opacity = "1";
      };
      pagedImgRight.onerror = () => {
        pagedImgRight.classList.remove("skeleton-loading");
      };
    }

    if (scrubberSlider) scrubberSlider.value = idx + 1;
    if (scrubberCounter) scrubberCounter.innerText = `${idx + 1} / ${currentPages.length}`;

    // Preload next image
    if (idx + 1 < currentPages.length) {
      const pre = new Image();
      pre.src = currentPages[idx + 1];
    }
  } else {
    // Double Page Spread Mode
    if (pagedSpreadWrap) pagedSpreadWrap.classList.add("double-mode");
    const hasSecondPage = (idx + 1 < currentPages.length);

    if (hasSecondPage) {
      if (pagedImgLeft) {
        pagedImgLeft.style.display = "block";
        pagedImgLeft.style.opacity = "0.3";
        pagedImgLeft.classList.add("skeleton-loading");
      }
      if (pagedImgRight) {
        pagedImgRight.style.display = "block";
        pagedImgRight.style.opacity = "0.3";
        pagedImgRight.classList.add("skeleton-loading");
      }

      if (readingDirection === "RTL") {
        // Manga standard: Right side is Page idx, Left side is Page idx + 1
        if (pagedImgRight) pagedImgRight.src = currentPages[idx];
        if (pagedImgLeft) pagedImgLeft.src = currentPages[idx + 1];
      } else {
        // LTR: Left side is Page idx, Right side is Page idx + 1
        if (pagedImgLeft) pagedImgLeft.src = currentPages[idx];
        if (pagedImgRight) pagedImgRight.src = currentPages[idx + 1];
      }

      if (pagedImgLeft) {
        pagedImgLeft.onload = () => {
          pagedImgLeft.classList.remove("skeleton-loading");
          pagedImgLeft.style.opacity = "1";
        };
        pagedImgLeft.onerror = () => {
          pagedImgLeft.classList.remove("skeleton-loading");
        };
      }
      if (pagedImgRight) {
        pagedImgRight.onload = () => {
          pagedImgRight.classList.remove("skeleton-loading");
          pagedImgRight.style.opacity = "1";
        };
        pagedImgRight.onerror = () => {
          pagedImgRight.classList.remove("skeleton-loading");
        };
      }

      if (scrubberSlider) scrubberSlider.value = idx + 1;
      if (scrubberCounter) scrubberCounter.innerText = `${idx + 1}-${idx + 2} / ${currentPages.length}`;

      // Preload next spread
      if (idx + 2 < currentPages.length) {
        const pre1 = new Image(); pre1.src = currentPages[idx + 2];
        if (idx + 3 < currentPages.length) {
          const pre2 = new Image(); pre2.src = currentPages[idx + 3];
        }
      }
    } else {
      // Last page standalone
      if (pagedImgLeft) {
        pagedImgLeft.style.display = "none";
        pagedImgLeft.src = "";
        pagedImgLeft.classList.remove("skeleton-loading");
      }
      if (pagedImgRight) {
        pagedImgRight.style.display = "block";
        pagedImgRight.style.opacity = "0.3";
        pagedImgRight.classList.add("skeleton-loading");
        pagedImgRight.src = currentPages[idx];
        pagedImgRight.onload = () => {
          pagedImgRight.classList.remove("skeleton-loading");
          pagedImgRight.style.opacity = "1";
        };
        pagedImgRight.onerror = () => {
          pagedImgRight.classList.remove("skeleton-loading");
        };
      }

      if (scrubberSlider) scrubberSlider.value = idx + 1;
      if (scrubberCounter) scrubberCounter.innerText = `${idx + 1} / ${currentPages.length}`;
    }
  }
}

function prevPage() {
  if (isWebtoonMode) return;
  const step = isDoublePage ? 2 : 1;
  if (currentPageIndex > 0) {
    loadPagedPage(Math.max(0, currentPageIndex - step));
  }
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

function toggleReaderMode() {
  isWebtoonMode = !isWebtoonMode;
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
      loadPagedPage(currentPageIndex);
    }
  }
}

function toggleReadingDirection() {
  readingDirection = (readingDirection === "RTL") ? "LTR" : "RTL";
  updateReaderDirButton();
  if (!isWebtoonMode) loadPagedPage(currentPageIndex);
}

function handleTouchLeft() {
  if (readingDirection === "RTL") {
    nextPage();
  } else {
    prevPage();
  }
}

function handleTouchRight() {
  if (readingDirection === "RTL") {
    prevPage();
  } else {
    nextPage();
  }
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

  if (readerGridSheet) readerGridSheet.classList.add("open");

  // Smooth scroll to current active thumbnail
  const activeEl = gridSheetBody.querySelector(".page-thumb-card.active");
  if (activeEl) {
    setTimeout(() => activeEl.scrollIntoView({ block: "center", behavior: "smooth" }), 60);
  }
}

function closeReaderGrid() {
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
          // Manga flow: Swiping to the right advances to next page, swiping left goes back
          if (deltaX > 0) {
            nextPage();
          } else {
            prevPage();
          }
        } else {
          // Western flow: Swiping left advances to next page, swiping right goes back
          if (deltaX < 0) {
            nextPage();
          } else {
            prevPage();
          }
        }
      }
    }
  }, { passive: true });
}
