const cheerio = require("cheerio");
const config = require("./config");
const { rewriteUrls, rewriteSingleUrl, SOURCE_ORIGIN } = require("./rewriter");

// ============================================================
// HTML TRANSFORMER - Memperbaiki HTML untuk SEO
// ============================================================

/**
 * Transform HTML untuk menghilangkan masalah SEO:
 * - Canonical URL → mirror domain
 * - Open Graph / Twitter meta → mirror domain
 * - Structured data JSON-LD → mirror domain + fix breadcrumb
 * - Semua internal link → mirror domain
 * - Hapus tag yang bikin duplikat (hreflang asli, alternate)
 * - Tambah meta robots yang benar
 */
function transformHtml(html, requestPath, mirror) {
  // Step 1: Rewrite semua URL di raw HTML
  let transformed = rewriteUrls(html, mirror);

  // Step 2: Parse dan manipulasi DOM
  const $ = cheerio.load(transformed, { decodeEntities: false });

  const canonicalUrl = `${mirror.origin}${requestPath}`;

  // ── CANONICAL URL ──
  // Hapus semua canonical yang ada, ganti dengan satu yang benar
  $('link[rel="canonical"]').remove();
  $("head").append(`<link rel="canonical" href="${canonicalUrl}" />`);

  // ── HREFLANG & ALTERNATE ──
  // Hapus hreflang ke domain asli (ini penyebab utama "Google memilih kanonis berbeda")
  $('link[rel="alternate"]').each(function () {
    const href = $(this).attr("href") || "";
    if (
      href.includes(config.SOURCE_HOST) ||
      $(this).attr("hreflang")
    ) {
      $(this).remove();
    }
  });

  // ── META TAGS ──
  // Rewrite og:url
  $('meta[property="og:url"]').attr("content", canonicalUrl);
  // Rewrite twitter:url  
  $('meta[name="twitter:url"]').attr("content", canonicalUrl);
  // Rewrite og:site_name
  if ($('meta[property="og:site_name"]').length) {
    $('meta[property="og:site_name"]').attr("content", config.SITE_NAME);
  }

  // ── META ROBOTS ──
  // Pastikan halaman bisa di-index
  $('meta[name="robots"]').remove();
  $("head").append('<meta name="robots" content="index, follow" />');

  // Hapus noindex/nofollow dari X-Robots-Tag
  $('meta[http-equiv="X-Robots-Tag"]').remove();

  // ── STRUCTURED DATA (JSON-LD) ──
  $('script[type="application/ld+json"]').each(function () {
    try {
      let jsonText = $(this).html();
      if (!jsonText) return;

      let data = JSON.parse(jsonText);
      data = fixStructuredData(data, requestPath, mirror);
      $(this).html(JSON.stringify(data));
    } catch {
      // Jika JSON-LD tidak bisa di-parse, hapus saja daripada error di GSC
      $(this).remove();
    }
  });

  // ── INTERNAL LINKS ──
  $("a[href]").each(function () {
    const href = $(this).attr("href");
    $(this).attr("href", rewriteSingleUrl(href, mirror));
  });

  // ── FORM ACTIONS ──
  $("form[action]").each(function () {
    const action = $(this).attr("action");
    $(this).attr("action", rewriteSingleUrl(action, mirror));
  });

  // ── PREFETCH / PRECONNECT ──
  // Ganti preconnect ke domain asli
  $('link[rel="preconnect"], link[rel="dns-prefetch"]').each(function () {
    const href = $(this).attr("href") || "";
    if (href.includes(config.SOURCE_HOST)) {
      $(this).remove();
    }
  });

  return $.html();
}

/**
 * Fix structured data JSON-LD secara rekursif
 * Mengatasi: "Data terstruktur Breadcrumb" & "Data terstruktur tidak dapat diurai"
 */
function fixStructuredData(data, requestPath, mirror) {
  if (Array.isArray(data)) {
    return data.map((item) => fixStructuredData(item, requestPath, mirror));
  }

  if (data && typeof data === "object") {
    // Fix @id dan url fields
    for (const key of Object.keys(data)) {
      if (
        typeof data[key] === "string" &&
        (key === "url" ||
          key === "@id" ||
          key === "mainEntityOfPage" ||
          key === "isPartOf" ||
          key === "target")
      ) {
        data[key] = rewriteSingleUrl(data[key], mirror);
      } else if (typeof data[key] === "object") {
        data[key] = fixStructuredData(data[key], requestPath, mirror);
      }
    }

    // Fix BreadcrumbList
    if (data["@type"] === "BreadcrumbList" && Array.isArray(data.itemListElement)) {
      data.itemListElement = data.itemListElement.map((item, index) => {
        // Pastikan setiap item punya position yang benar (mulai dari 1)
        item.position = index + 1;

        // Pastikan item punya @type
        if (!item["@type"]) {
          item["@type"] = "ListItem";
        }

        // Fix URL di item
        if (item.item) {
          if (typeof item.item === "string") {
            item.item = rewriteSingleUrl(item.item, mirror);
          } else if (typeof item.item === "object") {
            if (item.item["@id"]) {
              item.item["@id"] = rewriteSingleUrl(item.item["@id"], mirror);
            }
            if (item.item.url) {
              item.item.url = rewriteSingleUrl(item.item.url, mirror);
            }
          }
        }

        // Pastikan ada name
        if (!item.name && item.item && typeof item.item === "object" && item.item.name) {
          item.name = item.item.name;
        }

        return item;
      });
    }

    // Fix WebSite schema
    if (data["@type"] === "WebSite") {
      data.url = mirror.origin + "/";
      data.name = config.SITE_NAME;
      if (data.potentialAction && data.potentialAction.target) {
        if (typeof data.potentialAction.target === "string") {
          data.potentialAction.target = rewriteSingleUrl(data.potentialAction.target, mirror);
        } else if (data.potentialAction.target["urlTemplate"]) {
          data.potentialAction.target["urlTemplate"] = rewriteSingleUrl(
            data.potentialAction.target["urlTemplate"], mirror
          );
        }
      }
    }

    // Fix WebPage / NewsArticle
    if (
      data["@type"] === "WebPage" ||
      data["@type"] === "NewsArticle" ||
      data["@type"] === "Article"
    ) {
      if (data.url) data.url = rewriteSingleUrl(data.url, mirror);
      if (data.mainEntityOfPage) {
        if (typeof data.mainEntityOfPage === "string") {
          data.mainEntityOfPage = rewriteSingleUrl(data.mainEntityOfPage, mirror);
        } else if (data.mainEntityOfPage["@id"]) {
          data.mainEntityOfPage["@id"] = rewriteSingleUrl(data.mainEntityOfPage["@id"], mirror);
        }
      }
      if (data.isPartOf) {
        if (typeof data.isPartOf === "string") {
          data.isPartOf = rewriteSingleUrl(data.isPartOf, mirror);
        } else if (data.isPartOf["@id"]) {
          data.isPartOf["@id"] = rewriteSingleUrl(data.isPartOf["@id"], mirror);
        }
      }
    }
  }

  return data;
}

module.exports = { transformHtml };
