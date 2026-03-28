const config = require("./config");

// ============================================================
// URL REWRITER - Menulis ulang semua URL di HTML
// Sekarang dynamic: host & protocol ditentukan per-request
// ============================================================

const SOURCE_ORIGIN = `${config.SOURCE_PROTOCOL}://${config.SOURCE_HOST}`;

/**
 * Escape string untuk dipakai dalam regex
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Regex patterns (source side — statis)
const sourceHostEscaped = escapeRegex(config.SOURCE_HOST);

const FULL_URL_REGEX = new RegExp(
  `(https?:)?//${sourceHostEscaped}`,
  "gi"
);

const ESCAPED_URL_REGEX = new RegExp(
  `https?:\\\\?/\\\\?/${sourceHostEscaped.replace(/\./g, "\\\\?.")}`,
  "gi"
);

/**
 * Detect mirror host & protocol dari request headers
 */
function getMirrorInfo(req) {
  const mirrorHost =
    req.headers["x-forwarded-host"] ||
    req.headers.host ||
    config.MIRROR_HOST;
  const mirrorProto =
    req.headers["x-forwarded-proto"] ||
    (req.secure ? "https" : "http");
  return {
    host: mirrorHost,
    protocol: mirrorProto,
    origin: `${mirrorProto}://${mirrorHost}`,
  };
}

/**
 * Rewrite semua URL di dalam teks HTML/CSS/JS
 */
function rewriteUrls(text, mirror) {
  if (!text) return text;

  let result = text.replace(FULL_URL_REGEX, (match) => {
    if (match.startsWith("//")) {
      return `//${mirror.host}`;
    }
    return mirror.origin;
  });

  result = result.replace(ESCAPED_URL_REGEX, () => {
    return mirror.origin.replace(/\//g, "\\/");
  });

  return result;
}

/**
 * Rewrite URL tunggal (untuk header Location, dll)
 */
function rewriteSingleUrl(urlStr, mirror) {
  if (!urlStr) return urlStr;

  try {
    const parsed = new URL(urlStr, SOURCE_ORIGIN);
    if (
      parsed.hostname === config.SOURCE_HOST ||
      parsed.hostname === `www.${config.SOURCE_HOST}` ||
      parsed.hostname === config.SOURCE_HOST.replace(/^www\./, "")
    ) {
      parsed.hostname = mirror.host;
      parsed.protocol = mirror.protocol + ":";
      return parsed.toString();
    }
  } catch {
    if (urlStr.startsWith("/")) {
      return urlStr;
    }
  }
  return urlStr;
}

module.exports = { rewriteUrls, rewriteSingleUrl, getMirrorInfo, SOURCE_ORIGIN };
