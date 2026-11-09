/**
 * Marca blanca (white-label) del panel: nombre, acento, color de texto y la
 * derivación del acento en tema claro. Se prueba a través de `loginPage()`
 * porque comparte `resolveBrand()` + `brandOverrides()` con el shell sin
 * necesitar D1.
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

describe("marca blanca del panel", () => {
  it("usa el nombre de marca en el título y la cabecera del login", () => {
    const html = loginPage({ env: branded });
    expect(html).toContain("<title>Ingresar · AUTONEX</title>");
    expect(html).toContain("AUTONEX");
  });

  it("aplica el acento y deriva el soft si no se especifica", () => {
    const html = loginPage({ env: branded });
    expect(html).toContain("--accent:#C9A052");
    expect(html).toContain("--accent-soft:color-mix(in srgb, #C9A052 14%, transparent)");
  });

  it("oscurece el acento en tema claro para conservar contraste", () => {
    const html = loginPage({ env: branded });
    expect(html).toContain(
      ':root[data-theme="light"]{--accent:color-mix(in srgb, #C9A052 65%, #000)}',
    );
  });

  it("aplica el texto de marca SOLO en tema oscuro", () => {
    const html = loginPage({ env: branded });
    expect(html).toContain(
      ':root[data-theme="dark"],:root:not([data-theme="light"]){--cream:#FFFFFF;--muted:#D4D4D8}',
    );
  });

  it("sin BRAND_* no emite overrides (identidad Kooni intacta)", () => {
    const html = loginPage({ env: {} as Env });
    expect(html).not.toContain("--cream:#FFFFFF");
    expect(html).not.toContain("--accent:#C9A052");
  });
});
