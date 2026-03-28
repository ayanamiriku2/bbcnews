const config = require("./config");

// ============================================================
// SEO HELPERS - Robots.txt, Sitemap, dll
// ============================================================

/**
 * Generate robots.txt untuk mirror
 */
function generateRobotsTxt(mirror) {
  return [
    `User-agent: *`,
    `Allow: /`,
    ``,
    `Sitemap: ${mirror.origin}/sitemap.xml`,
    ``,
    `# Mirror of ${config.SOURCE_HOST}`,
    `Host: ${mirror.host}`,
  ].join("\n");
}

/**
 * Rewrite sitemap XML — ganti semua URL sumber ke mirror
 */
function rewriteSitemap(xml, mirror) {
  const sourceRegex = new RegExp(
    `https?://${config.SOURCE_HOST.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
    "gi"
  );
  return xml.replace(sourceRegex, mirror.origin);
}

/**
 * Generate response headers yang SEO-friendly
 */
function getSeoHeaders(contentType, statusCode) {
  const headers = {};

  // Cache control
  if (contentType && contentType.includes("text/html")) {
    headers["Cache-Control"] = `public, max-age=${config.CACHE_TTL_HTML}, s-maxage=${config.CACHE_TTL_HTML}`;
  } else {
    headers["Cache-Control"] = `public, max-age=${config.CACHE_TTL_ASSETS}, s-maxage=${config.CACHE_TTL_ASSETS}`;
  }

  // Pastikan tidak ada X-Robots-Tag noindex
  headers["X-Robots-Tag"] = "index, follow";

  return headers;
}

module.exports = { generateRobotsTxt, rewriteSitemap, getSeoHeaders };
