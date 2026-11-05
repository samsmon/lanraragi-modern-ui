// =========================================================================
// Tag Autocomplete / Recommendations (Native LANraragi Style)
// =========================================================================
let allDatabaseTags = [];

async function preloadDatabaseTags() {
  if (allDatabaseTags.length > 0) return;
  try {
    const res = await fetch("/api/database/stats");
    const data = await res.json();
    // Exclude source URLs and date_added
    allDatabaseTags = data.filter(item => {
      const ns = item.namespace || "";
      return ns !== "source" && ns !== "date_added";
    });
  } catch (e) {
    console.warn("Error preloading tag stats:", e);
  }
}

function getActiveSearchToken(inputVal) {
  if (!inputVal) return { token: "", prefix: "" };
  const parts = inputVal.split(",");
  const lastPart = parts[parts.length - 1];
  const token = lastPart.trim();
  const prefix = parts.slice(0, -1).join(", ");
  return { token, prefix };
}

function renderTagSuggestions(token) {
  const searchSuggestionsBox = document.getElementById("search-suggestions");
  if (!searchSuggestionsBox) return;
  if (!token || token.length < 2 || allDatabaseTags.length === 0) {
    searchSuggestionsBox.style.display = "none";
    searchSuggestionsBox.innerHTML = "";
    return;
  }

  const q = token.toLowerCase();
  let matched = [];

  if (q.includes(":")) {
    const colonIdx = q.indexOf(":");
    const ns = q.substring(0, colonIdx);
    const sub = q.substring(colonIdx + 1);

    matched = allDatabaseTags.filter(item => {
      if ((item.namespace || "").toLowerCase() !== ns) return false;
      return (item.text || "").toLowerCase().includes(sub);
    });
  } else {
    matched = allDatabaseTags.filter(item => {
      const text = (item.text || "").toLowerCase();
      const ns = (item.namespace || "").toLowerCase();
      return text.includes(q) || (ns && `${ns}:${text}`.includes(q));
    });
  }

  if (matched.length === 0) {
    searchSuggestionsBox.style.display = "none";
    searchSuggestionsBox.innerHTML = "";
    return;
  }

  matched.sort((a, b) => {
    const aText = (a.text || "").toLowerCase();
    const bText = (b.text || "").toLowerCase();
    const aStarts = aText.startsWith(q) || `${a.namespace || ''}:${aText}`.startsWith(q);
    const bStarts = bText.startsWith(q) || `${b.namespace || ''}:${bText}`.startsWith(q);
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;
    return (b.weight || 0) - (a.weight || 0);
  });

  const topSuggestions = matched.slice(0, 8);
  let html = "";
  topSuggestions.forEach(item => {
    const ns = item.namespace || "";
    const tagText = item.text || "";
    const fullTag = ns ? `${ns}:${tagText}` : tagText;
    const nsClass = ns ? `ns-${ns}` : "ns-tag";
    const nsLabel = ns || "tag";

    html += `
      <div class="suggestion-item" onclick="selectSearchSuggestion('${escapeJs(fullTag)}')">
        <div class="suggestion-tag-wrap">
          <span class="suggestion-ns ${nsClass}">${escapeHtml(nsLabel)}</span>
          <span>${escapeHtml(tagText)}</span>
        </div>
        <span class="suggestion-count">${(item.weight || 1).toLocaleString()}</span>
      </div>
    `;
  });

  searchSuggestionsBox.innerHTML = html;
  searchSuggestionsBox.style.display = "block";
}

function selectSearchSuggestion(tag) {
  const searchInput = document.getElementById("search-input");
  const clearBtn = document.getElementById("clear-search-btn");
  const searchSuggestionsBox = document.getElementById("search-suggestions");
  if (!searchInput) return;

  const currentVal = searchInput.value;
  const { prefix } = getActiveSearchToken(currentVal);
  let newVal = "";
  if (prefix) {
    newVal = `${prefix}, ${tag}, `;
  } else {
    newVal = `${tag}, `;
  }
  searchInput.value = newVal;
  if (clearBtn) clearBtn.classList.add("visible");
  if (searchSuggestionsBox) searchSuggestionsBox.style.display = "none";
  searchInput.focus();
  if (typeof executeSearch === "function") {
    executeSearch(newVal.trim());
  }
}

// Outside click listener for closing suggestions dropdown
document.addEventListener("click", (e) => {
  const searchSuggestionsBox = document.getElementById("search-suggestions");
  if (searchSuggestionsBox && !e.target.closest(".search-box")) {
    searchSuggestionsBox.style.display = "none";
  }
});
