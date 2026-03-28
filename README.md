# BBC News Mirror

Full mirror reverse proxy untuk **www.bbc.com** dengan optimasi SEO. Dibangun dengan Node.js/Express, siap deploy ke Railway, Render, atau VPS pribadi.

## Fitur

- **Full Reverse Proxy** — Mirror seluruh konten BBC News (HTML, CSS, JS, gambar, JSON)
- **Auto-detect Host** — Otomatis deteksi domain mirror dari request header, tanpa perlu konfigurasi manual
- **URL Rewriting** — Semua link internal di-rewrite ke domain mirror
- **SEO Optimized** — Mengatasi masalah Google Search Console:
  - Canonical URL → domain mirror (fix *duplikat / Google pilih kanonis berbeda*)
  - Redirect diikuti internal, max 5 hop (fix *halaman dengan pengalihan*)
  - Structured data JSON-LD di-rewrite & diperbaiki (fix *data terstruktur Breadcrumb / tidak dapat diurai*)
  - Meta robots `index, follow` (fix *noindex*)
  - Hreflang/alternate ke domain asli dihapus
- **Robots.txt & Sitemap** — Custom robots.txt, sitemap XML di-rewrite otomatis
- **Gzip Compression** — Response dikompresi otomatis
- **Health Check** — Endpoint `/healthz` untuk monitoring

## Struktur File

```
src/
├── server.js       # Server Express + reverse proxy + redirect handler
├── config.js       # Konfigurasi (source host, port, cache TTL)
├── rewriter.js     # URL rewriting engine (dynamic per-request)
├── transformer.js  # HTML transformer (canonical, meta, JSON-LD, link)
└── seo.js          # Robots.txt, sitemap rewrite, SEO headers
Dockerfile          # Docker image
railway.toml        # Config deploy Railway
render.yaml         # Config deploy Render
.env.example        # Template environment variables
```

## Quick Start

```bash
npm install
PORT=3000 node src/server.js
```

Buka `http://localhost:3000/`

## Environment Variables

| Variable | Default | Keterangan |
|---|---|---|
| `PORT` | `3000` | Port server |
| `SOURCE_HOST` | `www.bbc.com` | Domain sumber yang di-mirror |
| `SOURCE_PROTOCOL` | `https` | Protocol sumber |
| `MIRROR_HOST` | *(auto-detect)* | Domain mirror (opsional, otomatis dari request) |
| `MIRROR_PROTOCOL` | *(auto-detect)* | Protocol mirror (opsional, otomatis dari request) |
| `SITE_NAME` | `BBC News Mirror` | Nama situs untuk structured data |
| `FETCH_TIMEOUT` | `15000` | Timeout fetch ke sumber (ms) |
| `CACHE_TTL_HTML` | `300` | Cache TTL HTML (detik) |
| `CACHE_TTL_ASSETS` | `86400` | Cache TTL assets (detik) |

## Deploy

### Railway

1. Push repo ke GitHub
2. Connect repo di [Railway](https://railway.app)
3. Set variable `MIRROR_HOST` ke domain custom (opsional)
4. Deploy otomatis

### Render

1. Push repo ke GitHub
2. Create **Web Service** di [Render](https://render.com)
3. Connect repo, Render akan baca `render.yaml` otomatis
4. Set variable `MIRROR_HOST` di dashboard

### VPS / Docker

```bash
docker build -t bbcnews-mirror .
docker run -d -p 3000:3000 --name bbcnews bbcnews-mirror
```

Atau tanpa Docker:

```bash
git clone https://github.com/ayanamiriku2/bbcnews.git
cd bbcnews
npm install --production
PORT=3000 node src/server.js
```

Gunakan Nginx/Caddy sebagai reverse proxy di depan untuk SSL.

## Masalah SEO yang Ditangani

| Masalah Google Search Console | Solusi |
|---|---|
| Duplikat, Google memilih versi kanonis yang berbeda | Canonical URL di-rewrite ke mirror, hreflang dihapus |
| Tidak ditemukan (404) | Status code diteruskan dari sumber |
| Halaman dengan pengalihan | Redirect diikuti internal (max 5 hop), response 200 |
| Data terstruktur Breadcrumb | JSON-LD BreadcrumbList diperbaiki: URL, position, @type |
| Data terstruktur tidak dapat diurai | JSON-LD rusak dihapus otomatis, yang valid di-rewrite |