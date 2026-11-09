// Dashboard shell: a fixed 248px sidebar (grouped navigation) + a live-status
// topbar, wrapping each tab's server-rendered body. Identidad Kooni (rediseño
// 2026): Sora + IBM Plex Mono, acento morado/fucsia, tema CLARO + OSCURO con
// toggle (data-theme en <html> + localStorage). Los tokens de color viven en
// CSS custom properties (GLOBAL_STYLE) y se mapean a nombres Tailwind.
// docs/IDENTIDAD-KOONI.md es el contrato de marca.
//
// The layout() API is unchanged: views keep their own activeTab id; the group,
// breadcrumb and page title are derived here.

import type { Env } from "../../env";
import { BOT_VERSION } from "../../version";
import { isProUnlocked, PRO_ONLY_TABS, isTabAllowed } from "../../config";
import { readOverlay } from "../../licenseSync";
import { getNiche } from "../../niches";
import { pwaHeadTags } from "../pwa";
import { panelI18n, makeT, type T } from "../i18n";
import type { NichePack } from "../../niches";

const UPGRADE_URL = "/admin/upgrade";

// Secciones del sidebar → sufijo de su clave i18n (`navSec.<sufijo>`).
const SECTION_NAMES: Record<string, string> = {
  Inicio: "inicio",
  Inbox: "inbox",
  "Mi Agente": "agente",
  Extras: "extras",
  "Análisis": "analisis",
};

interface Item {
  id: string;
  label: string;
  href: string;
  icon: string; // lucide icon name
}

interface Section {
  label: string;
  items: Item[];
  /** Si true, la sección se renderiza como acordeón (colapsada salvo activa). */
  collapsible?: boolean;
}

// Navigation model. The item ids + hrefs are load-bearing (views and tests
// depend on them) — do not rename them. Icons are lucide names.
const NAV: Section[] = [
  {
    label: "Inicio",
    items: [{ id: "overview", label: "Resumen", href: "/admin/overview", icon: "layout-dashboard" }],
  },
  {
    label: "Inbox",
    collapsible: true,
    items: [
      { id: "conversations", label: "Conversaciones", href: "/admin/conversations", icon: "messages-square" },
      { id: "comentarios", label: "Comentarios", href: "/admin/comentarios", icon: "message-circle" },
      { id: "contactos", label: "Contactos", href: "/admin/contactos", icon: "users" },
      { id: "bloqueados", label: "Bloqueados", href: "/admin/blocked", icon: "ban" },
      { id: "leads", label: "Leads", href: "/admin/leads", icon: "user-plus" },
      { id: "etiquetas", label: "Etiquetas", href: "/admin/etiquetas", icon: "tags" },
      { id: "tickets", label: "Tickets", href: "/admin/tickets", icon: "life-buoy" },
    ],
  },
  {
    label: "Mi Agente",
    items: [
      { id: "agente", label: "Flujo", href: "/admin/agente", icon: "workflow" },
      { id: "probar", label: "Probar el bot", href: "/admin/probar", icon: "flask-conical" },
      { id: "comandos", label: "Comandos", href: "/admin/comandos", icon: "terminal" },
      { id: "equipo", label: "Equipo", href: "/admin/equipo", icon: "users-round" },
      { id: "automatizaciones", label: "Automatizaciones", href: "/admin/automatizaciones", icon: "zap" },
      { id: "disparadores", label: "Disparadores", href: "/admin/disparadores", icon: "workflow" },
      { id: "kb", label: "Conocimiento", href: "/admin/kb", icon: "book-open" },
      { id: "recursos", label: "Galería", href: "/admin/recursos", icon: "images" },
      { id: "mejoras", label: "Mejoras", href: "/admin/mejoras", icon: "sparkles" },
      { id: "campanas", label: "Campañas", href: "/admin/campanas", icon: "megaphone" },
      { id: "conexiones", label: "Conexiones", href: "/admin/conexiones", icon: "plug-zap" },
      { id: "licencia", label: "Licencia", href: "/admin/licencia", icon: "key-round" },
      { id: "config", label: "Configuración", href: "/admin/config", icon: "sliders-horizontal" },
    ],
  },
  {
    label: "Extras",
    items: [{ id: "extras", label: "Habilidades", href: "/admin/extras", icon: "sparkles" }],
  },
  {
    label: "Análisis",
    items: [
      { id: "insights", label: "Insights", href: "/admin/insights", icon: "scan-eye" },
      { id: "laboratorio", label: "Laboratorio", href: "/admin/laboratorio", icon: "flask-conical" },
      { id: "stats", label: "Estadísticas", href: "/admin/stats", icon: "bar-chart-3" },
      { id: "scraping", label: "Scraping", href: "/admin/scraping", icon: "globe" },
      { id: "costs", label: "Costos", href: "/admin/costs", icon: "receipt" },
      { id: "auditoria", label: "Auditoría", href: "/admin/auditoria", icon: "history" },
    ],
  },
];

// <head> assets: anti-FOUC del tema, fuentes, Tailwind CDN + tokens, lucide, htmx.
// Identidad Kooni (docs/IDENTIDAD-KOONI.md): morado/fucsia, claro + oscuro.
const HEAD_ASSETS = `
  <script>
    // Fija el tema ANTES de pintar para no parpadear. localStorage → si no,
    // prefers-color-scheme. El toggle del header lo cambia después.
    (function(){
      try {
        var t = localStorage.getItem('kooni-theme');
        if (!t) t = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', t);
      } catch(e){ document.documentElement.setAttribute('data-theme','dark'); }
    })();
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/htmx.org@2.0.4"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: ["selector", '[data-theme="dark"]'],
      theme: {
        extend: {
          colors: {
            // Tailwind usa estos para clases utilitarias; los valores "vivos"
            // (claro/oscuro) están en las CSS custom properties de GLOBAL_STYLE.
            bg: "var(--bg)", panel: "var(--panel)", panel2: "var(--panel2)",
            raise: "var(--raise)", line: "var(--line)", linelit: "var(--linelit)",
            accent: { DEFAULT: "var(--accent)", soft: "var(--accent-soft)" },
            accent2: "var(--accent-2)",
            cream: "var(--cream)", muted: "var(--muted)", dim: "var(--dim)",
            ok: "var(--ok)", info: "var(--info)", bad: "var(--bad)", violet: "var(--violet)",
            warn: "var(--warn)", "on-accent": "var(--on-accent)",
          },
          borderRadius: {
            sm: "var(--r-sm)", md: "var(--r-md)", lg: "var(--r-lg)", xl: "var(--r-xl)",
          },
          fontFamily: {
            display: ["'Sora'", "ui-sans-serif", "system-ui", "sans-serif"],
            mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
          },
        },
      },
    };
  </script>
  <script src="https://unpkg.com/lucide@latest"></script>`;

// Global stylesheet: design tokens, base type/scroll, the reusable component
// classes from the mockups (buttons, rows, cards, chips, canvas nodes), the
// modal/toast/range classes existing views already depend on, and the scanline
// overlay. All motion collapses under prefers-reduced-motion.
const GLOBAL_STYLE = `
<style>
  /* ── Escala compartida (radios y espaciado) ──────────────────────────────── */
  :root{
    --r-sm:8px; --r-md:10px; --r-lg:12px; --r-xl:14px; --r-pill:999px;
    --sp-1:6px; --sp-2:10px; --sp-3:14px; --sp-4:22px;
    --font-display:'Sora',ui-sans-serif,system-ui,sans-serif;
    --font-mono:'IBM Plex Mono',ui-monospace,monospace;
  }
  /* ── Tema oscuro (default) — identidad Kooni: tinta con matiz violeta + fucsia ── */
  :root, :root[data-theme="dark"]{
    --bg:#0f0e17; --panel:#181624; --panel2:#221d33; --raise:#2f2745;
    --line:#332c48; --linelit:#463c63;
    --accent:#e05fd8; --accent-2:#a679f6; --accent-soft:rgba(224,95,216,.14);
    --on-accent:#170f1c;
    --cream:#ece9f5; --muted:#a49bbd; --dim:#726a8c;
    --ok:#34d399; --info:#6aa9fb; --bad:#fb7185; --violet:#a78bfa; --warn:#f0b34a;
    --ok-soft:rgba(52,211,153,.13); --bad-soft:rgba(251,113,133,.13); --warn-soft:rgba(240,179,74,.14);
    --shadow:0 8px 24px -8px rgba(0,0,0,.55);
    --border:#332c48; --border-lit:#463c63; --green:#34d399; --blue:#6aa9fb; --red:#fb7185; --danger:#fb7185;
  }
  /* ── Tema claro ── */
  :root[data-theme="light"]{
    --bg:#faf7fe; --panel:#ffffff; --panel2:#f4eefc; --raise:#ece2fa;
    --line:#e7ddf4; --linelit:#d3c4ec;
    --accent:#c31fce; --accent-2:#8b3ff0; --accent-soft:rgba(195,31,206,.09);
    --on-accent:#ffffff;
    --cream:#211c33; --muted:#5c5473; --dim:#8b83a3;
    --ok:#059669; --info:#2563eb; --bad:#e11d48; --violet:#7c3aed; --warn:#b45309;
    --ok-soft:rgba(5,150,105,.10); --bad-soft:rgba(225,29,72,.09); --warn-soft:rgba(180,83,9,.10);
    --shadow:0 10px 28px -12px rgba(80,40,120,.25);
    --border:#e7ddf4; --border-lit:#d3c4ec; --green:#059669; --blue:#2563eb; --red:#e11d48; --danger:#e11d48;
  }
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;background:var(--bg);color:var(--cream);
    font-family:'Sora',ui-sans-serif,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
  body{overflow-x:clip;max-width:100vw}
  .font-mono, code, pre, kbd{font-family:'IBM Plex Mono',ui-monospace,monospace}
  a{color:var(--accent);text-decoration:none}
  a:hover{color:var(--accent-2)}
  html{transition:background-color .2s ease}
  ::-webkit-scrollbar{width:10px;height:10px}
  ::-webkit-scrollbar-track{background:var(--bg)}
  ::-webkit-scrollbar-thumb{background:var(--linelit);border-radius:0}
  ::-webkit-scrollbar-thumb:hover{background:var(--accent)}
  input,textarea,select{font-family:inherit}
  input::placeholder,textarea::placeholder{color:var(--dim)}
  input[type="range"]{accent-color:var(--accent);height:4px}

  /* keyframes */
  @keyframes blink{0%,49%{opacity:1}50%,100%{opacity:0}}
  @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.82)}}
  @keyframes ring{0%{box-shadow:0 0 0 0 rgba(52,211,153,.5)}100%{box-shadow:0 0 0 8px rgba(52,211,153,0)}}
  @keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}
  @keyframes popIn{from{opacity:0;transform:scale(.94) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}
  @keyframes toastIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
  @keyframes toastOut{to{opacity:0;transform:translateY(8px);visibility:hidden}}

  /* sidebar nav */
  .navlink{border-radius:var(--r-sm)}
  .navlink:hover{background:var(--panel2);color:var(--cream)}
  .navlink:hover [data-lucide]{color:var(--accent)}

  /* entrada + botones (sombra suave, no brutalista) */
  .card{animation:rise .4s cubic-bezier(.16,1,.3,1) both}
  .bigbtn{transition:transform .12s ease,box-shadow .12s ease,filter .12s ease;border-radius:var(--r-md);box-shadow:var(--shadow)}
  .bigbtn:hover{transform:translateY(-1px);filter:brightness(1.05);box-shadow:0 12px 26px -10px var(--accent-soft)}
  .bigbtn:active{transform:translateY(0);filter:none}
  .ghostbtn{border-radius:var(--r-sm)}
  .ghostbtn:hover{border-color:var(--accent);color:var(--cream);background:var(--accent-soft)}
  .glow{text-shadow:0 0 24px var(--accent-soft)}

  /* list / table rows + interactive bits reused across views */
  .convrow:hover{background:var(--panel2)}
  .convrow:hover .arr{opacity:1;transform:translateX(0)}
  .leadrow:hover{background:var(--panel2)}
  .datarow:hover{background:var(--panel2)}
  .kbrow:hover{background:var(--panel2)}
  .kbrow:hover .kbedit{border-color:var(--accent);color:var(--accent)}
  .tkcard{transition:transform .12s ease,border-color .12s ease}
  .tkcard:hover{border-color:var(--linelit);transform:translateY(-1px)}
  .subtab{transition:all .12s ease;cursor:pointer}
  .subtab:hover{color:var(--cream)}
  .chip:hover{border-color:var(--accent);color:var(--accent)}
  .cfgcard{transition:all .12s ease;cursor:pointer}
  .cfgcard:hover{border-color:var(--linelit)}

  /* ── Primitivas compartidas (pulido 2026-09) ──────────────────────────────
     Estados vacíos, avisos, pills e íconos-botón: antes cada vista los armaba
     con estilos inline distintos. Son ADITIVAS: no renombran nada existente. */
  .pill{display:inline-flex;align-items:center;gap:4px;font-size:10px;letter-spacing:.03em;
    padding:2px 8px;border-radius:var(--r-pill);border:1px solid var(--line);color:var(--muted);white-space:nowrap}
  .pill-ok{color:var(--ok);border-color:var(--ok);background:var(--ok-soft)}
  .pill-warn{color:var(--warn);border-color:var(--warn);background:var(--warn-soft)}
  .pill-bad{color:var(--bad);border-color:var(--bad);background:var(--bad-soft)}
  .pill-accent{color:var(--accent);border-color:var(--accent);background:var(--accent-soft)}
  .pill-dim{color:var(--dim)}
  .alert{display:flex;align-items:flex-start;gap:8px;font-size:12px;line-height:1.45;
    padding:10px 12px;border-radius:var(--r-md);border:1px solid var(--line);background:var(--panel);color:var(--muted)}
  .alert [data-lucide]{flex:none;margin-top:1px}
  .alert-ok{border-color:var(--ok);background:var(--ok-soft);color:var(--ok)}
  .alert-warn{border-color:var(--warn);background:var(--warn-soft);color:var(--warn)}
  .alert-bad{border-color:var(--bad);background:var(--bad-soft);color:var(--bad)}
  .empty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:34px 18px;text-align:center;color:var(--dim);font-size:12.5px}
  .empty [data-lucide]{opacity:.6}
  .iconbtn{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;
    border:1px solid var(--line);border-radius:var(--r-sm);background:none;color:var(--muted);cursor:pointer;transition:all .12s ease}
  .iconbtn:hover{border-color:var(--accent);color:var(--accent);background:var(--accent-soft)}
  .iconbtn-ok:hover{border-color:var(--ok);color:var(--ok);background:var(--ok-soft)}
  .iconbtn-bad:hover{border-color:var(--bad);color:var(--bad);background:var(--bad-soft)}
  .tblwrap{overflow-x:auto;background:var(--panel);border:1px solid var(--line);border-radius:var(--r-lg)}
  .bar{transition:transform .5s cubic-bezier(.16,1,.3,1)}
  .bargrp:hover .bar{background:var(--accent) !important}

  /* flow-canvas node (mockup ".node") + the existing views' ".node-card" */
  .node{transition:transform .14s ease,border-color .14s ease,box-shadow .14s ease;cursor:pointer}
  .node:hover{transform:translateY(-2px);border-color:var(--accent);box-shadow:var(--shadow)}
  .node-card{transition:transform .15s ease,box-shadow .15s ease,border-color .15s ease}
  .node-card:hover{transform:translateY(-2px);border-color:var(--accent);box-shadow:var(--shadow)}

  /* modal + toast (class names kept from prior layout for existing views) */
  .modal-backdrop{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;
    padding:1rem;background:rgba(4,8,12,.7);animation:fadeIn .15s ease-out}
  .modal-card{background:var(--panel);border:1px solid var(--linelit);border-radius:var(--r-xl);box-shadow:0 24px 60px -12px rgba(0,0,0,.5);
    animation:popIn .18s cubic-bezier(.16,1,.3,1);transform-origin:center}
  .toast{background:var(--panel);border:1px solid var(--linelit);border-radius:var(--r-md);color:var(--cream);box-shadow:var(--shadow);
    animation:toastIn .25s cubic-bezier(.16,1,.3,1),toastOut .3s ease-in 2.4s forwards}

  /* app shell */
  .shell{min-height:100vh;display:grid;grid-template-columns:248px 1fr;background:var(--bg)}
  .sb{border-right:1px solid var(--line);background:var(--panel);display:flex;flex-direction:column;position:sticky;top:0;height:100vh}
  .sb-nav{padding:14px 12px;display:flex;flex-direction:column;gap:2px;flex:1;overflow-y:auto}
  .sb-sec{font-size:9.5px;letter-spacing:.24em;text-transform:uppercase;padding:14px 10px 6px}
  .live-pill{display:flex;align-items:center;gap:9px;background:var(--panel);border:1px solid var(--line);padding:8px 13px;border-radius:var(--r-pill)}

  /* shell: header, sidebar y áreas de contenido (estilos que antes iban inline) */
  .headerbar{position:sticky;top:0;z-index:30;background:var(--panel);border-bottom:1px solid var(--line);
    padding:14px 26px;display:flex;align-items:center;gap:14px}
  .main-area{padding:22px 26px;min-width:0}
  .crumb{font-size:10px;letter-spacing:.22em;color:var(--dim);text-transform:uppercase}
  .page-title{font-family:'Sora';font-weight:700;font-size:22px;margin:2px 0 0;letter-spacing:-.02em}
  .iconctl{flex:none;width:36px;height:36px;background:var(--panel2);border:1px solid var(--line);color:var(--muted);
    cursor:pointer;display:inline-flex;align-items:center;justify-content:center;border-radius:var(--r-sm)}
  .iconctl:hover{border-color:var(--accent);color:var(--cream)}
  .langsel{background:var(--panel2);border:1px solid var(--line);color:var(--muted);font-size:12px;
    padding:8px 10px;border-radius:var(--r-sm);cursor:pointer}
  .logoutlink{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;letter-spacing:.04em;
    color:var(--dim);border:1px solid var(--line);padding:7px 12px;border-radius:var(--r-sm);text-decoration:none}
  .logoutlink:hover{color:var(--cream);border-color:var(--accent)}
  .sb-brand{padding:20px 18px 16px;border-bottom:1px solid var(--line)}
  .brand-row{display:flex;align-items:center;gap:10px}
  .brand-mark{width:34px;height:34px;flex:none;border:1.5px solid var(--accent);display:flex;align-items:center;
    justify-content:center;background:var(--accent-soft);box-shadow:var(--shadow)}
  .brand-mark img{width:20px;height:20px;object-fit:contain}
  .brand-meta{line-height:1.05;min-width:0}
  .brand-name{font-family:'Sora';font-weight:700;font-size:15px;letter-spacing:-.02em;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .brand-sub{font-size:9.5px;letter-spacing:.22em;color:var(--dim);text-transform:uppercase}
  .sb-foot{padding:14px;border-top:1px solid var(--line)}
  .bot-card{display:flex;align-items:center;gap:10px;padding:8px;border:1px solid var(--line);border-radius:var(--r-sm)}
  .bot-avatar{width:30px;height:30px;flex:none;background:var(--raise);border:1px solid var(--linelit);
    display:flex;align-items:center;justify-content:center;color:var(--accent)}
  .bot-meta{line-height:1.2;overflow:hidden;min-width:0}
  .bot-title{font-size:12px;font-weight:600;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
  .bot-sub{font-size:10px;color:var(--dim)}
  .projsel{background:var(--panel2);color:var(--muted);border:1px solid var(--line);border-radius:var(--r-sm);
    padding:6px 10px;font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.04em;cursor:pointer}

  /* ── Primitivas de contenido (usar en vez de estilos ad-hoc) ──────────────── */
  .page-head{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;flex-wrap:wrap;margin:0 0 18px}
  .page-head h1,.page-head h2{margin:0}
  .page-head .sub{font-size:12px;color:var(--muted);margin-top:4px}
  .toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  .stat{background:var(--panel);border:1px solid var(--line);border-radius:var(--r-lg);padding:14px 16px}
  .stat .v{font-family:'IBM Plex Mono',monospace;font-size:22px;font-weight:600;line-height:1.1;color:var(--cream)}
  .stat .l{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--dim);margin-top:4px}
  .formrow{display:flex;flex-direction:column;gap:6px}
  .label{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--dim)}
  .input,.select{width:100%;background:var(--bg);border:1px solid var(--line);color:var(--cream);
    padding:9px 11px;border-radius:var(--r-sm);font-size:12.5px;outline:none}
  .input:focus,.select:focus{border-color:var(--accent)}
  .select{cursor:pointer}
  .tabs{display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid var(--line);padding-bottom:10px;margin-bottom:14px}
  .tab{font-size:12px;color:var(--muted);border:1px solid transparent;border-radius:var(--r-pill);padding:5px 12px;text-decoration:none}
  .tab:hover{color:var(--cream);background:var(--panel2)}
  .tab.active,.tab[aria-current="page"]{color:var(--accent);border-color:var(--accent);background:var(--accent-soft)}
  /* hamburguesa + fondo del drawer: solo se ven en móvil */
  .hburger{display:none}
  .nav-backdrop{display:none}

  @media (max-width:767px){
    /* Nav = cajón deslizable (off-canvas). El grid queda de una sola columna
       y la barra sale de flujo con position:fixed. */
    .shell{grid-template-columns:1fr}
    .sb{position:fixed;left:0;top:0;z-index:60;width:82vw;max-width:320px;height:100vh;height:100dvh;
      flex-direction:column;overflow-y:auto;transform:translateX(-100%);
      transition:transform .22s cubic-bezier(.16,1,.3,1);box-shadow:2px 0 24px rgba(0,0,0,.5)}
    .shell.nav-open .sb{transform:none}
    .shell.nav-open .nav-backdrop{display:block;position:fixed;inset:0;z-index:55;background:rgba(2,6,10,.6)}
    .hburger{display:inline-flex;align-items:center;justify-content:center;flex:none;
      width:40px;height:40px;background:var(--panel2);border:1px solid var(--line);color:var(--cream);cursor:pointer}
    .navlink{min-height:44px}
    /* iOS Safari hace zoom al enfocar inputs < 16px — evitarlo en móvil. */
    input:not([type="range"]):not([type="checkbox"]):not([type="radio"]),select,textarea{font-size:16px !important}
    main{padding:14px 12px !important}
    header .crumb{display:none}
    header h1{font-size:17px !important}
    header .live-pill{margin-left:auto;padding:8px}
    .live-pill span:last-child{display:none}
    .hide-mobile{display:none !important}
    /* Modales casi a pantalla completa, con scroll propio. */
    .modal-backdrop{padding:0 !important;align-items:flex-end !important}
    .modal-card{width:100% !important;max-width:100% !important;max-height:92dvh;overflow-y:auto;box-shadow:none !important}
    /* Cualquier <table> suelta que no quepa: scroll en vez de romper el layout. */
    main table{display:block;overflow-x:auto;-webkit-overflow-scrolling:touch;max-width:100%}
  }
  @media (prefers-reduced-motion:reduce){ .sb{transition:none} }

  /* contenedor de scroll horizontal para tablas/anchos que no caben en móvil */
  .xscroll{overflow-x:auto;-webkit-overflow-scrolling:touch}

  /* Bandeja: en móvil se ve UNA cosa a la vez — la lista, o el hilo (con
     "volver"). En escritorio, las dos columnas como siempre. */
  .inbox-back{display:none}
  @media (max-width:767px){
    .inbox[data-view="thread"] .inbox-list{display:none}
    .inbox[data-view="thread"] .inbox-filters{display:none}
    .inbox[data-view="list"] .inbox-pane{display:none}
    .inbox-grid{grid-template-columns:1fr !important;height:calc(100dvh - 128px) !important;min-height:0 !important}
    .inbox-filters{flex-wrap:nowrap !important;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:4px}
    .inbox-filters form{min-width:170px !important}
    .inbox-back{display:flex}
  }

  @media (prefers-reduced-motion:reduce){
    .card,.toast,.modal-backdrop,.modal-card{animation:none}
    .bigbtn,.ghostbtn,.convrow,.leadrow,.datarow,.kbrow,.tkcard,.subtab,.chip,.cfgcard,.node,.node-card,.bar,.navlink{transition:none}
    .bigbtn:hover,.node:hover,.node-card:hover,.tkcard:hover{transform:none}
    .animate-pulse,[style*="animation"]{animation:none !important}
  }
</style>`;

// Re-run lucide after every htmx swap (fragments bring fresh icons) and close
// any open modal with Escape.
const GLOBAL_SCRIPT = `
<script>
  function drawIcons(){ if (window.lucide) window.lucide.createIcons(); }
  document.addEventListener("DOMContentLoaded", drawIcons);
  // lucide's unpkg script may resolve after DOMContentLoaded — retry briefly.
  (function(){ var n=0; var t=setInterval(function(){ if(window.lucide){drawIcons();clearInterval(t);} if(++n>25) clearInterval(t); },120); })();
  document.body.addEventListener("htmx:afterSwap", drawIcons);
  document.body.addEventListener("htmx:oobAfterSwap", drawIcons);
  // Pausa del polling: no refresques el inbox mientras el usuario lee (o si la
  // pestaña está en segundo plano). htmx evalúa este filtro en cada tick de
  // 'every Ns[...]' y solo dispara la petición si devuelve true. En el hilo
  // (contenedor flex column-reverse) "al día" = scroll pegado al final, donde
  // scrollTop ≈ 0; leer historial lo aleja (positivo en Chrome, negativo en
  // Firefox), de ahí el Math.abs. Al volver al final, el siguiente tick se pone
  // al día solo.
  window.puedeRefrescar = function(id){
    if (document.hidden) return false;
    var el = document.getElementById(id);
    if (!el) return true;
    return Math.abs(el.scrollTop) < 40;
  };
  document.addEventListener("keydown", function(e){
    if (e.key === "Escape") {
      var root = document.getElementById("modal-root");
      if (root) root.innerHTML = "";
    }
  });
  // Cajón de navegación en móvil: hamburguesa abre, backdrop / link / Escape cierra.
  (function(){
    var shell = document.querySelector(".shell");
    if (!shell) return;
    function open(){ shell.classList.add("nav-open"); }
    function close(){ shell.classList.remove("nav-open"); }
    document.querySelectorAll("[data-nav-open]").forEach(function(b){ b.addEventListener("click", open); });
    document.querySelectorAll("[data-nav-close]").forEach(function(b){ b.addEventListener("click", close); });
    var sb = document.querySelector(".sb");
    if (sb) sb.addEventListener("click", function(e){ if (e.target.closest("a.navlink")) close(); });
    document.addEventListener("keydown", function(e){ if (e.key === "Escape") close(); });
  })();

  // Toggle de tema claro/oscuro. El tema inicial ya lo fijó el script del <head>.
  (function(){
    var btn = document.getElementById("kooni-theme");
    if (!btn) return;
    function paint(){
      var dark = document.documentElement.getAttribute("data-theme") !== "light";
      var i = btn.querySelector("[data-lucide]");
      if (i){ i.setAttribute("data-lucide", dark ? "moon-star" : "sun"); if (window.lucide) window.lucide.createIcons(); }
      btn.title = dark ? "Cambiar a tema claro" : "Cambiar a tema oscuro";
    }
    paint();
    btn.addEventListener("click", function(){
      var next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("kooni-theme", next); } catch(e){}
      paint();
    });
  })();

  // Acordeón del sidebar: secciones colapsables (Inbox).
  document.querySelectorAll("button[data-acc]").forEach(function(btn){
    btn.addEventListener("click", function(){
      var label = btn.getAttribute("data-acc");
      var body = document.querySelector('[data-acc-body="' + label + '"]');
      if (!body) return;
      var isOpen = body.style.display !== "none";
      body.style.display = isOpen ? "none" : "block";
      btn.setAttribute("aria-expanded", isOpen ? "false" : "true");
      var icon = btn.querySelector("[data-lucide]");
      if (icon) icon.style.transform = isOpen ? "" : "rotate(180deg)";
    });
  });

  // ── Insertar etiquetas/herramientas en el prompt manual (chips + "/") ──────
  // Delegación global: los chips llevan data-pt-insert y, al escribir "/" en un
  // textarea con menú (data-pt-menu), aparece el selector. Los datos de cada
  // textarea viven en window.__ptData[id] (los emite prompt-tokens.ts).
  (function(){
    window.__ptData = window.__ptData || {};
    var menu = null, menuTa = null, items = [], idx = 0;
    function esc(s){ return String(s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
    function menuFor(ta){ return document.querySelector('[data-pt-menu="' + ta.id + '"]'); }
    function hide(){ if (menu) menu.hidden = true; menu = null; menuTa = null; items = []; }
    function insert(ta, text){
      if (!ta) return;
      ta.focus();
      if (ta.setRangeText) { ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end'); }
      else {
        var s = ta.selectionStart, e = ta.selectionEnd;
        ta.value = ta.value.slice(0, s) + text + ta.value.slice(e);
        ta.selectionStart = ta.selectionEnd = s + text.length;
      }
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
    function paint(){
      var html = '';
      for (var i = 0; i < items.length; i++){
        html += '<button type="button" data-pt-pick="' + i + '" style="display:flex;flex-direction:column;gap:2px;' +
          'width:100%;text-align:left;border:none;border-bottom:1px solid var(--line);padding:7px 10px;cursor:pointer;' +
          'background:' + (i === idx ? 'var(--accent-soft)' : 'transparent') + '">' +
          '<span style="font-family:IBM Plex Mono,monospace;font-size:11px;color:var(--accent2)">' + esc(items[i].v) + '</span>' +
          '<span style="font-size:10.5px;color:var(--dim)">' + esc(items[i].d || '') + '</span>' +
          '</button>';
      }
      if (menu) menu.innerHTML = html;
    }
    function show(ta, query){
      menu = menuFor(ta);
      if (!menu) return;
      var q = (query || '').toLowerCase();
      var all = window.__ptData[ta.id] || [];
      items = [];
      for (var i = 0; i < all.length; i++){
        var it = all[i];
        if (!q || it.v.toLowerCase().indexOf(q) >= 0 || (it.d || '').toLowerCase().indexOf(q) >= 0) items.push(it);
      }
      if (!items.length){ hide(); return; }
      menuTa = ta; idx = 0; paint(); menu.hidden = false;
    }
    function pick(i){
      if (!menuTa || !items[i]) return;
      var ta = menuTa;
      var pos = ta.selectionStart;
      var m = /(^|\\s)\\/([^\\s/]*)$/.exec(ta.value.slice(0, pos));
      if (m) ta.setSelectionRange(pos - m[2].length - 1, pos);
      insert(ta, items[i].v + ' ');
      hide();
    }
    document.addEventListener('click', function(ev){
      var t = ev.target;
      if (!t || !t.closest) return;
      var c = t.closest('[data-pt-insert]');
      if (c){ insert(document.getElementById(c.getAttribute('data-pt-insert')), c.getAttribute('data-pt-token')); hide(); return; }
      var p = t.closest('[data-pt-pick]');
      if (p){ pick(parseInt(p.getAttribute('data-pt-pick'), 10)); return; }
      if (menu && !menu.hidden && !menu.contains(t)) hide();
    });
    document.addEventListener('input', function(ev){
      var ta = ev.target;
      if (!ta || ta.tagName !== 'TEXTAREA') return;
      var m = /(^|\\s)\\/([^\\s/]*)$/.exec(ta.value.slice(0, ta.selectionStart));
      if (m) show(ta, m[2]); else if (menuTa === ta) hide();
    });
    document.addEventListener('keydown', function(ev){
      if (!menu || menu.hidden || !menuTa) return;
      if (ev.key === 'ArrowDown'){ idx = (idx + 1) % items.length; paint(); ev.preventDefault(); }
      else if (ev.key === 'ArrowUp'){ idx = (idx - 1 + items.length) % items.length; paint(); ev.preventDefault(); }
      else if (ev.key === 'Enter' || ev.key === 'Tab'){ pick(idx); ev.preventDefault(); }
      else if (ev.key === 'Escape'){ hide(); ev.stopPropagation(); ev.preventDefault(); }
    }, true);
  })();
</script>`;

function navItem(item: Item, active: boolean, label = item.label): string {
  const base =
    "display:flex;align-items:center;gap:11px;padding:9px 10px;font-size:13px;";
  const style = active
    ? base + "color:var(--cream);background:var(--accent-soft);border-left:2px solid var(--accent);font-weight:600"
    : base + "color:var(--muted);border-left:2px solid transparent";
  const iconColor = active ? "var(--accent)" : "var(--dim)";
  return `<a href="${item.href}" class="navlink" style="${style}">
    <i data-lucide="${item.icon}" width="17" height="17" style="color:${iconColor}"></i> ${label}
  </a>`;
}

// Tier free: los tabs Pro se muestran bloqueados (candado + tag PRO) y llevan a
// la página de upgrade en vez de a la vista real. Se ven, pero invitan a subir.
function navItemLocked(item: Item, label = item.label, t: T = makeT("es")): string {
  const base =
    "display:flex;align-items:center;gap:11px;padding:9px 10px;font-size:13px;color:var(--dim);border-left:2px solid transparent";
  return `<a href="${UPGRADE_URL}" class="navlink" style="${base}" title="${t("chrome.proTab")}">
    <i data-lucide="lock" width="15" height="15" style="color:var(--dim)"></i> ${label}
    <span style="margin-left:auto;font-size:8.5px;letter-spacing:.14em;color:var(--accent2);border:1px solid var(--line);padding:1px 5px">PRO</span>
  </a>`;
}

// El pack de nicho re-etiqueta el item "leads" (ej. "Leads" → "Reservaciones").
// El id y el href NO cambian (son load-bearing); solo la etiqueta y el ícono.
function applyNiche(item: Item, niche: NichePack | null): Item {
  if (!niche || niche.id === "generico" || item.id !== "leads") return item;
  return { ...item, label: niche.navLabel, icon: niche.navIcon };
}

// Marca Kooni: glifo "K" de nodo de conversación + punto "en línea" (menta).
// SVG inline para no depender de lucide en el brand mark.
const K_MARK = `<svg width="18" height="18" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M11 23V9h2.5l5 7.5 5-7.5H26v14h-3V15l-4.5 6.8L13 15v8h-2z" fill="var(--accent)"/><circle cx="23" cy="9" r="2" fill="var(--accent-2)"/></svg>`;
// Marca blanca: si el nombre no es Kooni, usar la inicial como monograma para
// no mostrar la "K" de Kooni en el panel de otro cliente/revendedor.
function brandMark(name: string): string {
  const n = name.trim();
  if (!n || n.toLowerCase() === "kooni") return K_MARK;
  const letter = escLogin(n[0]!.toUpperCase());
  return `<svg width="18" height="18" viewBox="0 0 32 32" fill="none" aria-hidden="true"><text x="16" y="24" text-anchor="middle" font-family="Sora, sans-serif" font-size="21" font-weight="700" fill="var(--accent)">${letter}</text><circle cx="25" cy="8" r="2" fill="var(--accent-2)"/></svg>`;
}

// ── Marca blanca (revendedores) ──────────────────────────────────────────────
// El panel hereda la identidad de Kooni salvo que el instalador/revendedor
// defina vars BRAND_* (ver wrangler.toml y env.ts). Colores = CSS custom
// properties con override; nombre/logo van en la sidebar.
interface Brand {
  name: string; logo: string; primary: string; primarySoft: string; accent2: string;
  bg: string; panel: string; panel2: string; raise: string; line: string; linelit: string;
  text: string; muted: string; dim: string; onAccent: string; theme: string; violet: string;
}
function resolveBrand(env?: Env, overlayBrand?: Record<string, string>): Brand {
  // Precedencia: marca del backend (overlay que pone el super admin) > vars
  // BRAND_* de wrangler.toml > identidad Kooni de GLOBAL_STYLE. Sin nada, los
  // colores van vacíos y el panel usa la identidad Kooni por defecto.
  const o = overlayBrand ?? {};
  const pick = (k: string, envVal?: string) => (o[k] && String(o[k]).trim()) || envVal || "";
  return {
    name: pick("name", env?.BRAND_NAME) || "Kooni",
    logo: pick("logo_url", env?.BRAND_LOGO_URL),
    primary: pick("primary", env?.BRAND_PRIMARY),
    primarySoft: o["primary_soft"] || env?.BRAND_PRIMARY_SOFT || "",
    accent2: pick("accent2", env?.BRAND_ACCENT2),
    bg: pick("bg", env?.BRAND_BG),
    panel: pick("panel", env?.BRAND_PANEL),
    panel2: pick("panel2", env?.BRAND_PANEL2),
    raise: pick("raise", env?.BRAND_RAISE),
    line: pick("line", env?.BRAND_LINE),
    linelit: pick("linelit", env?.BRAND_LINELIT),
    text: pick("text", env?.BRAND_TEXT),
    muted: pick("muted", env?.BRAND_MUTED),
    dim: pick("dim", env?.BRAND_DIM),
    onAccent: pick("on_accent", env?.BRAND_ON_ACCENT),
    theme: pick("theme", env?.BRAND_THEME),
    violet: pick("violet", env?.BRAND_VIOLET),
  };
}
function brandOverrides(b: Brand): string {
  const v: string[] = [];
  // Superficies y neutrales. Si la marca define su propio esquema (bg/panel),
  // debe poder reemplazar TODA la escala; si no, quedan los grises violetas de
  // Kooni y el panel se ve "morado" aunque el acento sea otro.
  if (b.bg) v.push(`--bg:${b.bg}`);
  if (b.panel) v.push(`--panel:${b.panel}`);
  if (b.panel2) v.push(`--panel2:${b.panel2}`);
  if (b.raise) v.push(`--raise:${b.raise}`);
  if (b.line) { v.push(`--line:${b.line}`); v.push(`--border:${b.line}`); }
  if (b.linelit) { v.push(`--linelit:${b.linelit}`); v.push(`--border-lit:${b.linelit}`); }
  if (b.primary) {
    v.push(`--accent:${b.primary}`);
    // Sin un soft explícito, derivarlo del acento para que no quede el fucsia
    // de Kooni detrás de una marca de otro color.
    if (!b.primarySoft) v.push(`--accent-soft:color-mix(in srgb, ${b.primary} 14%, transparent)`);
  }
  if (b.accent2) v.push(`--accent-2:${b.accent2}`);
  if (b.primarySoft) v.push(`--accent-soft:${b.primarySoft}`);
  if (b.onAccent) v.push(`--on-accent:${b.onAccent}`);
  if (b.violet) v.push(`--violet:${b.violet}`);
  // Esquema oscuro de marca: la sombra del tema claro tiene matiz violeta.
  if (b.theme === "dark") v.push(`--shadow:0 8px 24px -8px rgba(0,0,0,.55)`);

  // Texto de marca: se aplica en AMBOS temas. Si el cliente define su propio
  // fondo oscuro, el tema claro ya no es claro; dejar el texto oscuro ahí lo
  // volvía ilegible (el bug del login de AUTONEX).
  if (b.text) v.push(`--cream:${b.text}`);
  if (b.muted) v.push(`--muted:${b.muted}`);
  if (b.dim) v.push(`--dim:${b.dim}`);

  // Si la marca NO redefine las superficies, en tema claro un acento claro
  // pierde contraste: derivar un tono más profundo. Con superficies propias
  // (bg/panel) el tema claro usa el mismo esquema de la marca.
  const light: string[] = [];
  if (!b.bg && !b.panel) {
    if (b.primary) light.push(`--accent:color-mix(in srgb, ${b.primary} 65%, #000)`);
    if (b.accent2) light.push(`--accent-2:color-mix(in srgb, ${b.accent2} 72%, #000)`);
  }

  const out: string[] = [];
  if (v.length) out.push(`:root,:root[data-theme]{${v.join(";")}}`);
  if (light.length) out.push(`:root[data-theme="light"]{${light.join(";")}}`);
  // Esquema único (ej. cliente oscuro): el toggle de tema no aplica.
  if (b.theme) {
    out.push(`:root{color-scheme:${b.theme}}`);
    out.push(`#kooni-theme{display:none!important}`);
  }
  return out.join("");
}

function sidebar(activeTab: string, locked: (id: string) => boolean, niche: NichePack | null, tierLabel: string, brand: Brand = { name: "Kooni", logo: "", primary: "", primarySoft: "", accent2: "", bg: "", panel: "", panel2: "", raise: "", line: "", linelit: "", text: "", muted: "", dim: "", onAccent: "", theme: "", violet: "" }, t: (k: string) => string = (k) => k): string {
  // Ítems extra que aporta el niche pack activo (packs "pesados", ver NicheHooks).
  // Se insertan en la sección que declaran (por su label): restaurante → Pedidos
  // en "Inbox", Menú en "Mi Agente", Reportes en "Análisis".
  const navExtra = niche?.hooks?.navExtra ?? [];
  const SECTION_KEY: Record<string, string> = {
    Inicio: "navSec.inicio",
    Inbox: "navSec.inbox",
    "Mi Agente": "navSec.agente",
    Extras: "navSec.extras",
    "Análisis": "navSec.analisis",
  };
  const sections = NAV.map((sec) => {
    const extraHere = navExtra.filter((e) => e.section === sec.label);
    const secItems = [...sec.items, ...extraHere.map((e) => ({ id: e.id, label: e.label, href: e.href, icon: e.icon }))];
    const hasActive = secItems.some((i) => i.id === activeTab);
    const labelColor = hasActive ? "var(--accent)" : "var(--dim)";
    const items = secItems
      .map((raw) => {
        const i = applyNiche(raw, niche);
        // El pack de nicho puede re-etiquetar (ej. leads → Reservaciones): si la
        // etiqueta cruda no es la del NAV, se respeta la del nicho.
        const label = i.label !== raw.label ? i.label : t(`nav.${i.id}`);
        return locked(i.id) ? navItemLocked(i, label, t) : navItem(i, i.id === activeTab, label);
      })
      .join("");

    // Sección colapsable (acordeón): el label es un botón que despliega los
    // items. Abierta si la sección tiene el tab activo o el usuario la abrió.
    if (sec.collapsible) {
      const open = hasActive ? "1" : "";
      const secLabel = t(SECTION_KEY[sec.label] ?? sec.label);
      return `<div class="sb-sec" style="color:${labelColor}">
        <button type="button" data-acc="${sec.label}" aria-expanded="${open ? "true" : "false"}"
          style="all:unset;cursor:pointer;display:flex;align-items:center;justify-content:space-between;width:100%;padding:9px 10px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:${labelColor}">
          ${secLabel}
          <i data-lucide="chevron-down" width="14" height="14" style="transition:transform .18s;${open ? "transform:rotate(180deg)" : ""}"></i>
        </button>
        <div class="acc-body" data-acc-body="${sec.label}" style="display:${open ? "block" : "none"}">${items}</div>
      </div>`;
    }

    return `<div class="sb-sec" style="color:${labelColor}">${t(SECTION_KEY[sec.label] ?? sec.label)}</div>${items}`;
  }).join("");

  return `<aside class="sb">
    <div class="sb-brand">
      <div class="brand-row">
        <div class="brand-mark">
          ${brand.logo ? `<img src="${brand.logo}" alt="">` : brandMark(brand.name)}
        </div>
        <div class="brand-meta">
          <div class="brand-name" title="${escLogin(brand.name)}">${brand.name}</div>
          <div class="brand-sub">Panel · ${tierLabel}</div>
        </div>
      </div>
    </div>
    <nav class="sb-nav">${sections}</nav>
    <div class="sb-foot">
      <div class="bot-card">
        <div class="bot-avatar">
          <i data-lucide="bot" width="16" height="16"></i>
        </div>
        <div class="bot-meta">
          <div class="bot-title">${t("chrome.panelBot")}</div>
          <div class="bot-sub">${t("chrome.session")} · v${escLogin(BOT_VERSION)}</div>
        </div>
      </div>
    </div>
  </aside>`;
}

export async function layout(opts: { title: string; activeTab: string; body: string; env?: Env }): Promise<string> {
  // Tabs Pro: se bloquean según su MÓDULO (licencia con modules, tier pro o
  // override del dueño). Sin env (ej. notFound) se asume todo abierto.
  const lockedTabs = new Set<string>();
  if (opts.env) {
    for (const t of PRO_ONLY_TABS) {
      if (!(await isTabAllowed(opts.env, t))) lockedTabs.add(t);
    }
  }
  const lockedSync = (id: string) => lockedTabs.has(id);
  const tierLabel = opts.env ? ((await isProUnlocked(opts.env)) ? "Pro" : "Free") : "Pro";
  const niche = opts.env ? getNiche(opts.env) : null;
  // Idioma del panel (es | en). Español por default: sin setting, todo igual que antes.
  const { lang, t } = await panelI18n(opts.env);
  const section = NAV.find((s) => s.items.some((i) => i.id === opts.activeTab)) ?? NAV[0];
  const sectionLabel = t(`navSec.${SECTION_NAMES[section.label] ?? ""}` as never) || section.label;
  const item = applyNiche(section.items.find((i) => i.id === opts.activeTab) ?? section.items[0], niche);
  const itemLabel = item.label !== section.items.find((i) => i.id === opts.activeTab)?.label ? item.label : t(`nav.${item.id}` as never);
  // Marca blanca: la del backend (overlay) manda sobre las vars BRAND_*.
  const brand = opts.env ? resolveBrand(opts.env, (await readOverlay(opts.env))?.brand) : resolveBrand();

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${opts.title}</title>
  ${HEAD_ASSETS}
  ${GLOBAL_STYLE}
  ${opts.env ? `<style>${brandOverrides(brand)}</style>` : ""}
  ${opts.env ? pwaHeadTags(opts.env) : ""}
</head>
<body>
  <div class="shell">
    ${sidebar(opts.activeTab, lockedSync, niche, tierLabel, brand, t as (k: string) => string)}
    <div class="nav-backdrop" data-nav-close></div>
    <div style="display:flex;flex-direction:column;min-width:0">
      <header class="headerbar">
        <button type="button" class="hburger" data-nav-open aria-label="${t("chrome.menu")}">
          <i data-lucide="menu" width="20" height="20"></i>
        </button>
        <div style="min-width:0">
          <div class="crumb">${sectionLabel} / ${itemLabel}</div>
          <h1 class="page-title">${itemLabel}</h1>
        </div>
        <div id="proj-switcher" class="hide-mobile" style="margin-left:auto"></div>
        <form method="POST" action="/admin/config/language" class="hide-mobile" style="flex:none">
          <select name="lang" onchange="this.form.submit()" class="langsel" aria-label="${t("chrome.lang")}" title="${t("chrome.langLabel")}">
            <option value="es" ${lang === "es" ? "selected" : ""}>🇲🇽 Español</option>
            <option value="en" ${lang === "en" ? "selected" : ""}>🇺🇸 English</option>
          </select>
        </form>
        <button type="button" id="kooni-theme" class="iconctl" title="${t("chrome.theme")}" aria-label="${t("chrome.theme")}">
          <i data-lucide="moon-star" width="16" height="16"></i>
        </button>
        <button type="button" id="kooni-push" class="iconctl" hidden title="${t("chrome.push")}">
          <i data-lucide="bell" width="16" height="16"></i>
        </button>
        <div class="live-pill">
          <span style="width:8px;height:8px;border-radius:50%;background:var(--ok);animation:pulse 1.8s ease-in-out infinite,ring 2s infinite"></span>
          <span style="font-size:11px;font-weight:600;letter-spacing:.04em">${t("chrome.online")}</span>
        </div>
        <a href="/admin/logout" title="${t("chrome.logoutTitle")}" class="hide-mobile logoutlink">${t("chrome.logout")}</a>
      </header>
      <main class="main-area">${opts.body}</main>
    </div>
  </div>
  <div id="modal-root"></div>
  <script>
  // Selector de proyectos: si esta instancia declara PEER_BOTS, el header
  // muestra un dropdown para brincar entre bots (cada uno con su panel).
  fetch('/admin/projects').then(function(r){ return r.ok ? r.json() : null }).then(function(d){
    if (!d || !d.peers || d.peers.length === 0) return;
    var el = document.getElementById('proj-switcher');
    if (!el) return;
    var opts = '<option selected>' + d.current.replace(/</g,'&lt;') + '</option>';
    d.peers.forEach(function(p){
      opts += '<option value="' + p.url.replace(/"/g,'&quot;') + '">' + p.name.replace(/</g,'&lt;') + '</option>';
    });
    // Las comillas simples van como &#39;: este bloque vive dentro de un
    // template literal, así que los \' del código fuente NO llegan al navegador
    // y cerraban la cadena JS de golpe (SyntaxError en cada carga del panel).
    // El parser de HTML las decodifica antes de que corran el onchange y el CSS.
    el.innerHTML = '<select class="projsel" onchange="if(this.value.indexOf(&#39;http&#39;)===0)window.location=this.value" ' +
      'title="${t("chrome.switchProject")}">' + opts + '</select>';
  }).catch(function(){});
  </script>
  <div id="toast-root" style="position:fixed;bottom:1rem;right:1rem;z-index:60"></div>
  ${GLOBAL_SCRIPT}
</body>
</html>`;
}

// Página de upgrade: se muestra cuando un panel free intenta abrir un tab Pro
// (o al hacer click en un item bloqueado). Vive dentro del layout para conservar
// el nav. `feature` es el nombre del tab que pidió (para personalizar el copy).
export async function renderUpgrade(env: Env, feature?: string): Promise<string> {
  const perks = [
    ["scan-eye", "Analista IA", "Resúmenes automáticos de cada conversación: qué querían, objeciones y oportunidad de venta."],
    ["bar-chart-3", "Estadísticas", "Métricas de volumen, retención y desempeño de tu bot en el tiempo."],
    ["receipt", "Costos", "Cuánto gasta tu bot en IA, con tope de presupuesto mensual."],
    ["sparkles", "Mejoras", "El bot detecta huecos en su conocimiento y se mejora solo (flywheel)."],
    ["megaphone", "Campañas", "Manda difusiones y seguimientos por WhatsApp a tus segmentos."],
  ]
    .map(
      ([icon, title, desc]) => `<div style="display:flex;gap:12px;padding:14px;border:1px solid var(--line);background:var(--panel)">
        <i data-lucide="${icon}" width="20" height="20" style="color:var(--accent);flex:none;margin-top:2px"></i>
        <div><div style="font-family:'Sora';font-weight:600;font-size:14px;margin-bottom:3px">${title}</div>
        <div style="font-size:12.5px;color:var(--muted);line-height:1.5">${desc}</div></div>
      </div>`,
    )
    .join("");

  const body = `
    <div class="card" style="max-width:720px">
      <div style="border:1px solid var(--linelit);background:var(--panel);box-shadow:var(--shadow);padding:28px">
        <div style="display:inline-flex;align-items:center;gap:8px;border:1px solid var(--accent);color:var(--accent2);font-size:10px;letter-spacing:.16em;padding:4px 10px;text-transform:uppercase">
          <i data-lucide="lock" width="13" height="13"></i> Función Pro
        </div>
        <h2 style="font-family:'Sora';font-weight:700;font-size:24px;letter-spacing:-.02em;margin:14px 0 6px">
          ${feature ? `“${feature}” es parte de Pro` : "Desbloquea el panel Pro"}
        </h2>
        <p style="font-size:13.5px;color:var(--muted);line-height:1.6;margin:0 0 20px;max-width:560px">
          Tu bot Starter ya atiende clientes, responde con tu conocimiento y captura leads.
          El panel <b style="color:var(--cream)">Pro</b> le suma el cerebro analítico y de crecimiento:
        </p>
        <div style="display:grid;gap:10px;margin-bottom:22px">${perks}</div>
        <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;border:1px solid var(--linelit);background:var(--panel2);font-size:12.5px;color:var(--muted)">
          <i data-lucide="settings" width="16" height="16" style="color:var(--accent);flex:none"></i>
          <span>Para activar Pro, pega tu código de licencia en <a href="/admin/licencia" style="color:var(--accent2);text-decoration:underline">Licencia</a> (te lo envía quien te vendió el bot).</span>
        </div>
      </div>
    </div>`;
  return layout({ title: "Pro", activeTab: "overview", body, env });
}

/**
 * Página de login del panel — dos columnas. Izquierda: marca (blanca-marca
 * respetada vía `resolveBrand`), tagline y versión del bot. Derecha: el
 * formulario (`POST /admin/login`, ver `routes.ts`; abre la sesión por cookie
 * de `auth.ts`). En mobile colapsa a una sola columna (mismo breakpoint que
 * usa el shell del panel).
 */
export function loginPage(opts: { error?: string; env?: Env; t?: T } = {}): string {
  const t = opts.t ?? makeT("es");
  const brand = resolveBrand(opts.env);
  const businessName = opts.env?.BUSINESS_NAME?.trim();

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Ingresar · ${brand.name}</title>
  ${HEAD_ASSETS}
  ${GLOBAL_STYLE}
  <style>${brandOverrides(brand)}</style>
  ${opts.env ? pwaHeadTags(opts.env) : ""}
  <style>
    .login-shell{min-height:100vh;display:grid;grid-template-columns:1fr 1fr}
    .login-brand{background:var(--panel);border-right:1px solid var(--line);display:flex;flex-direction:column;justify-content:center;padding:48px;position:relative;overflow:hidden}
    .login-brand::before{content:"";position:absolute;inset:0;background:
      linear-gradient(135deg,transparent 0%,var(--accent-soft) 100%);opacity:.5;pointer-events:none}
    .login-form-side{display:flex;align-items:center;justify-content:center;padding:32px}
    @media (max-width:900px){
      .login-shell{grid-template-columns:1fr}
      .login-brand{border-right:none;border-bottom:1px solid var(--line);padding:32px 24px}
    }
  </style>
</head>
<body>
  <div class="login-shell">
    <div class="login-brand">
      <div style="position:relative;display:flex;flex-direction:column;gap:18px;max-width:380px">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:44px;height:44px;flex:none;border:1.5px solid var(--accent);display:flex;align-items:center;justify-content:center;background:var(--accent-soft);box-shadow:var(--shadow)">
            ${brand.logo ? `<img src="${brand.logo}" alt="" style="width:26px;height:26px;object-fit:contain">` : brandMark(brand.name)}
          </div>
          <div style="font-family:'Sora';font-weight:700;font-size:24px;letter-spacing:-.02em">${brand.name}</div>
        </div>
        <p style="font-size:14px;color:var(--muted);line-height:1.6;margin:0">
          ${t("login.tagline")}
        </p>
        ${businessName ? `<div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim)">${t("login.panelOf")} <span style="color:var(--accent-2)">${escLogin(businessName)}</span></div>` : ""}
        <div style="font-size:10.5px;font-family:'IBM Plex Mono';color:var(--dim);letter-spacing:.04em">v${escLogin(BOT_VERSION)}</div>
      </div>
    </div>
    <div class="login-form-side">
      <form method="POST" action="/admin/login" style="background:var(--panel);border:1px solid var(--linelit);box-shadow:var(--shadow);padding:32px;max-width:360px;width:100%">
        <h1 style="font-family:'Sora';font-weight:700;font-size:18px;margin:0 0 4px;letter-spacing:-.02em">${t("login.title")}</h1>
        <p style="font-size:12px;color:var(--dim);margin:0 0 18px">${t("login.userLabel")} <span style="color:var(--muted)">admin</span></p>
        ${opts.error ? `<p style="color:var(--bad);font-size:12px;margin:0 0 12px">${escLogin(opts.error)}</p>` : ""}
        <input name="password" type="password" required autofocus placeholder="${t("login.passwordPlaceholder")}"
          style="width:100%;background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:10px 12px;font-size:13px;outline:none;margin-bottom:14px">
        <button class="bigbtn" type="submit"
          style="width:100%;background:var(--accent);border:1px solid var(--accent);color:var(--on-accent);box-shadow:var(--shadow);padding:11px;font-family:'Sora';font-weight:700;font-size:13px;cursor:pointer">
          ${t("login.submit")}
        </button>
      </form>
    </div>
  </div>
  ${GLOBAL_SCRIPT}
</body>
</html>`;
}

function escLogin(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}
