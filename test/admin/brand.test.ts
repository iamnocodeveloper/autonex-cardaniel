/**
 * Marca blanca (white-label) del panel: nombre, acento, texto y neutrales.
 * Se prueba a través de `loginPage()` porque comparte `resolveBrand()` +
 * `brandOverrides()` con el shell sin necesitar D1.
 */
import { describe, it, expect } from "vitest";
import { loginPage } from "../../src/admin/views/layout";
import type { Env } from "../../src/env";

const branded = {
  BRAND_NAME: "AUTONEX",
  BRAND_PRIMARY: "#C9A052",
  BRAND_TEXT: "#FFFFFF",
  BRAND_MUTED: "#D4D4D8",
} as unknown as Env;

const fullBrand = {
  ...branded,
  BRAND_DIM: "#A1A1AA",
  BRAND_BG: "#0D0D0F",
  BRAND_PANEL: "#17171A",
  BRAND_PANEL2: "#202024",
  BRAND_RAISE: "#2A2A2F",
  BRAND_LINE: "#2E2E34",
  BRAND_LINELIT: "#3D3D45",
  BRAND_ON_ACCENT: "#170F1C",
  BRAND_THEME: "dark",
  BRAND_VIOLET: "#E0B96A",
} as unknown as Env;

describe("marca blanca del panel", () => {
  it("usa el nombre de marca en el título y la cabecera del login", () => {
    const html = loginPage({ env: branded });
    expect(html).toContain("<title>Ingresar · AUTONEX</title>");
    expect(html).toContain("AUTONEX");
  });

  it("reemplaza la K de Kooni por el monograma de la marca", () => {
    const html = loginPage({ env: branded });
    expect(html).toContain(">A</text>");
  });

  it("aplica el acento y deriva el soft si no se especifica", () => {
    const html = loginPage({ env: branded });
    expect(html).toContain("--accent:#C9A052");
    expect(html).toContain("--accent-soft:color-mix(in srgb, #C9A052 14%, transparent)");
  });

  it("oscurece el acento en tema claro si la marca no redefine superficies", () => {
    const html = loginPage({ env: branded });
    expect(html).toContain(
      ':root[data-theme="light"]{--accent:color-mix(in srgb, #C9A052 65%, #000)}',
    );
  });

  it("aplica el texto de marca en AMBOS temas (legible sobre fondo propio)", () => {
    const html = loginPage({ env: branded });
    expect(html).toContain("--cream:#FFFFFF");
    expect(html).toContain("--muted:#D4D4D8");
    expect(html).not.toContain(':root[data-theme="dark"],:root:not([data-theme="light"])');
  });

  it("reemplaza todos los neutrales cuando la marca define su esquema", () => {
    const html = loginPage({ env: fullBrand });
    for (const pair of [
      "--bg:#0D0D0F",
      "--panel:#17171A",
      "--panel2:#202024",
      "--raise:#2A2A2F",
      "--line:#2E2E34",
      "--linelit:#3D3D45",
      "--dim:#A1A1AA",
      "--on-accent:#170F1C",
      "--violet:#E0B96A",
      "--shadow:0 8px 24px -8px rgba(0,0,0,.55)",
    ]) {
      expect(html).toContain(pair);
    }
    // Con superficies propias no se deriva el acento oscuro del tema claro.
    expect(html).not.toContain("--accent:color-mix");
  });

  it("un esquema único oculta el toggle de tema", () => {
    const html = loginPage({ env: fullBrand });
    expect(html).toContain("color-scheme:dark");
    expect(html).toContain("#kooni-theme{display:none!important}");
  });

  it("sin BRAND_* no emite overrides (identidad Kooni intacta)", () => {
    const html = loginPage({ env: {} as Env });
    expect(html).not.toContain("--cream:#FFFFFF");
    expect(html).not.toContain("--accent:#C9A052");
  });
});
