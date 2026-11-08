import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { zernioAdapter, parseZernioEvents, verifyZernioSignature, __resetZernioAccountsCache } from "../../src/channels/zernio";
import type { Env } from "../../src/env";

beforeEach(() => __resetZernioAccountsCache());

// Payloads espejo de la API pública de Zernio (github.com/zernio-dev/chat-sdk-adapter).
const dmPayload = {
  id: "evt_1",
  event: "message.received",
  timestamp: "2026-08-23T00:00:00Z",
  message: {
    id: "m_1",
    conversationId: "conv_1",
    platform: "instagram",
    direction: "incoming",
    text: "hola, quiero información",
    sender: { id: "usr_1", name: "María", username: "maria.g" },
    sentAt: "2026-08-23T00:00:00Z",
  },
  conversation: { id: "conv_1", participantName: "María", participantUsername: "maria.g" },
  account: { id: "acct_1", accountId: "acct_1", platform: "instagram", username: "mi_negocio" },
};

const commentPayload = {
  id: "evt_2",
  event: "comment.received",
  timestamp: "2026-08-23T00:00:00Z",
  comment: { id: "cm_1", postId: "post_1", platformPostId: "pp_1", text: "Claude por favor" },
  account: { id: "acct_1", accountId: "acct_1", platform: "instagram", username: "mi_negocio" },
};

const envBase = {
  ZERNIO_API_KEY: "zkey_test",
  ZERNIO_WEBHOOK_SECRET: "s3cret",
  ZERNIO_AUTO_DM_KEYWORD: "claude",
  ZERNIO_AUTO_DM_MESSAGE: "Aquí tienes el recurso 👇",
  ZERNIO_AUTO_DM_BUTTON_LABEL: "Abrir recurso",
  ZERNIO_AUTO_DM_BUTTON_URL: "https://kooni.app/recurso",
} as unknown as Env;

afterEach(() => vi.restoreAllMocks());

describe("verifyZernioSignature", () => {
  it("valida una firma HMAC-SHA256 correcta", async () => {
    // HMAC-SHA256("s3cret", body) en hex — generado con la misma función.
    const body = JSON.stringify(dmPayload);
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("s3cret"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
    const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
    expect(await verifyZernioSignature(body, hex, "s3cret")).toBe(true);
  });

  it("rechaza firma inválida y ausente", async () => {
    const body = JSON.stringify(dmPayload);
    expect(await verifyZernioSignature(body, "deadbeef", "s3cret")).toBe(false);
    expect(await verifyZernioSignature(body, undefined, "s3cret")).toBe(false);
  });
});

describe("parseZernioEvents (message.received)", () => {
  it("convierte un DM entrante en mensaje del agente", async () => {
    const [msg] = await parseZernioEvents(dmPayload, envBase);
    expect(msg.channel).toBe("zernio");
    expect(msg.channelUserId).toBe("acct_1:conv_1"); // accountId:conversationId para enviar después
    expect(msg.displayName).toBe("María");
    expect(msg.text).toBe("hola, quiero información");
  });

  it("marca los mensajes salientes como ownerEcho (respuesta del negocio desde la app nativa)", async () => {
    const [msg] = await parseZernioEvents(
      { ...dmPayload, message: { ...dmPayload.message, direction: "outgoing", text: "te confirmo por aquí" } },
      envBase,
    );
    expect(msg.ownerEcho).toBe(true);
    expect(msg.channelUserId).toBe("acct_1:conv_1");
    expect(msg.text).toBe("te confirmo por aquí");
  });

  it("descarta salientes sin texto y direcciones desconocidas", async () => {
    expect(
      await parseZernioEvents(
        { ...dmPayload, message: { ...dmPayload.message, direction: "outgoing", text: null } },
        envBase,
      ),
    ).toHaveLength(0);
    expect(
      await parseZernioEvents(
        { ...dmPayload, message: { ...dmPayload.message, direction: "system" } },
        envBase,
      ),
    ).toHaveLength(0);
  });

  // ── message.sent: es el evento con el que Zernio entrega TODO lo saliente ──
  // Sin esto el hilo del panel nunca mostraba lo enviado (ni lo del dueño desde
  // la app del celular ni lo de las automatizaciones).
  it("message.sent de la app del celular entra como eco de tipo owner", async () => {
    const [msg] = await parseZernioEvents(
      {
        event: "message.sent",
        message: {
          id: "m_out1",
          conversationId: "conv_1",
          platform: "instagram",
          direction: "outgoing",
          text: "te confirmo por aquí",
          sentVia: null, // enviado desde la app nativa
          sender: { id: "acct_1", name: "mi_negocio" },
        },
        conversation: { id: "conv_1", participantName: "María" },
        account: { id: "acct_1", accountId: "acct_1", platform: "instagram" },
      },
      envBase,
    );
    expect(msg.ownerEcho).toBe(true);
    expect(msg.echoRole).toBe("owner");
    expect(msg.text).toBe("te confirmo por aquí");
  });

  it("message.sent del bot/automatización entra como eco de tipo assistant (no pausa)", async () => {
    const [msg] = await parseZernioEvents(
      {
        event: "message.sent",
        message: {
          id: "m_out2",
          conversationId: "conv_1",
          platform: "instagram",
          direction: "outgoing",
          text: "¡Aquí lo tienes! 👇",
          sentVia: "comment_automation",
          sender: { id: "acct_1", name: "mi_negocio" },
        },
        conversation: { id: "conv_1", participantName: "María" },
        account: { id: "acct_1", accountId: "acct_1", platform: "instagram" },
      },
      envBase,
    );
    expect(msg.ownerEcho).toBe(true);
    expect(msg.echoRole).toBe("assistant");
  });

  it("message.sent con solo media (foto desde el celular) no se descarta", async () => {
    const [msg] = await parseZernioEvents(
      {
        event: "message.sent",
        message: {
          id: "m_out3",
          conversationId: "conv_1",
          platform: "instagram",
          direction: "outgoing",
          text: null,
          sentVia: null,
          attachments: [{ type: "image", url: "https://cdn.example/foto.jpg" }],
        },
        conversation: { id: "conv_1" },
        account: { id: "acct_1", accountId: "acct_1", platform: "instagram" },
      },
      envBase,
    );
    expect(msg.ownerEcho).toBe(true);
    expect(msg.imageUrl).toBe("https://cdn.example/foto.jpg");
  });
});

describe("auto-DM por keyword en comentarios", () => {
  it("manda DM privado (private-reply) con mensaje y botón cuando el comentario trae la keyword", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/v1/accounts")) {
        return new Response(JSON.stringify({ accounts: [{ _id: "acct_1", platform: "instagram", username: "mi_negocio" }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await parseZernioEvents(commentPayload, envBase);
    // El comentario no entra al agente:
    expect(out).toHaveLength(0);
    // accounts (resolución) + private-reply:
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe("https://zernio.com/api/v1/inbox/comments/post_1/cm_1/private-reply");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer zkey_test");
    const body = JSON.parse(init.body as string);
    expect(body.accountId).toBe("acct_1");
    expect(body.message).toBe("Aquí tienes el recurso 👇");
    expect(body.buttons).toEqual([{ type: "url", title: "Abrir recurso", url: "https://kooni.app/recurso" }]);
  });

  it("NO manda DM si la keyword no aparece", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await parseZernioEvents(
      { ...commentPayload, comment: { ...commentPayload.comment, text: "me interesa" } },
      envBase,
    );
    expect(out).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no hace nada sin ZERNIO_AUTO_DM_KEYWORD", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const envNoKw = { ...envBase, ZERNIO_AUTO_DM_KEYWORD: undefined } as unknown as Env;
    await parseZernioEvents(commentPayload, envNoKw);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("soporta VARIAS reglas con varios mensajes (ZERNIO_AUTO_DM_RULES) y responde también en público", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/v1/accounts")) {
        return new Response(JSON.stringify({ accounts: [{ _id: "acct_1", platform: "instagram", username: "mi_negocio" }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const envRules = {
      ...envBase,
      ZERNIO_AUTO_DM_KEYWORD: undefined,
      ZERNIO_AUTO_DM_RULES: JSON.stringify([
        {
          keywords: ["precio", "cuánto cuesta"],
          message: "Te mando el catálogo 👇",
          buttonLabel: "Ver catálogo",
          buttonUrl: "https://kooni.app/catalogo",
          replyToComment: "¡Gracias por preguntar! Te escribí por privado ✨",
        },
        { keywords: ["claude"], message: "Aquí tienes el recurso" },
      ]),
    } as unknown as Env;

    const out = await parseZernioEvents(
      { ...commentPayload, comment: { ...commentPayload.comment, text: "¿cuánto cuesta el diseño?" } },
      envRules,
    );
    expect(out).toHaveLength(0);
    // accounts + DM privado + respuesta pública:
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [dmUrl, dmInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(dmUrl).toBe("https://zernio.com/api/v1/inbox/comments/post_1/cm_1/private-reply");
    expect(JSON.parse(dmInit.body as string).message).toBe("Te mando el catálogo 👇");
    expect(JSON.parse(dmInit.body as string).buttons).toEqual([{ type: "url", title: "Ver catálogo", url: "https://kooni.app/catalogo" }]);
    const [pubUrl, pubInit] = fetchMock.mock.calls[2] as unknown as [string, RequestInit];
    expect(pubUrl).toBe("https://zernio.com/api/v1/inbox/comments/post_1");
    const pubBody = JSON.parse(pubInit.body as string);
    expect(pubBody.message).toBe("¡Gracias por preguntar! Te escribí por privado ✨");
    expect(pubBody.commentId).toBe("cm_1");
  });

  it("elige la regla correcta según la keyword del comentario", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/v1/accounts")) {
        return new Response(JSON.stringify({ accounts: [{ _id: "acct_1", platform: "instagram", username: "mi_negocio" }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const envRules = {
      ...envBase,
      ZERNIO_AUTO_DM_KEYWORD: undefined,
      ZERNIO_AUTO_DM_RULES: JSON.stringify([
        { keywords: ["precio"], message: "Catálogo de precios" },
        { keywords: ["claude"], message: "Aquí tienes el recurso" },
      ]),
    } as unknown as Env;

    await parseZernioEvents(
      { ...commentPayload, comment: { ...commentPayload.comment, text: "me interesa el precio" } },
      envRules,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const call = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    const body = JSON.parse(call[1].body as string);
    expect(body.message).toBe("Catálogo de precios");
  });

  it("usa el account social del inbox (no el id del webhook) al enviar private-reply", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/v1/accounts")) {
        return new Response(JSON.stringify({ accounts: [{ _id: "inbox_acct_99", platform: "instagram", username: "mi_negocio" }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await parseZernioEvents(commentPayload, envBase);
    const dm = fetchMock.mock.calls.find((c) => String((c as [string])[0]).includes("/private-reply"));
    expect(dm).toBeTruthy();
    const body = JSON.parse(((dm as unknown as [string, RequestInit])[1]).body as string);
    // El webhook trae account.id=acct_1, pero el id social real es inbox_acct_99.
    expect(body.accountId).toBe("inbox_acct_99");
  });

  it("NO responde 2 veces al mismo comentario si el webhook lo reenvía (dedup secuencial)", async () => {
    let pubPosts = 0;
    let dmPosts = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/v1/accounts")) {
        return new Response(JSON.stringify({ accounts: [{ _id: "acct_1", platform: "instagram", username: "mi_negocio" }] }), { status: 200 });
      }
      if (String(url).includes("/private-reply")) {
        dmPosts++;
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      if (/\/v1\/inbox\/comments\/post_1$/.test(String(url))) {
        pubPosts++;
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      ...envBase,
      ZERNIO_AUTO_DM_KEYWORD: undefined,
      ZERNIO_AUTO_DM_RULES: JSON.stringify([
        { keywords: ["precio"], message: "Te escribí por privado 👇", replyToComment: "¡Gracias por tu comentario! Mira tu privado ✨" },
      ]),
      DB: makeDbStub({}),
    } as unknown as Env;
    const payload = { ...commentPayload, comment: { ...commentPayload.comment, text: "me interesa el precio" } };

    await parseZernioEvents(payload, env);
    expect(pubPosts).toBe(1);
    expect(dmPosts).toBe(1);

    // Zernio reintenta el MISMO comentario → NO debe responder otra vez.
    await parseZernioEvents(payload, env);
    expect(pubPosts).toBe(1);
    expect(dmPosts).toBe(1);
  });

  it("NO responde 2 veces al mismo comentario aunque dos deliveries lleguen en paralelo (race)", async () => {
    let pubPosts = 0;
    let dmPosts = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/v1/accounts")) {
        return new Response(JSON.stringify({ accounts: [{ _id: "acct_1", platform: "instagram", username: "mi_negocio" }] }), { status: 200 });
      }
      if (String(url).includes("/private-reply")) {
        dmPosts++;
        await new Promise((r) => setTimeout(r, 15)); // ventana para que el otro delivery entre
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      if (/\/v1\/inbox\/comments\/post_1$/.test(String(url))) {
        pubPosts++;
        await new Promise((r) => setTimeout(r, 15));
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      ...envBase,
      ZERNIO_AUTO_DM_KEYWORD: undefined,
      ZERNIO_AUTO_DM_RULES: JSON.stringify([
        { keywords: ["precio"], message: "Te escribí por privado 👇", replyToComment: "¡Gracias por tu comentario! Mira tu privado ✨" },
      ]),
      DB: makeDbStub({}),
    } as unknown as Env;
    const payload = { ...commentPayload, comment: { ...commentPayload.comment, text: "me interesa el precio" } };

    // El claim atómico garantiza que solo UNO de los dos envíe.
    await Promise.all([parseZernioEvents(payload, env), parseZernioEvents(payload, env)]);
    expect(pubPosts).toBe(1);
    expect(dmPosts).toBe(1);
  });

  it("NO responde a un comentario de NUESTRA propia cuenta (anti-bucle de auto-respuesta)", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      ...envBase,
      ZERNIO_AUTO_DM_KEYWORD: undefined,
      ZERNIO_AUTO_DM_RULES: JSON.stringify([
        { keywords: ["kooni"], message: "Aquí tienes el recurso", replyToComment: "¡Gracias! Te escribí con la info de Kooni 👇" },
      ]),
      DB: makeDbStub({}),
    } as unknown as Env;

    // La respuesta pública del bot contiene la keyword ("Kooni") y Zernio la
    // reenvía como comment.received con autor = la propia cuenta → se ignora.
    const out = await parseZernioEvents(
      {
        ...commentPayload,
        comment: {
          id: "cm_999",
          postId: "post_1",
          text: "¡Gracias! Te escribí con la info de Kooni 👇",
          author: { id: "usr_own", username: "mi_negocio" },
        },
      },
      env,
    );
    expect(out).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("NO responde a comentarios que son respuestas (isReply) — anti-bucle", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      ...envBase,
      ZERNIO_AUTO_DM_KEYWORD: undefined,
      ZERNIO_AUTO_DM_RULES: JSON.stringify([
        { keywords: ["kooni"], message: "Aquí tienes el recurso" },
      ]),
      DB: makeDbStub({}),
    } as unknown as Env;

    const out = await parseZernioEvents(
      {
        ...commentPayload,
        comment: {
          id: "cm_reply_1",
          postId: "post_1",
          text: "me interesa kooni",
          isReply: true,
          parentCommentId: "cm_1",
        },
      },
      env,
    );
    expect(out).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("NO responde 2 veces si Zernio reentrega el MISMO comentario con distinto id (dedup por huella)", async () => {
    let pubPosts = 0;
    let dmPosts = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/v1/accounts")) {
        return new Response(JSON.stringify({ accounts: [{ _id: "acct_1", platform: "instagram", username: "mi_negocio" }] }), { status: 200 });
      }
      if (String(url).includes("/private-reply")) {
        dmPosts++;
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      if (/\/v1\/inbox\/comments\/post_1$/.test(String(url))) {
        pubPosts++;
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      ...envBase,
      ZERNIO_AUTO_DM_KEYWORD: undefined,
      ZERNIO_AUTO_DM_RULES: JSON.stringify([
        { keywords: ["precio"], message: "Te escribí por privado 👇", replyToComment: "¡Gracias por tu comentario! Mira tu privado ✨" },
      ]),
      DB: makeDbStub({}),
    } as unknown as Env;
    const base = {
      postId: "post_1",
      text: "me interesa el precio",
      author: { id: "usr_1", username: "maria.g" },
    };

    // Primera entrega: id cm_100
    await parseZernioEvents(
      { ...commentPayload, comment: { ...base, id: "cm_100" } },
      env,
    );
    expect(pubPosts).toBe(1);
    expect(dmPosts).toBe(1);

    // Zernio reentrega el MISMO comentario con OTRO id → NO debe responder otra vez.
    await parseZernioEvents(
      { ...commentPayload, comment: { ...base, id: "cm_777" } },
      env,
    );
    expect(pubPosts).toBe(1);
    expect(dmPosts).toBe(1);
  });

});

describe("comentarios sin automatización (fallback público)", () => {
  const noKwEnv = { ...envBase, ZERNIO_AUTO_DM_KEYWORD: undefined } as unknown as Env;
  const payload = {
    event: "comment.received",
    comment: { id: "cm_fb1", postId: "post_1", platformPostId: "pp_1", text: "qué lindo producto", author: { id: "usr_fb", username: "ana" } },
    account: { id: "acct_1", accountId: "acct_1", platform: "instagram", username: "mi_negocio" },
  };

  const postedAComment = (fm: ReturnType<typeof vi.fn>) =>
    (fm.mock.calls as unknown as [string, RequestInit][]).some(
      (c) => /\/v1\/inbox\/comments\//.test(String(c[0])),
    );

  it("APAGADO (default): un comentario sin regla NO recibe respuesta", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const env = { ...noKwEnv, DB: makeDbStub({}) } as unknown as Env;
    const out = await parseZernioEvents(payload, env);
    expect(out).toHaveLength(0);
    expect(postedAComment(fetchMock)).toBe(false);
  });

  it("ENCENDIDO: responde EN PÚBLICO (nunca DM) con el mensaje configurado", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/v1/accounts")) {
        return new Response(JSON.stringify({ accounts: [{ _id: "acct_1", platform: "instagram", username: "mi_negocio" }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      ...noKwEnv,
      DB: makeDbStub({}, {
        comment_fallback_enabled: "1",
        comment_fallback_message: "¡Gracias por tu comentario! 🙌",
      }),
    } as unknown as Env;

    const out = await parseZernioEvents(payload, env);
    expect(out).toHaveLength(0);
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    // Nunca DM:
    expect(calls.find((c) => String(c[0]).includes("/private-reply"))).toBeUndefined();
    // Respuesta pública con el texto configurado:
    const pub = calls.find((c) => /\/v1\/inbox\/comments\/post_1$/.test(String(c[0])));
    expect(pub).toBeTruthy();
    const body = JSON.parse(pub![1].body as string);
    expect(body.message).toBe("¡Gracias por tu comentario! 🙌");
    expect(body.commentId).toBe("cm_fb1");
  });

  it("ENCENDIDO pero sin mensaje: no responde", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const env = { ...noKwEnv, DB: makeDbStub({}, { comment_fallback_enabled: "1", comment_fallback_message: "  " }) } as unknown as Env;
    await parseZernioEvents(payload, env);
    expect(postedAComment(fetchMock)).toBe(false);
  });

  it("una regla con keyword sigue ganando sobre el fallback", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/v1/accounts")) {
        return new Response(JSON.stringify({ accounts: [{ _id: "acct_1", platform: "instagram", username: "mi_negocio" }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      ...envBase,
      DB: makeDbStub({}, { comment_fallback_enabled: "1", comment_fallback_message: "genérico" }),
    } as unknown as Env;
    // "claude" está en ZERNIO_AUTO_DM_KEYWORD (envBase) → gana la regla, DM.
    const out = await parseZernioEvents({ ...payload, comment: { ...payload.comment, text: "claude ayúdame" } }, env);
    expect(out).toHaveLength(0);
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const dm = calls.find((c) => String(c[0]).includes("/private-reply"));
    expect(dm).toBeTruthy();
    expect(JSON.parse(dm![1].body as string).message).toBe("Aquí tienes el recurso 👇");
  });
});

describe("zernioAdapter.sendReply", () => {
  it("envía los chunks a la conversación correcta", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, data: {} }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await zernioAdapter.sendReply(
      { channel: "zernio", channelUserId: "acct_1:conv_1", chunks: ["Hola", "¿Te ayudo?"], interChunkDelayMs: 0 },
      envBase,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/v1/inbox/conversations/conv_1/messages");
    const body = JSON.parse(init.body as string);
    expect(body.accountId).toBe("acct_1");
    expect(body.message).toBe("Hola");
  });

  it("lanza error sin ZERNIO_API_KEY", async () => {
    await expect(
      zernioAdapter.sendReply(
        { channel: "zernio", channelUserId: "acct_1:conv_1", chunks: ["x"] },
        {} as Env,
      ),
    ).rejects.toThrow("ZERNIO_API_KEY");
  });
});

// Stub mínimo de Db en memoria para AutoRulesRepo + DmLogsRepo.
function makeDbStub(rule: any, settings: Record<string, string> = {}) {
  const processed: any[] = [];
    const logs: any[] = [];
    const rates: any[] = [];
    const pending: any[] = [];
    const fingerprints: any[] = [];
    const self = {
      async run(sql: string, params: unknown[] = []) {
        if (/INSERT INTO comment_fingerprints/.test(sql)) {
          // Claim por huella: INSERT OR IGNORE sobre la PK dedup_key.
          const [dedupKey] = params as [string];
          if (!fingerprints.some((f) => f.dedup_key === dedupKey)) {
            fingerprints.push({ dedup_key: dedupKey, rule_id: params[1], comment_id: params[2], created_at: params[3] });
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        }
        if (/INSERT INTO processed_comments/.test(sql)) {
          if (/DO NOTHING/.test(sql)) {
            // claimLeg: INSERT OR IGNORE — crea la fila solo si no existe.
            if (!processed.some((p) => p.comment_id === params[0])) {
              processed.push({ comment_id: params[0], rule_id: params[1], status: params[2], dm_sent_at: null, public_reply_sent_at: null, created_at: params[3] });
            }
            return { meta: { changes: 1 } };
          }
          processed.push({ comment_id: params[0], status: params[2] });
          return { meta: { changes: 1 } };
        }
        // ── claimLeg / releaseClaim: UPDATE condicional atómico por pierna ──
        if (/UPDATE processed_comments SET (dm_sent_at|public_reply_sent_at) = \? WHERE comment_id = \? AND (dm_sent_at|public_reply_sent_at) IS NULL/.test(sql)) {
          const [at, commentId] = params as [number, string];
          const row = processed.find((p) => p.comment_id === commentId);
          const col = /SET dm_sent_at/.test(sql) ? "dm_sent_at" : "public_reply_sent_at";
          if (row && row[col] == null) { row[col] = at; return { meta: { changes: 1 } }; }
          return { meta: { changes: 0 } };
        }
        if (/UPDATE processed_comments SET (dm_sent_at|public_reply_sent_at) = NULL WHERE comment_id = \?/.test(sql)) {
          const [commentId, at] = params as [string, number];
          const row = processed.find((p) => p.comment_id === commentId);
          const col = /SET dm_sent_at/.test(sql) ? "dm_sent_at" : "public_reply_sent_at";
          if (row && row[col] === at) { row[col] = null; return { meta: { changes: 1 } }; }
          return { meta: { changes: 0 } };
        }
        if (/INSERT INTO follow_gate_pending/.test(sql)) {
          pending.push({ account_id: params[0], commenter_id: params[1], rule_id: params[2], comment_id: params[3], post_id: params[4] });
          return { meta: { changes: 1 } };
        }
        if (/DELETE FROM follow_gate_pending/.test(sql)) {
          const idx = pending.findIndex((p) => p.commenter_id === params[0]);
          if (idx >= 0) pending.splice(idx, 1);
          return { meta: { changes: 1 } };
        }
        if (/INSERT INTO dm_logs/.test(sql)) {
          logs.push({ id: params[0], status: params[7] });
          return { meta: { changes: 1 } };
        }
        if (/UPDATE dm_rate_limits/.test(sql)) {
          const [accountId, windowStart, max] = params as [string, number, number];
          const row = rates.find((r) => r.account_id === accountId && r.window_start === windowStart);
          if (row && row.count < max) { row.count += 1; return { meta: { changes: 1 } }; }
          return { meta: { changes: 0 } };
        }
        if (/INSERT INTO dm_rate_limits/.test(sql)) {
          const [accountId, windowStart] = params as [string, number];
          if (!rates.some((r) => r.account_id === accountId && r.window_start === windowStart)) {
            rates.push({ account_id: accountId, window_start: windowStart, count: 1 });
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        }
        return { meta: { changes: 0 } };
      },
      async first<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> {
        if (/SELECT COUNT\(\*\) as n FROM comments/.test(sql)) {
          // Tope diario de respuestas públicas: 0 por defecto en tests.
          return { n: 0 } as T;
        }
        if (/COUNT\(\*\) as n FROM processed_comments/.test(sql)) {
          const n = processed.filter((p) => p.comment_id === params[0] && p.status === "sent").length;
          return { n } as T;
        }
        if (/SELECT dm_sent_at, public_reply_sent_at FROM processed_comments/.test(sql)) {
          const row = processed.find((p) => p.comment_id === params[0]);
          return (row ? { dm_sent_at: row.dm_sent_at ?? null, public_reply_sent_at: row.public_reply_sent_at ?? null } : null) as T;
        }
        if (/SELECT count FROM dm_rate_limits/.test(sql)) {
          const row = rates.find((r) => r.account_id === params[0] && r.window_start === params[1]);
          return { count: row?.count ?? 0 } as T;
        }
        if (/SELECT rule_id, comment_id FROM follow_gate_pending/.test(sql)) {
          const p = pending.find((x) => x.commenter_id === params[0]);
          return (p ? { rule_id: p.rule_id, comment_id: p.comment_id } : null) as T;
        }
        if (/SELECT rule_id, comment_id, created_at FROM comment_fingerprints/.test(sql)) {
          const f = fingerprints.find((x) => x.dedup_key === params[0]);
          return (f ? { rule_id: f.rule_id, comment_id: f.comment_id, created_at: f.created_at } : null) as T;
        }
        if (/SELECT id FROM auto_rules[\s\S]*require_follow = 1/.test(sql)) {
          // Fallback del follow gate: la regla activa con require_follow.
          return (rule && rule.require_follow === 1 ? { id: rule.id } : null) as T;
        }
        if (/SELECT \* FROM auto_rules WHERE id = \?/.test(sql)) {
          return rule as T;
        }
        if (/SELECT value FROM settings WHERE key = \?/.test(sql)) {
          const v = settings[String(params[0])];
          return (v === undefined ? null : { value: v }) as T;
        }
        return null;
      },
      async all<T = unknown>(_sql: string, _params: unknown[] = []): Promise<T[]> {
        return (rule && rule.id ? [rule] : []) as T[];
      },
    };
    // Objeto D1 compatible: prepare() devuelve la cadena bind→run/first/all.
    // Db.all hace `res.results` — el stub debe devolver { results: [...] }.
    return {
      prepare(sql: string) {
        return {
          bind(...params: unknown[]) {
            return {
              run: () => self.run(sql, params),
              first: () => self.first(sql, params),
              all: () => self.all(sql, params).then((rows) => ({ results: rows })),
            };
          },
        };
      },
    } as unknown as D1Database;
}

describe("follow gate (require_follow)", () => {
  const fgRule = {
    id: "rule-fg",
    kind: "comment_dm",
    platform: "instagram",
    keywords: JSON.stringify(["link"]),
    message: "Aquí tienes el link:",
    button_label: "Abrir",
    button_url: "https://kooni.app/rec",
    reply_to_comment: null,
    is_active: 1,
    whole_word_match: 1,
    require_follow: 1,
    follow_prompt_message: "Hola {username}! Sígueme 👇",
    follow_button_label: "Ya te sigo",
    created_at: Date.now(),
    updated_at: Date.now(),
  };

  it("comment_reply: responde solo en público, sin DM privado", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/v1/accounts")) {
        return new Response(JSON.stringify({ accounts: [{ _id: "acct_1", platform: "instagram", username: "mi_negocio" }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      ...envBase,
      DB: makeDbStub({
        id: "rule_pub", kind: "comment_reply", platform: "instagram",
        keywords: JSON.stringify(["precio"]),
        message: "¡Gracias por tu comentario! Te escribo por privado con más info ✨",
        reply_to_comment: null, is_active: 1, whole_word_match: 1, require_follow: 0,
        button_label: null, button_url: null, ai_reply_prompt: null,
        follow_prompt_message: null, follow_button_label: null, created_at: Date.now(), updated_at: Date.now(),
      }),
    } as unknown as Env;
    await parseZernioEvents(
      { ...commentPayload, comment: { ...commentPayload.comment, text: "me interesa el precio" } },
      env,
    );
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const dm = calls.find((c) => String(c[0]).includes("/private-reply"));
    expect(dm).toBeUndefined(); // comment_reply NO manda DM
    const pub = calls.find((c) => /\/v1\/inbox\/comments\/post_1$/.test(String(c[0])));
    expect(pub).toBeTruthy(); // pero sí responde en público
  });

  it("comment_dm_public: responde en público Y envía DM privado", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/v1/accounts")) {
        // El id social del inbox difiere del accountId del webhook (el que publicó el post)
        return new Response(JSON.stringify({ accounts: [{ _id: "inbox_acct_99", platform: "instagram", username: "mi_negocio" }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      ...envBase,
      DB: makeDbStub({
        id: "rule_both", kind: "comment_dm_public", platform: "instagram",
        keywords: JSON.stringify(["precio"]),
        message: "Te escribí por privado con la info 👇",
        reply_to_comment: "¡Gracias por tu comentario! Mira tu privado ✨",
        is_active: 1, whole_word_match: 1, require_follow: 0,
        button_label: null, button_url: null, ai_reply_prompt: null,
        follow_prompt_message: null, follow_button_label: null, created_at: Date.now(), updated_at: Date.now(),
      }),
    } as unknown as Env;
    await parseZernioEvents(
      { ...commentPayload, comment: { ...commentPayload.comment, text: "me interesa el precio" } },
      env,
    );
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const dm = calls.find((c) => String(c[0]).includes("/private-reply"));
    expect(dm).toBeTruthy();
    const dmBody = JSON.parse(((dm as unknown as [string, RequestInit])[1]).body as string);
    expect(dmBody.message).toBe("Te escribí por privado con la info 👇");
    expect(dmBody.accountId).toBe("inbox_acct_99"); // el DM usa el inbox resuelto
    const pub = calls.find((c) => /\/v1\/inbox\/comments\/post_1$/.test(String(c[0])));
    expect(pub).toBeTruthy();
    const pubBody = JSON.parse(((pub as unknown as [string, RequestInit])[1]).body as string);
    expect(pubBody.message).toBe("¡Gracias por tu comentario! Mira tu privado ✨");
    expect(pubBody.accountId).toBe("acct_1"); // la respuesta pública usa la cuenta que publicó el post
  });

  it("si NO sigue: envía DM de follow gate con botón postback (no el link)", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/v1/accounts")) {
        return new Response(JSON.stringify({ accounts: [{ _id: "acct_1", platform: "instagram" }] }), { status: 200 });
      }
      if (String(url).includes("/follow-status/")) {
        return new Response(JSON.stringify({ isFollower: false }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      ZERNIO_API_KEY: "zkey_test",
      DB: makeDbStub(fgRule),
      DASHBOARD_BASE_URL: "https://kooni.app",
    } as unknown as Env;

    const out = await parseZernioEvents(
      {
        event: "comment.received",
        comment: { id: "cm_9", postId: "post_1", platformPostId: "pp_1", text: "me interesa el link", author: { id: "usr_9", username: "pepe" } },
        account: { id: "acct_1", accountId: "acct_1", platform: "instagram" },
      },
      env,
    );
    expect(out).toHaveLength(0);
    // accounts + follow-status + private-reply (con botón postback)
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(calls.length).toBe(3);
    const dmCall = calls[2];
    expect(String(dmCall[0])).toContain("/private-reply");
    const body = JSON.parse(dmCall[1].body as string);
    expect(body.message).toContain("Sígueme");
    expect(body.buttons[0].type).toBe("postback");
    expect(body.buttons[0].payload).toContain("followcheck:rule-fg");
  });

  it("si YA sigue: envía el link directamente", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/follow-status/")) {
        return new Response(JSON.stringify({ isFollower: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      ZERNIO_API_KEY: "zkey_test",
      DB: makeDbStub(fgRule),
      DASHBOARD_BASE_URL: "https://kooni.app",
    } as unknown as Env;

    await parseZernioEvents(
      {
        event: "comment.received",
        comment: { id: "cm_10", postId: "post_1", platformPostId: "pp_1", text: "me interesa el link", author: { id: "usr_10", username: "pepe" } },
        account: { id: "acct_1", accountId: "acct_1", platform: "instagram" },
      },
      env,
    );
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const dmCall = calls.find((c) => String(c[0]).includes("/private-reply"));
    expect(dmCall).toBeTruthy();
    const body = JSON.parse((dmCall![1] as RequestInit).body as string);
    expect(body.message).toBe("Aquí tienes el link:");
    expect(body.buttons[0].type).toBe("url");
  });

  it("postback followcheck: verifica follow y entrega el link", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/follow-status/")) {
        return new Response(JSON.stringify({ isFollower: true }), { status: 200 });
      }
      if (String(url).includes("/conversations/")) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      ZERNIO_API_KEY: "zkey_test",
      DB: makeDbStub(fgRule),
      DASHBOARD_BASE_URL: "https://kooni.app",
    } as unknown as Env;

    const out = await parseZernioEvents(
      {
        event: "message.received",
        message: { id: "m_1", conversationId: "conv_1", direction: "incoming", text: "followcheck:rule-fg:cm_9", sender: { id: "usr_9", name: "pepe" } },
        conversation: { id: "conv_1" },
        account: { id: "acct_1", accountId: "acct_1", platform: "instagram" },
      },
      env,
    );
    expect(out).toHaveLength(0); // no entra al agente
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    // follow-status + envío del link
    const sendCall = calls.find((c) => String(c[0]).includes("/conversations/"));
    expect(sendCall).toBeTruthy();
    const body = JSON.parse((sendCall![1] as RequestInit).body as string);
    expect(body.message).toBe("Aquí tienes el link:");
  });

  it("postback 'Ya te sigo' (platformMessageId postback_) completa el follow gate", async () => {
    let followStatusCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/follow-status/")) {
        followStatusCalls++;
        // 1ª llamada (comentario): no sigue → follow gate DM · 2ª (postback): ya sigue → entrega link
        return new Response(JSON.stringify({ isFollower: followStatusCalls > 1 }), { status: 200 });
      }
      if (String(url).includes("/v1/accounts")) {
        return new Response(JSON.stringify({ accounts: [{ _id: "acct_1", platform: "instagram", username: "mi_negocio" }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      ZERNIO_API_KEY: "zkey_test",
      DB: makeDbStub(fgRule),
      DASHBOARD_BASE_URL: "https://kooni.app",
    } as unknown as Env;

    // 1) comentario → no sigue → DM de follow gate con botón (guarda pendiente)
    await parseZernioEvents(
      {
        event: "comment.received",
        comment: { id: "cm_fg", postId: "post_1", platformPostId: "pp_1", text: "quiero el link", author: { id: "usr_fg", username: "pepe" } },
        account: { id: "acct_1", accountId: "acct_1", platform: "instagram", username: "mi_negocio" },
      },
      env,
    );

    // 2) el usuario toca "Ya te sigo": Zernio manda la ETIQUETA como texto y
    //    prefijo postback_ en platformMessageId (el payload NO viaja).
    const out = await parseZernioEvents(
      {
        event: "message.received",
        message: {
          id: "m_pb", conversationId: "conv_fg", platform: "instagram", direction: "incoming",
          text: "Ya te sigo", platformMessageId: "postback_1787887131308_1795756625172551",
          sender: { id: "usr_fg", name: "pepe" },
        },
        conversation: { id: "conv_fg" },
        account: { id: "acct_1", accountId: "acct_1", platform: "instagram" },
      },
      env,
    );
    expect(out).toHaveLength(0); // no entra al agente
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    // el bot debe entregar el link en la conversación del postback
    const sendCall = calls.find((c) => String(c[0]).includes("/conversations/conv_fg/messages"));
    expect(sendCall).toBeTruthy();
    const body = JSON.parse((sendCall![1] as RequestInit).body as string);
    expect(body.message).toBe("Aquí tienes el link:");
  });

  // ── Confirmación del follow gate (formato REAL del webhook de Zernio) ─────
  // El tap de un botón llega en `message.metadata.postbackPayload`, con
  // `message.text` vacío. Antes el código solo miraba `text` + el prefijo de
  // platformMessageId, así que en producción el "Ya te sigo" nunca se atendía.
  it("postback real (metadata.postbackPayload, text vacío): si ya sigue, entrega el recurso", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/follow-status/")) {
        return new Response(JSON.stringify({ isFollower: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      ZERNIO_API_KEY: "zkey_test",
      DB: makeDbStub(fgRule),
      DASHBOARD_BASE_URL: "https://kooni.app",
    } as unknown as Env;

    const out = await parseZernioEvents(
      {
        event: "message.received",
        message: {
          id: "m_pb2",
          conversationId: "conv_pb2",
          platform: "instagram",
          direction: "incoming",
          text: null,
          sender: { id: "usr_fg", name: "pepe" },
          metadata: { postbackPayload: "followcheck:rule-fg:cm_9", postbackTitle: "Ya te sigo" },
        },
        conversation: { id: "conv_pb2" },
        account: { id: "acct_1", accountId: "acct_1", platform: "instagram" },
      },
      env,
    );
    expect(out).toHaveLength(0); // no entra al agente
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    // Verificación con refresco (salta la caché de Zernio).
    const followCall = calls.find((c) => String(c[0]).includes("/follow-status/"));
    expect(followCall).toBeTruthy();
    expect(String(followCall![0])).toContain("refresh=true");
    // Y entrega el mensaje con el link.
    const sendCall = calls.find((c) => String(c[0]).includes("/conversations/conv_pb2/messages"));
    expect(sendCall).toBeTruthy();
    const body = JSON.parse((sendCall![1] as RequestInit).body as string);
    expect(body.message).toBe("Aquí tienes el link:");
  });

  it("postback real: si NO sigue todavía, avisa y deja el botón para reintentar", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/follow-status/")) {
        return new Response(JSON.stringify({ isFollower: false }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      ZERNIO_API_KEY: "zkey_test",
      DB: makeDbStub(fgRule),
      DASHBOARD_BASE_URL: "https://kooni.app",
    } as unknown as Env;

    await parseZernioEvents(
      {
        event: "message.received",
        message: {
          id: "m_pb3",
          conversationId: "conv_pb3",
          platform: "instagram",
          direction: "incoming",
          text: null,
          sender: { id: "usr_no", name: "pepe" },
          metadata: { postbackPayload: "followcheck:rule-fg:cm_9", postbackTitle: "Ya te sigo" },
        },
        conversation: { id: "conv_pb3" },
        account: { id: "acct_1", accountId: "acct_1", platform: "instagram" },
      },
      env,
    );
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const sendCall = calls.find((c) => String(c[0]).includes("/conversations/conv_pb3/messages"));
    expect(sendCall).toBeTruthy();
    const body = JSON.parse((sendCall![1] as RequestInit).body as string);
    // NO se entrega el link: se le dice que todavía no se le ve como seguidor.
    expect(body.message).not.toBe("Aquí tienes el link:");
    expect(body.message).toContain("no me apareces como seguidor");
    expect(body.message).toContain("toca el botón otra vez");
    // Y se le deja el botón de confirmación para reintentar.
    expect(body.buttons[0].type).toBe("postback");
    expect(body.buttons[0].payload).toContain("followcheck:rule-fg");
  });

  it("postback real: si el follow no se puede verificar, pide reintentar en vez de entregar", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/follow-status/")) {
        // consent_required: un comentarista que nunca ha escrito.
        return new Response(
          JSON.stringify({ isFollower: null, unavailableReason: "consent_required" }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      ZERNIO_API_KEY: "zkey_test",
      DB: makeDbStub(fgRule),
      DASHBOARD_BASE_URL: "https://kooni.app",
    } as unknown as Env;

    await parseZernioEvents(
      {
        event: "message.received",
        message: {
          id: "m_pb4",
          conversationId: "conv_pb4",
          platform: "instagram",
          direction: "incoming",
          text: null,
          sender: { id: "usr_unk", name: "pepe" },
          metadata: { postbackPayload: "followcheck:rule-fg:cm_9", postbackTitle: "Ya te sigo" },
        },
        conversation: { id: "conv_pb4" },
        account: { id: "acct_1", accountId: "acct_1", platform: "instagram" },
      },
      env,
    );
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const sendCall = calls.find((c) => String(c[0]).includes("/conversations/conv_pb4/messages"));
    expect(sendCall).toBeTruthy();
    const body = JSON.parse((sendCall![1] as RequestInit).body as string);
    expect(body.message).not.toBe("Aquí tienes el link:");
    expect(body.message).toContain("vuelve a tocar el botón");
    expect(body.buttons[0].type).toBe("postback");
  });

  it("un postback que NO es de follow (ej. 'Agendar') no dispara el follow gate", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      ZERNIO_API_KEY: "zkey_test",
      DB: makeDbStub(fgRule),
      DASHBOARD_BASE_URL: "https://kooni.app",
    } as unknown as Env;

    await parseZernioEvents(
      {
        event: "message.received",
        message: {
          id: "m_other",
          conversationId: "conv_other",
          platform: "instagram",
          direction: "incoming",
          text: null,
          sender: { id: "usr_fg", name: "pepe" },
          metadata: { postbackPayload: "agendar", postbackTitle: "Agendar" },
        },
        conversation: { id: "conv_other" },
        account: { id: "acct_1", accountId: "acct_1", platform: "instagram" },
      },
      env,
    );
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    // No consulta follow-status ni entrega nada por el follow gate.
    expect(calls.find((c) => String(c[0]).includes("/follow-status/"))).toBeUndefined();
    expect(calls.find((c) => String(c[0]).includes("/conversations/conv_other/messages"))).toBeUndefined();
  });

  it("tap 'Ya te sigo' SIN pendiente guardado: igual verifica y entrega el recurso", async () => {
    // Caso real: el pendiente se pierde (deploy a mitad, INSERT fallido). Antes
    // el tap se descartaba en silencio y el usuario nunca recibía el link.
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/follow-status/")) {
        return new Response(JSON.stringify({ isFollower: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      ZERNIO_API_KEY: "zkey_test",
      DB: makeDbStub(fgRule), // sin follow_gate_pending
      DASHBOARD_BASE_URL: "https://kooni.app",
    } as unknown as Env;

    await parseZernioEvents(
      {
        event: "message.received",
        message: {
          id: "m_fb",
          conversationId: "conv_fb",
          platform: "instagram",
          direction: "incoming",
          text: "ya te sigo",
          sender: { id: "usr_lost", name: "pepe" },
        },
        conversation: { id: "conv_fb" },
        account: { id: "acct_1", accountId: "acct_1", platform: "instagram" },
      },
      env,
    );

    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const sendCall = calls.find((c) => String(c[0]).includes("/conversations/conv_fb/messages"));
    expect(sendCall).toBeTruthy();
    const body = JSON.parse((sendCall![1] as RequestInit).body as string);
    expect(body.message).toBe("Aquí tienes el link:");
  });
});

// ── Dedup por huella: una pata pendiente NO debe bloquear la reentrega ──────
// Caso real reportado: la regla era comentario→DM+público; la primera entrega
// mandó el follow prompt y la pública falló. Zernio reenvió el comentario y el
// panel mostró "SKIPPED · Deduplicado por huella" — la respuesta pública al
// comentario nunca se envió.
describe("huella: reentrega con la respuesta pública pendiente", () => {
  const ruleBoth = {
    id: "rule_both2",
    kind: "comment_dm_public",
    platform: "instagram",
    keywords: JSON.stringify(["mailflare"]),
    message: "¡Aquí lo tienes! 👇 Mailflare",
    button_label: "Abrir",
    button_url: "https://github.com/hieunc229/mailflare",
    reply_to_comment: "¡Te lo mandé por privado! ✨",
    is_active: 1,
    whole_word_match: 1,
    require_follow: 0,
    follow_prompt_message: null,
    follow_button_label: null,
    ai_reply_prompt: null,
    created_at: Date.now(),
    updated_at: Date.now(),
  };

  it("la primera entrega manda DM y pública; la segunda se deduplica", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/v1/accounts")) {
        return new Response(
          JSON.stringify({ accounts: [{ _id: "acct_1", platform: "instagram", username: "mi_negocio" }] }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      ZERNIO_API_KEY: "zkey_test",
      DB: makeDbStub(ruleBoth),
      DASHBOARD_BASE_URL: "https://kooni.app",
    } as unknown as Env;

    const payload = {
      event: "comment.received",
      comment: {
        id: "cm_mf1",
        postId: "post_1",
        platformPostId: "pp_1",
        text: "quiero mailflare",
        author: { id: "usr_mf", username: "raulcubillosmexico" },
      },
      account: { id: "acct_1", accountId: "acct_1", platform: "instagram", username: "mi_negocio" },
    };

    await parseZernioEvents(payload, env);

    // 1) DM privado y 2) respuesta pública, ambas enviadas.
    let calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(calls.find((c) => String(c[0]).includes("/private-reply"))).toBeTruthy();
    expect(calls.find((c) => /\/v1\/inbox\/comments\/post_1$/.test(String(c[0])))).toBeTruthy();

    // Reentrega con OTRO id y el mismo texto → no debe volver a responder.
    const before = calls.length;
    await parseZernioEvents(
      { ...payload, comment: { ...payload.comment, id: "cm_mf1_dup" } },
      env,
    );
    calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const after = calls.slice(before);
    expect(after.find((c) => String(c[0]).includes("/private-reply"))).toBeUndefined();
    expect(after.find((c) => /\/v1\/inbox\/comments\/post_1$/.test(String(c[0])))).toBeUndefined();
  });

  it("si la pública quedó pendiente, la reentrega SÍ la envía", async () => {
    // La pública falla la primera vez y funciona en el reintento.
    let publicAttempts = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/v1/accounts")) {
        return new Response(
          JSON.stringify({ accounts: [{ _id: "acct_1", platform: "instagram", username: "mi_negocio" }] }),
          { status: 200 },
        );
      }
      if (/\/v1\/inbox\/comments\/post_1$/.test(String(url))) {
        publicAttempts++;
        if (publicAttempts === 1) return new Response("boom", { status: 500 });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      ZERNIO_API_KEY: "zkey_test",
      DB: makeDbStub(ruleBoth),
      DASHBOARD_BASE_URL: "https://kooni.app",
    } as unknown as Env;

    const payload = {
      event: "comment.received",
      comment: {
        id: "cm_pend",
        postId: "post_1",
        platformPostId: "pp_1",
        text: "quiero mailflare",
        author: { id: "usr_pend", username: "techpaw" },
      },
      account: { id: "acct_1", accountId: "acct_1", platform: "instagram", username: "mi_negocio" },
    };

    // 1.ª entrega: DM sí, pública falla (500).
    await parseZernioEvents(payload, env);
    expect(publicAttempts).toBe(1);

    // Reentrega del MISMO comentario con otro id → la pública se reintenta.
    await parseZernioEvents(
      { ...payload, comment: { ...payload.comment, id: "cm_pend_dup" } },
      env,
    );
    expect(publicAttempts).toBe(2);
  });
});
