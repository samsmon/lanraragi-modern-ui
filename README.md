# LANraragi Modern UI

A sleek, AMOLED pure black, mobile-first web frontend for [LANraragi](https://github.com/Difegue/LANraragi).

Built with zero build tools or complex frameworks—everything runs as a standalone single-page application with modern web standards, native performance, and a shadcn/ui zinc aesthetic.

---

## Highlights & Features

- **AMOLED Pure Black (`#000000`):** True-black background designed specifically for OLED/AMOLED mobile screens, minimizing battery consumption and eye strain.
- **Headerless Minimalist Interface:** Zero intrusive top headers. All controls, search, pagination, and navigation are integrated into floating bottom footbars for one-handed mobile ergonomics.
- **Adaptive Natural Aspect Ratios:** Manga cover art respects its natural proportions without forced 2:3 cropping.
- **Reading Progress & History Tracking:**
  - Automatically records reading progress in `localStorage` and syncs with LANraragi's backend.
  - Detail drawer provides **"Resume (Page X)"** and **"Read from Beginning"** options.
  - Dedicated **History** tab in bottom navigation showing recently read titles, relative timestamps, and progress bars.
  - Visual progress indicators on library cards.
- **Modern Fullscreen Reader:**
  - Seamless Single Page & Double Page (2 Pages Spread) mode without black borders or center gaps.
  - Right-to-Left (RTL) manga reading flow and Left-to-Right (LTR) western comic flow.
  - Intuitive touch gestures: swipe navigation follows RTL/LTR settings.
  - Pages Overview (Thumbnails Grid) with lazy loading and separate back-gesture handling.
  - Headerless reader overlay with compact bottom controls.
- **Real-Time Tag Autocomplete (Shinobu Search):**
  - Instant tag suggestions across namespaces (`artist:`, `character:`, `group:`, `publisher:`, `series:`, `language:`, and general tags).
  - Categorized color badges and archive count indicators.
- **Taxonomy Explorer:** Dedicated browse tab for exploring collections by artist, group, character, tag, or publisher.
- **Interactive Drawer:** Swipe/drag down to dismiss manga details and return to the library.

---

## Quickstart (Docker Sidecar)

The recommended deployment is as an Nginx sidecar container running alongside your existing LANraragi instance.

### `docker-compose.yml`

```yaml
services:
  # Existing LANraragi backend container
  lanraragi:
    image: difegue/lanraragi:latest
    container_name: lanraragi
    restart: unless-stopped
    ports:
      - "8123:3000"
    volumes:
      - /path/to/manga:/home/koyomi/lanraragi/content:ro
      - ./database:/home/koyomi/lanraragi/database
      - ./thumb:/home/koyomi/lanraragi/thumb

  # LANraragi Modern Mobile Web Frontend
  lanraragi-web:
    image: nginx:alpine
    container_name: lanraragi-web
    restart: unless-stopped
    ports:
      - "8125:80"
    volumes:
      - ./index.html:/usr/share/nginx/html/index.html:ro
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - lanraragi
```

1. Place `index.html` and `nginx.conf` in your LANraragi compose directory.
2. Add the `lanraragi-web` service to your `docker-compose.yml`.
3. Run:
   ```bash
   docker compose up -d
   ```
4. Access the modern web UI at `http://<your-server-ip>:8125`. Your original LANraragi admin interface remains accessible at `http://<your-server-ip>:8123`.

---

## Architecture & How It Works

This frontend is a single static HTML document (`index.html`) containing embedded semantic CSS and modern JavaScript. Nginx serves `index.html` on `/` and reverse-proxies `/api/` requests directly to `http://lanraragi:3000/api/`.

Because the API requests are proxied under the same origin, no CORS configuration or backend modifications are required.

---

## License

MIT © [samsmon](https://github.com/samsmon)
