// =========================================================================
// LANraragi API Endpoints & Request Helpers
// =========================================================================
const API = {
  SEARCH: "/api/search",
  ARCHIVES: "/api/archives",
  STATS: "/api/database/stats",
  archiveThumbnail: (arcid) => `/api/archives/${arcid}/thumbnail`,
  archiveFiles: (arcid) => `/api/archives/${arcid}/files`,
  archivePage: (arcid, page) => `/api/archives/${arcid}/page?page=${page}`,
  archiveProgress: (arcid, page) => `/api/archives/${arcid}/progress/${page}`,
  archiveDownload: (arcid) => `/api/archives/${arcid}/download`,
  archiveDelete: (arcid) => `/api/archives/${arcid}`
};

// Normalize search query for LANraragi
function normalizeQuery(q) {
  if (!q) return "";
  let s = q.trim();
  // Map full names to LANraragi database tag codes
  s = s.replace(/\blanguage:english\b/gi, "language:en");
  s = s.replace(/\blanguage:japanese\b/gi, "language:ja");
  s = s.replace(/\blanguage:chinese\b/gi, "language:zh");
  // Auto-insert comma between namespace tokens if separated only by space (e.g. artist:alp language:en)
  s = s.replace(/([^\s,])\s+((?:language|artist|group|character|parody|series|publisher|source):)/gi, "$1, $2");
  return s;
}

// Utility Helpers
function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function escapeJs(str) {
  if (!str) return "";
  return str.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, "\\\"");
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatRelativeTime(ts) {
  if (!ts) return "";
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(ts).toLocaleDateString();
}
