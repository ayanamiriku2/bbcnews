const express = require("express");
const compression = require("compression");
const config = require("./config");
const { rewriteUrls, rewriteSingleUrl, getMirrorInfo, SOURCE_ORIGIN } = require("./rewriter");
const { transformHtml } = require("./transformer");
const { generateRobotsTxt, rewriteSitemap, getSeoHeaders } = require("./seo");

const app = express();

// ── GZIP ──
app.use(compression());

// ── Trust proxy (untuk Railway/Render di belakang LB) ──
app.set("trust proxy", 1);

// ── ROBOTS.TXT ──
app.get("/robots.txt", (req, res) => {
  const mirror = getMirrorInfo(req);
  res.set("Content-Type", "text/plain; charset=utf-8");
  res.set("Cache-Control", "public, max-age=3600");
  res.set("X-Robots-Tag", "nosnippet"); // robots.txt sendiri tidak perlu di-index
  res.send(generateRobotsTxt(mirror));
});

// ── HEALTH CHECK (untuk Railway/Render) ──
app.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// ── REVERSE PROXY UTAMA ──
app.all("*", async (req, res) => {
  const requestPath = req.originalUrl; // termasuk query string
  const mirror = getMirrorInfo(req);

  try {
    const targetUrl = `${SOURCE_ORIGIN}${requestPath}`;

    // Headers untuk request ke sumber
    const fetchHeaders = {
      "User-Agent": config.USER_AGENT,
      Accept: req.headers.accept || "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": req.headers["accept-language"] || "en-US,en;q=0.9,id;q=0.8",
      "Accept-Encoding": "gzip, deflate, br",
      Referer: SOURCE_ORIGIN + "/",
    };

    // Jangan forward cookies/auth ke sumber untuk keamanan
    // Tapi forward beberapa header yang berguna
    if (req.headers["if-none-match"]) {
      fetchHeaders["If-None-Match"] = req.headers["if-none-match"];
    }
    if (req.headers["if-modified-since"]) {
      fetchHeaders["If-Modified-Since"] = req.headers["if-modified-since"];
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.FETCH_TIMEOUT);

    let response;
    try {
      response = await fetch(targetUrl, {
        method: req.method === "HEAD" ? "GET" : req.method,
        headers: fetchHeaders,
        redirect: "manual", // PENTING: handle redirect sendiri
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const status = response.status;
    const contentType = response.headers.get("content-type") || "";

    // ── HANDLE REDIRECTS ──
    // Ini mengatasi masalah "Halaman dengan pengalihan"
    if (status >= 300 && status < 400) {
      const location = response.headers.get("location");
      if (location) {
        const newLocation = rewriteSingleUrl(location, mirror);
        // Ikuti redirect secara internal jika masih ke domain yang sama
        // Agar Google tidak melihat chain redirect
        if (shouldFollowRedirect(location)) {
          return await followAndServe(req, res, location, 0, mirror);
        }
        // Untuk redirect ke domain lain, forward redirect
        res.redirect(status, newLocation);
        return;
      }
    }

    // ── SET RESPONSE HEADERS ──
    const seoHeaders = getSeoHeaders(contentType, status);
    for (const [key, value] of Object.entries(seoHeaders)) {
      res.set(key, value);
    }

    // Forward beberapa header dari sumber
    const etag = response.headers.get("etag");
    if (etag) res.set("ETag", etag);
    const lastMod = response.headers.get("last-modified");
    if (lastMod) res.set("Last-Modified", lastMod);

    // Set content type
    if (contentType) {
      res.set("Content-Type", contentType);
    }

    // Hapus header yang bisa bikin masalah
    res.removeHeader("X-Frame-Options"); // biarkan embed
    res.set("Access-Control-Allow-Origin", "*");

    // ── PROCESS BODY ──
    const bodyBuffer = Buffer.from(await response.arrayBuffer());

    if (status === 304) {
      res.status(304).end();
      return;
    }

    // HTML → transform penuh
    if (contentType.includes("text/html")) {
      const html = bodyBuffer.toString("utf-8");
      const transformed = transformHtml(html, requestPath.split("?")[0], mirror);
      res.status(status).send(transformed);
      return;
    }

    // Sitemap XML → rewrite URLs
    if (
      contentType.includes("text/xml") ||
      contentType.includes("application/xml") ||
      requestPath.includes("sitemap")
    ) {
      const xml = bodyBuffer.toString("utf-8");
      const rewritten = rewriteSitemap(xml, mirror);
      res.status(status).send(rewritten);
      return;
    }

    // CSS → rewrite URL references
    if (contentType.includes("text/css")) {
      const css = bodyBuffer.toString("utf-8");
      res.status(status).send(rewriteUrls(css, mirror));
      return;
    }

    // JavaScript → rewrite URL references
    if (
      contentType.includes("javascript") ||
      contentType.includes("application/json")
    ) {
      const js = bodyBuffer.toString("utf-8");
      res.status(status).send(rewriteUrls(js, mirror));
      return;
    }

    // Binary (gambar, font, dll) → kirim langsung
    res.status(status).send(bodyBuffer);
  } catch (err) {
    if (err.name === "AbortError") {
      console.error(`[TIMEOUT] ${requestPath}`);
      res.status(504).send("Gateway Timeout");
      return;
    }
    console.error(`[ERROR] ${requestPath}:`, err.message);
    res.status(502).send("Bad Gateway");
  }
});

// ============================================================
// REDIRECT FOLLOWER
// Mengikuti redirect secara internal agar Google
// tidak melihat chain redirect (mengatasi "Halaman dengan pengalihan")
// ============================================================

function shouldFollowRedirect(location) {
  try {
    const parsed = new URL(location, SOURCE_ORIGIN);
    return (
      parsed.hostname === config.SOURCE_HOST ||
      parsed.hostname === config.SOURCE_HOST.replace(/^www\./, "") ||
      parsed.hostname === `www.${config.SOURCE_HOST}`
    );
  } catch {
    // Relative URL — masih ke domain yang sama
    return true;
  }
}

async function followAndServe(req, res, location, depth, mirror) {
  if (depth > 5) {
    res.status(508).send("Too many redirects");
    return;
  }

  let targetUrl;
  try {
    targetUrl = new URL(location, SOURCE_ORIGIN).toString();
  } catch {
    targetUrl = `${SOURCE_ORIGIN}${location}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.FETCH_TIMEOUT);

  let response;
  try {
    response = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "User-Agent": config.USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: SOURCE_ORIGIN + "/",
      },
      redirect: "manual",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  const status = response.status;

  // Masih redirect? Ikuti lagi
  if (status >= 300 && status < 400) {
    const newLoc = response.headers.get("location");
    if (newLoc && shouldFollowRedirect(newLoc)) {
      return await followAndServe(req, res, newLoc, depth + 1, mirror);
    }
    // Redirect ke luar, forward
    res.redirect(status, rewriteSingleUrl(newLoc || "/", mirror));
    return;
  }

  const contentType = response.headers.get("content-type") || "";
  const bodyBuffer = Buffer.from(await response.arrayBuffer());

  // Tentukan path final dari URL yang di-resolve
  const finalPath = new URL(targetUrl).pathname;

  const seoHeaders = getSeoHeaders(contentType, status);
  for (const [key, value] of Object.entries(seoHeaders)) {
    res.set(key, value);
  }
  if (contentType) res.set("Content-Type", contentType);
  res.set("Access-Control-Allow-Origin", "*");

  if (contentType.includes("text/html")) {
    const html = bodyBuffer.toString("utf-8");
    const transformed = transformHtml(html, finalPath, mirror);
    res.status(200).send(transformed);
  } else {
    res.status(status).send(bodyBuffer);
  }
}

// ── START SERVER ──
app.listen(config.PORT, "0.0.0.0", () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║  BBC News Mirror - Reverse Proxy                        ║
║  Port:   ${String(config.PORT).padEnd(46)}║
║  Source: ${config.SOURCE_HOST.padEnd(47)}║
║  Mirror: ${config.MIRROR_HOST.padEnd(47)}║
╚══════════════════════════════════════════════════════════╝
  `);
});
