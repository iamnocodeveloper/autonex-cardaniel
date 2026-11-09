/**
 * PWA del panel — Fase 0: instalable + offline básico.
 *
 * Rutas (registradas ANTES del guard de auth en routes.ts, para que el
 * navegador pueda pedir el manifest y el service worker sin cookie):
 *   GET /admin/manifest.webmanifest
 *   GET /admin/sw.js
 *   GET /admin/icon.svg
 *
 * El <head> del panel (views/layout.ts) enlaza el manifest y registra el SW.
 *
 * Fase 1 (push) se apoya en los handlers `push` / `notificationclick` que ya
 * van dentro del SW — solo falta el emisor con VAPID y la tabla de
 * suscripciones. Ver PLAN.md § PWA.
 */
import type { Env } from "../env";
import { makeT, type T } from "./i18n";

interface PwaBrand {
  name: string;
  themeColor: string;
  accent: string;
  accent2: string;
}

function brand(env: Env): PwaBrand {
  // Identidad Kooni 2026: fucsia/violeta sobre tinta con matiz violeta
  // (mismos valores del tema oscuro en layout.ts). El manifest y el theme-color
  // no cambian con el toggle claro/oscuro — se quedan en el oscuro.
  return {
    name: env.BRAND_NAME || "Kooni",
    themeColor: env.BRAND_BG || "#0f0e17",
    accent: env.BRAND_PRIMARY || "#e05fd8",
    accent2: env.BRAND_ACCENT2 || "#a679f6",
  };
}

/** Ícono de la app: fondo a sangre (sirve como `maskable`) + la K de nodo. */
export function iconSvg(env: Env): string {
  const b = brand(env);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${b.themeColor}"/>
  <g transform="translate(128,128) scale(8)">
    <path d="M11 23V9h2.5l5 7.5 5-7.5H26v14h-3V15l-4.5 6.8L13 15v8h-2z" fill="${b.accent}"/>
    <circle cx="23" cy="9" r="2" fill="${b.accent2}"/>
  </g>
</svg>`;
}

export function manifest(env: Env): string {
  const b = brand(env);
  const niche = (env.BOT_NICHE ?? "").trim().toLowerCase();
  const esResto = niche === "restaurante";
  const esTaxis = niche === "taxis";
  const description = esResto
    ? `Panel de ${b.name}: pedidos, menú y avisos.`
    : esTaxis
      ? `Panel de ${b.name}: viajes, cola de conductores y avisos.`
      : `Panel de ${b.name}: conversaciones, prospectos y avisos.`;
  // El restaurante abre en Pedidos y la central de taxis en Viajes (pantalla de
  // despacho). El resto, en el Resumen.
  const startUrl = esResto ? "/admin/pedidos?tv=1" : esTaxis ? "/admin/viajes?tv=1" : "/admin/overview";
  return JSON.stringify({
    name: `${b.name} · Panel`,
    short_name: b.name,
    description,
    start_url: startUrl,
    scope: "/admin/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: b.themeColor,
    theme_color: b.themeColor,
    lang: env.BOT_LANGUAGE || "es",
    icons: [
      { src: "/admin/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
    ],
    shortcuts: esResto
      ? [
          { name: "Pedidos", url: "/admin/pedidos" },
          { name: "Menú", url: "/admin/menu" },
          { name: "Reportes", url: "/admin/reportes" },
        ]
      : esTaxis
        ? [
            { name: "Viajes", url: "/admin/viajes" },
            { name: "Cola", url: "/admin/cola" },
            { name: "Bases", url: "/admin/bases" },
            { name: "Reportes", url: "/admin/reportes" },
          ]
        : [
            { name: "Conversaciones", url: "/admin/conversations" },
            { name: "Prospectos", url: "/admin/leads" },
            { name: "Tickets", url: "/admin/tickets" },
          ],
  });
}

/**
 * Service worker. Estrategia: network-first para navegaciones dentro de
 * /admin/, con la última copia cacheada como respaldo offline. Los assets de
 * CDN (Tailwind, htmx, fuentes) son cross-origin y se dejan pasar sin cachear.
 * Incluye los handlers de push para la Fase 1.
 */
export function serviceWorker(t: T = makeT("es"), brandName = "Kooni"): string {
  return `/* Kooni PWA service worker — Fase 0 */
const CACHE = 'kooni-admin-v3'; // subir en cada rediseño para tirar la caché vieja

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith('/admin')) return;

  // Navegaciones (cargar una página): red primero, cache de respaldo.
  const isNav = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (isNav) {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh.ok) {
          const cache = await caches.open(CACHE);
          cache.put(req, fresh.clone());
        }
        return fresh;
      } catch (err) {
        const cached = await caches.match(req);
        if (cached) return cached;
        const home = await caches.match('/admin/overview');
        if (home) return home;
        return new Response(
          '<meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">' +
          '<body style="font-family:system-ui;background:#0f0e17;color:#ece9f5;padding:40px;text-align:center">' +
          '<h1 style="font-size:18px">${t("pwa.offline.title")}</h1>' +
          '<p style="opacity:.7;font-size:14px">${t("pwa.offline.body")}</p></body>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 },
        );
      }
    })());
    return;
  }

  // El resto (fragmentos htmx, JSON): red primero, sin respaldo — para no
  // servir datos viejos como si fueran actuales.
});

// ── Fase 1: notificaciones push ────────────────────────────────────────────
// El push llega SIN cuerpo (no ciframos el payload). Al recibirlo, pedimos el
// aviso más reciente a /admin/push/latest y lo mostramos.
self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let n = { title: ${JSON.stringify(brandName)}, body: '${t("pwa.push.body")}', url: '/admin/overview' };
    try {
      const r = await fetch('/admin/push/latest', { credentials: 'include' });
      if (r.ok) { const j = await r.json(); n = { title: j.title || n.title, body: j.body || n.body, url: j.url || n.url }; }
    } catch (_) {}
    return self.registration.showNotification(n.title, {
      body: n.body,
      icon: '/admin/icon.svg',
      badge: '/admin/icon.svg',
      tag: 'kooni',
      renotify: true,
      data: { url: n.url },
    });
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || '/admin/overview';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.includes('/admin') && 'focus' in c) { c.navigate(target); return c.focus(); }
    }
    return self.clients.openWindow(target);
  })());
});
`;
}

/** `<head>` del panel: enlaza el manifest, colores e íconos y registra el SW. */
export function pwaHeadTags(env: Env, t: T = makeT("es")): string {
  const b = brand(env);
  return `
  <link rel="manifest" href="/admin/manifest.webmanifest">
  <meta name="theme-color" content="${b.themeColor}">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="${b.name}">
  <link rel="icon" type="image/svg+xml" href="/admin/icon.svg">
  <link rel="apple-touch-icon" href="/admin/icon.svg">
  <script>
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('/admin/sw.js', { scope: '/admin/' }).catch(function (e) {
          console.warn('SW no registrado:', e);
        });
      });
    }

    // Botón "Instalar app". Android/desktop Chrome disparan beforeinstallprompt;
    // iOS Safari nunca lo hace → se muestra la instrucción manual. Se oculta si
    // ya está instalada (display-mode: standalone).
    (function () {
      var standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
      if (standalone) return;
      var deferred = null;
      var THEME = ${JSON.stringify(b.themeColor)}, ACCENT = ${JSON.stringify(b.accent)};

      function btn() {
        var el = document.getElementById('kooni-install');
        if (el) return el;
        el = document.createElement('button');
        el.id = 'kooni-install';
        el.type = 'button';
        el.textContent = '${t("pwa.installBtn")}';
        el.setAttribute('style',
          'position:fixed;right:14px;bottom:14px;z-index:9999;padding:10px 14px;' +
          'font:600 13px system-ui;border:1px solid ' + ACCENT + ';border-radius:10px;' +
          'background:' + THEME + ';color:' + ACCENT + ';cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.35)');
        el.addEventListener('click', onClick);
        document.body.appendChild(el);
        return el;
      }
      function hide() { var el = document.getElementById('kooni-install'); if (el) el.remove(); }

      function onClick() {
        if (deferred) {
          deferred.prompt();
          deferred.userChoice.finally(function () { deferred = null; hide(); });
          return;
        }
        var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
        alert(isIOS
          ? '${t("pwa.install.iOS")}'
          : '${t("pwa.install.other")}');
      }

      window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();
        deferred = e;
        btn();
      });
      window.addEventListener('appinstalled', hide);

      // iOS Safari: sin evento, mostramos el botón igual (la instrucción manual).
      if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone) {
        window.addEventListener('load', btn);
      }
    })();

    // Botón campana (avisos push). Aparece en el header (#kooni-push) solo si el
    // worker tiene VAPID configurado. Suscribe/desuscribe este dispositivo.
    (function () {
      function b64urlToU8(s) {
        var p = '='.repeat((4 - s.length % 4) % 4);
        var b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/'));
        var u = new Uint8Array(b.length);
        for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
        return u;
      }
      async function init() {
        var el = document.getElementById('kooni-push');
        if (!el || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
        var cfg;
        try { cfg = await (await fetch('/admin/push/config')).json(); } catch (_) { return; }
        if (!cfg || !cfg.configured || !cfg.publicKey) return;
        var reg = await navigator.serviceWorker.ready;
        var sub = await reg.pushManager.getSubscription();
        el.hidden = false;
        paint(el, !!sub);
        el.onclick = async function () {
          el.disabled = true;
          try {
            if (sub) {
              await fetch('/admin/push/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) });
              await sub.unsubscribe();
              sub = null;
            } else {
              var perm = await Notification.requestPermission();
              if (perm !== 'granted') { alert('${t("pwa.push.needPermission")}'); el.disabled = false; return; }
              sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToU8(cfg.publicKey) });
              var j = sub.toJSON();
              await fetch('/admin/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: j.endpoint, keys: j.keys }) });
              fetch('/admin/push/test', { method: 'POST' });
            }
            paint(el, !!sub);
          } catch (e) { console.warn('push:', e); alert('${t("pwa.push.changeError")}' + e.message); }
          el.disabled = false;
        };
      }
      function paint(el, on) {
        el.title = on ? '${t("pwa.push.on")}' : '${t("pwa.push.off")}';
        el.style.color = on ? (${JSON.stringify(b.accent)}) : 'var(--muted)';
        var i = el.querySelector('[data-lucide]');
        if (i) { i.setAttribute('data-lucide', on ? 'bell-ring' : 'bell'); if (window.lucide) window.lucide.createIcons(); }
      }
      window.addEventListener('load', function () { setTimeout(init, 300); });
    })();
  </script>`;
}
