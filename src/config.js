// ============================================================
// KONFIGURASI MIRROR - Ubah sesuai kebutuhan
// ============================================================

module.exports = {
  // Domain asli yang akan di-mirror
  SOURCE_HOST: process.env.SOURCE_HOST || "www.bbc.com",
  SOURCE_PROTOCOL: process.env.SOURCE_PROTOCOL || "https",

  // Domain mirror kamu (diisi saat deploy)
  // Contoh: "berita.domainku.com" atau "myapp.railway.app"
  MIRROR_HOST: process.env.MIRROR_HOST || "localhost",

  // Port server
  PORT: parseInt(process.env.PORT, 10) || 3000,

  // Protocol mirror (http untuk dev, https untuk production)
  MIRROR_PROTOCOL: process.env.MIRROR_PROTOCOL || "https",

  // User-Agent untuk fetch ke sumber
  USER_AGENT:
    process.env.USER_AGENT ||
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",

  // Timeout fetch dalam ms
  FETCH_TIMEOUT: parseInt(process.env.FETCH_TIMEOUT, 10) || 15000,

  // Cache TTL dalam detik
  CACHE_TTL_HTML: parseInt(process.env.CACHE_TTL_HTML, 10) || 300,       // 5 menit
  CACHE_TTL_ASSETS: parseInt(process.env.CACHE_TTL_ASSETS, 10) || 86400, // 1 hari

  // Nama situs untuk structured data
  SITE_NAME: process.env.SITE_NAME || "BBC News Mirror",
};
