// "Automatizaciones" tab — flujos keyword → respuesta (comentarios y DMs).
// El dueño crea reglas SIN tocar código: cuando un comentario o DM matchea una
// keyword, la regla gana (DM automático, respuesta pública, o ambas) y el
// mensaje no entra al agente. Viven en D1 (tabla auto_rules).
import type { Env } from "../../env";
import { layout } from "./layout";
import { AutoRulesRepo, type AutoRule, type AutoRuleKind } from "../../db/autoRules";
import { CAMPAIGN_TEMPLATES } from "../../templates/campaigns";
import { panelI18n, type T } from "../i18n";

function kindLabels(t: T): Record<AutoRuleKind, { title: string; desc: string }> {
  return {
    comment_dm: {
      title: t("auto.kind.commentDm"),
      desc: t("auto.kind.commentDmDesc"),
    },
    comment_dm_public: {
      title: t("auto.kind.commentDmPublic"),
      desc: t("auto.kind.commentDmPublicDesc"),
    },
    comment_reply: {
      title: t("auto.kind.commentReply"),
      desc: t("auto.kind.commentReplyDesc"),
    },
    dm_reply: {
      title: t("auto.kind.dmReply"),
      desc: t("auto.kind.dmReplyDesc"),
    },
  };
}

function platforms(t: T): { value: string; label: string }[] {
  return [
    { value: "all", label: t("auto.platform.all") },
    { value: "instagram", label: "Instagram" },
    { value: "facebook", label: "Facebook / Messenger" },
  ];
}

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!),
  );
}

const INPUT_STYLE =
  "background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:10px 12px;font-size:12.5px;outline:none;width:100%";

function ruleCard(t: T, rule: AutoRule, clicks: number): string {
  const labels = kindLabels(t);
  const kind = labels[rule.kind] ?? labels.comment_dm;
  // Una regla `comment_dm_public` promete respuesta pública + DM. Si no tiene
  // texto público (ni respuesta de IA), el bot mandaba solo el DM y el
  // comentario quedaba sin responder — sin ningún aviso. Lo marcamos para que
  // el dueño lo vea y lo complete.
  const warnMissingPublic =
    rule.kind === "comment_dm_public" && !rule.replyToComment?.trim() && !rule.aiReplyPrompt?.trim();
  const platform = platforms(t).find((p) => p.value === rule.platform)?.label ?? rule.platform;
  const keywords = rule.keywords.map(esc).join(", ");
  const chip = (label: string, accent: boolean): string =>
    `<span style="font-size:10px;letter-spacing:.12em;padding:3px 9px;border:1px solid ${accent ? "var(--accent)" : "var(--line)"};color:${accent ? "var(--accent2)" : "var(--muted)"};background:${accent ? "var(--accent-soft)" : "transparent"}">${esc(label)}</span>`;

  const actions = [
    `<a href="/admin/automatizaciones/${esc(rule.id)}/edit" class="text-[11px]" style="border:1px solid var(--line);color:var(--accent2);padding:5px 10px;cursor:pointer;background:none;text-decoration:none">${t("auto.edit")}</a>`,
    `<button type="submit" form="toggle-${esc(rule.id)}" class="text-[11px]" style="border:1px solid var(--line);color:var(--cream);padding:5px 10px;cursor:pointer;background:none">${rule.isActive ? t("auto.pause") : t("auto.activate")}</button>`,
    `<button type="submit" form="delete-${esc(rule.id)}" class="text-[11px]" style="border:1px solid var(--bad);color:var(--bad);padding:5px 10px;cursor:pointer;background:none">${t("auto.delete")}</button>`,
  ].join("");

  return `
    <div class="bg-panel border" style="padding:16px 18px;display:flex;flex-direction:column;gap:9px;${rule.isActive ? "border-color:var(--ok)" : "border-color:var(--line);opacity:.75"}">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          ${chip(kind.title, true)}
          ${chip(platform, false)}
        </div>
        <div style="display:flex;gap:6px">${actions}</div>
      </div>
      <p class="text-dim text-[11.5px]" style="margin:0">${esc(kind.desc)}</p>
      <div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center">
        <span class="text-muted text-[11.5px] font-mono" style="color:var(--dim)">${t("auto.keywords")}</span>
        ${rule.keywords.map((k) => `<span class="font-mono" style="font-size:11px;border:1px solid var(--line);background:var(--panel2);padding:2px 7px;color:var(--accent2)">${esc(k)}</span>`).join("")}
      </div>
      <div class="text-[12px]" style="color:var(--cream);border-left:2px solid var(--accent);padding-left:10px;margin-top:2px">${esc(rule.message)}</div>
      ${clicks > 0 ? `<div class="text-[11px] font-mono" style="color:var(--accent2)">${t(clicks === 1 ? "auto.clicks.one" : "auto.clicks.many", { n: clicks })}</div>` : ""}
      ${rule.replyToComment ? `<div class="text-[11.5px]" style="color:var(--muted)">${t("auto.replyPublic")} <span style="color:var(--cream)">${esc(rule.replyToComment)}</span></div>` : ""}
      ${warnMissingPublic ? `<div class="text-[11.5px]" style="color:var(--warn);border:1px solid var(--warn);padding:6px 9px;background:var(--warn-soft)">⚠ ${t("auto.missingPublic")}</div>` : ""}
      ${rule.requireFollow ? `<div class="text-[11.5px]" style="color:var(--accent2)">${t("auto.followGate")}</div>` : ""}
      ${rule.buttonLabel ? `<div class="text-[11.5px]" style="color:var(--muted)">🔘 <span class="font-mono">${esc(rule.buttonLabel)}</span> → ${esc(rule.buttonUrl ?? "")}</div>` : ""}
      <form id="toggle-${esc(rule.id)}" method="POST" action="/admin/automatizaciones/${esc(rule.id)}/toggle" style="display:none"></form>
      <form id="delete-${esc(rule.id)}" method="POST" action="/admin/automatizaciones/${esc(rule.id)}/delete" style="display:none"></form>
    </div>`;
}

export async function renderAutomatizaciones(env: Env, saved?: boolean, error?: string, editRule?: AutoRule | null): Promise<string> {
  const { t } = await panelI18n(env);
  const { Db } = await import("../../db/client");
  const repo = new AutoRulesRepo(new Db(env.DB));
  let rules: AutoRule[] = [];
  try {
    rules = await repo.list();
  } catch (e) {
    error = error ?? t("auto.loadError", { msg: String((e as Error)?.message ?? e) });
  }

  // Clicks por regla (links trackeados) para mostrar en cada card.
  const clicksByRule: Record<string, number> = {};
  try {
    const { TrackedLinksRepo } = await import("../../db/trackedLinks");
    const linksRepo = new TrackedLinksRepo(new Db(env.DB));
    for (const rule of rules) {
      const links = await linksRepo.listByRule(rule.id);
      let total = 0;
      for (const l of links) total += await linksRepo.clickCount(l.slug);
      clicksByRule[rule.id] = total;
    }
  } catch {
    // sin tracking: no se muestran clicks
  }

  // Historial reciente de envíos (Fase 6 OpenReply): dm_logs.
  let recentLogs: {
    id: string; ruleId: string | null; kind: string; platform: string | null; target: string | null; username: string | null; message: string | null; status: string; error: string | null; createdAt: number;
  }[] = [];
  try {
    const { DmLogsRepo } = await import("../../db/dmLogs");
    recentLogs = await new DmLogsRepo(new Db(env.DB)).recent(30);
  } catch {
    // sin logs aún
  }

  // Fallback: respuesta pública a comentarios que NO matchean ninguna regla.
  let fbEnabled = false;
  let fbMessage = "";
  let fbAiEnabled = false;
  let fbAiPrompt = "";
  let fgNotFollowing = "";
  try {
    const { SettingsRepo, SETTING_KEYS } = await import("../../db/settings");
    const s = new SettingsRepo(new Db(env.DB));
    fbEnabled = (await s.get(SETTING_KEYS.commentFallbackEnabled)) === "1";
    fbMessage = (await s.get(SETTING_KEYS.commentFallbackMessage)) ?? "";
    fbAiEnabled = (await s.get(SETTING_KEYS.commentAiFallbackEnabled)) === "1";
    fbAiPrompt = (await s.get(SETTING_KEYS.commentAiFallbackPrompt)) ?? "";
    fgNotFollowing = (await s.get(SETTING_KEYS.followGateNotFollowingMessage)) ?? "";
  } catch {
    // sin settings: fallback apagado
  }

  const fallbackCard = `
    <form method="POST" action="/admin/automatizaciones/fallback" class="bg-panel border" style="padding:16px 18px;display:flex;flex-direction:column;gap:10px">
      <label style="display:flex;align-items:flex-start;gap:10px;font-size:12.5px;color:var(--cream);cursor:pointer">
        <input type="checkbox" name="ai_enabled" value="1" ${fbAiEnabled ? "checked" : ""} style="accent-color:var(--accent);margin-top:2px">
        <span>
          <span class="font-display font-semibold">${t("auto.fallbackAi.title")}</span>
          <span style="display:block;color:var(--dim);font-size:11px;margin-top:2px">${t("auto.fallbackAi.help")}</span>
        </span>
      </label>
      <textarea name="ai_prompt" rows="2" placeholder="${t("auto.fallbackAi.ph")}" style="${INPUT_STYLE}">${esc(fbAiPrompt)}</textarea>
      <label style="display:flex;align-items:flex-start;gap:10px;font-size:12.5px;color:var(--cream);cursor:pointer">
        <input type="checkbox" name="enabled" value="1" ${fbEnabled ? "checked" : ""} style="accent-color:var(--accent);margin-top:2px">
        <span>
          <span class="font-display font-semibold">${t("auto.fallbackFixed.title")}</span>
          <span style="display:block;color:var(--dim);font-size:11px;margin-top:2px">${t("auto.fallbackFixed.help")}</span>
        </span>
      </label>
      <textarea name="message" rows="2" placeholder="${t("auto.fallbackFixed.ph")}" style="${INPUT_STYLE}">${esc(fbMessage)}</textarea>
      <div style="border-top:1px solid var(--line);padding-top:10px;display:flex;flex-direction:column;gap:6px">
        <label class="font-display font-semibold text-[12px] text-cream" for="follow_not_following">${t("auto.followGate.notFollowing")}</label>
        <textarea id="follow_not_following" name="follow_not_following" rows="2" placeholder="${t("auto.followGate.notFollowingPh")}" style="${INPUT_STYLE}">${esc(fgNotFollowing)}</textarea>
        <span class="text-dim text-[10.5px]">${t("auto.followGate.notFollowingHelp")}</span>
      </div>
      <div><button type="submit" style="background:var(--accent);color:var(--on-accent);font-weight:700;border:none;padding:8px 16px;font-size:12px;cursor:pointer">${t("common.save")}</button></div>
    </form>`;

  const cards = rules.length
    ? rules.map((r) => ruleCard(t, r, clicksByRule[r.id] ?? 0)).join("")
    : `<div class="bg-panel border" style="padding:24px;text-align:center;color:var(--dim);font-size:12.5px">${t("auto.empty")}</div>`;

  const banner = saved
    ? `<div style="border:1px solid var(--ok);color:var(--ok);padding:10px 14px;font-size:12px;background:var(--ok-soft)">${t("auto.saved")}</div>`
    : error
      ? `<div style="border:1px solid var(--bad);color:var(--bad);padding:10px 14px;font-size:12px;background:var(--bad-soft)">⚠ ${esc(error)}</div>`
      : "";

  const kindOptions = (Object.keys(kindLabels(t)) as AutoRuleKind[])
    .map((k) => `<option value="${k}">${esc(kindLabels(t)[k].title)}</option>`)
    .join("");
  const platformOptions = platforms(t).map((p) => `<option value="${p.value}">${esc(p.label)}</option>`).join("");

  const body = `
    <div style="display:flex;flex-direction:column;gap:18px">
      <div style="display:flex;flex-direction:column;gap:2px">
        <h2 class="font-display font-semibold text-[15px] text-cream">${t("auto.heading")}</h2>
        <p class="text-muted text-[12.5px]">${t("auto.subtitle")}</p>
      </div>
      ${banner}
      ${fallbackCard}
      <div style="display:flex;flex-direction:column;gap:12px">${cards}</div>
      <div class="bg-panel border" style="padding:18px 20px;display:flex;flex-direction:column;gap:14px">
        <h3 class="font-display font-semibold text-[13.5px] text-cream">${editRule ? t("auto.editTitle") : t("auto.newTitle")}</h3>
        <div style="display:flex;flex-direction:column;gap:6px">
          <label class="font-display font-semibold text-[12px] text-cream" for="template_picker">${t("auto.templateLabel")}</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${CAMPAIGN_TEMPLATES.map(
              (tpl) =>
                `<button type="button" class="tpl-btn" data-tpl="${esc(tpl.id)}" style="border:1px solid var(--line);background:var(--panel2);color:var(--cream);padding:8px 12px;font-size:11.5px;cursor:pointer">${esc(tpl.label)}</button>`,
            ).join("")}
            <button type="button" class="tpl-btn" data-tpl="" style="border:1px solid var(--line);background:none;color:var(--dim);padding:8px 12px;font-size:11.5px;cursor:pointer">${t("auto.clear")}</button>
          </div>
          <span class="text-dim text-[10.5px]">${t("auto.templateHint")}</span>
        </div>
        <form method="POST" action="${editRule ? `/admin/automatizaciones/${esc(editRule.id)}/save` : "/admin/automatizaciones/save"}" id="auto-form" style="display:flex;flex-direction:column;gap:14px">
          ${editRule ? `<input type="hidden" name="editing_id" value="${esc(editRule.id)}">` : ""}
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">
            <div style="display:flex;flex-direction:column;gap:5px">
              <label class="font-display font-semibold text-[12px] text-cream" for="kind">${t("auto.form.kind")}</label>
              <select id="kind" name="kind" style="${INPUT_STYLE}">${kindOptions.replace(`value="${esc(editRule?.kind ?? "")}"`, `value="${esc(editRule?.kind ?? "")}" selected`)}</select>
            </div>
            <div style="display:flex;flex-direction:column;gap:5px">
              <label class="font-display font-semibold text-[12px] text-cream" for="platform">${t("auto.form.platform")}</label>
              <select id="platform" name="platform" style="${INPUT_STYLE}">${platformOptions.replace(`value="${esc(editRule?.platform ?? "")}"`, `value="${esc(editRule?.platform ?? "")}" selected`)}</select>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:5px">
            <label class="font-display font-semibold text-[12px] text-cream" for="keywords">${t("auto.form.keywords")}</label>
            <input id="keywords" name="keywords" required value="${esc(editRule?.keywords.join(", ") ?? "")}" placeholder="${t("auto.form.keywordsPh")}" style="${INPUT_STYLE}">
          </div>
          <div style="display:flex;flex-direction:column;gap:5px">
            <label class="font-display font-semibold text-[12px] text-cream" for="message">${t("auto.form.message")}</label>
            <textarea id="message" name="message" required rows="3" placeholder="${t("auto.form.messagePh")}" style="${INPUT_STYLE}">${esc(editRule?.message ?? "")}</textarea>
            <span class="text-dim text-[10.5px]">${t("auto.form.usernameHint")}</span>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted);cursor:pointer">
              <input type="checkbox" name="whole_word_match" value="1" ${editRule?.wholeWordMatch !== false ? "checked" : ""} style="accent-color:var(--accent)">
              ${t("auto.form.wholeWord")}
            </label>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted);cursor:pointer">
              <input type="checkbox" name="require_follow" value="1" ${editRule?.requireFollow ? "checked" : ""} style="accent-color:var(--accent)">
              ${t("auto.form.requireFollow")}
            </label>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">
            <div style="display:flex;flex-direction:column;gap:5px">
              <label class="font-display font-semibold text-[12px] text-cream" for="follow_prompt_message">${t("auto.form.followPrompt")}</label>
              <input id="follow_prompt_message" name="follow_prompt_message" value="${esc(editRule?.followPromptMessage ?? "")}" placeholder="${t("auto.form.followPromptPh")}" style="${INPUT_STYLE}">
            </div>
            <div style="display:flex;flex-direction:column;gap:5px">
              <label class="font-display font-semibold text-[12px] text-cream" for="follow_button_label">${t("auto.form.followButton")}</label>
              <input id="follow_button_label" name="follow_button_label" value="${esc(editRule?.followButtonLabel ?? "")}" placeholder="${t("auto.form.followButtonPh")}" style="${INPUT_STYLE}">
            </div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">
            <div style="display:flex;flex-direction:column;gap:5px">
              <label class="font-display font-semibold text-[12px] text-cream" for="button_label">${t("auto.form.buttonLabel")}</label>
              <input id="button_label" name="button_label" value="${esc(editRule?.buttonLabel ?? "")}" placeholder="${t("auto.form.buttonLabelPh")}" style="${INPUT_STYLE}">
            </div>
            <div style="display:flex;flex-direction:column;gap:5px">
              <label class="font-display font-semibold text-[12px] text-cream" for="button_url">${t("auto.form.buttonUrl")}</label>
              <input id="button_url" name="button_url" value="${esc(editRule?.buttonUrl ?? "")}" placeholder="${t("auto.form.buttonUrlPh")}" style="${INPUT_STYLE}">
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:5px">
            <label class="font-display font-semibold text-[12px] text-cream" for="reply_to_comment">${t("auto.form.replyComment")}</label>
            <input id="reply_to_comment" name="reply_to_comment" value="${esc(editRule?.replyToComment ?? "")}" placeholder="${t("auto.form.replyCommentPh")}" style="${INPUT_STYLE}">
          </div>
          <div style="display:flex;flex-direction:column;gap:5px">
            <label class="font-display font-semibold text-[12px] text-cream" for="ai_reply_prompt">${t("auto.form.aiReply")}</label>
            <textarea id="ai_reply_prompt" name="ai_reply_prompt" rows="2" placeholder="${t("auto.form.aiReplyPh")}" style="${INPUT_STYLE}">${esc(editRule?.aiReplyPrompt ?? "")}</textarea>
            <span class="text-dim text-[10.5px]">${t("auto.form.aiReplyHint")}</span>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <button type="submit" style="background:var(--accent);color:var(--on-accent);font-weight:700;border:none;padding:10px 18px;font-size:12.5px;cursor:pointer">${editRule ? t("auto.form.save") : t("auto.form.create")}</button>
            ${editRule ? `<a href="/admin/automatizaciones" class="text-[11px]" style="border:1px solid var(--line);color:var(--dim);padding:10px 18px;text-decoration:none">${t("auto.form.cancel")}</a>` : `<span class="text-dim text-[11px]">${t("auto.form.immediate")}</span>`}
          </div>
        </form>
      </div>

      <div class="bg-panel border" style="padding:18px 20px;display:flex;flex-direction:column;gap:12px">
        <h3 class="font-display font-semibold text-[13.5px] text-cream">${t("auto.logs.title")}</h3>
        <p class="text-muted text-[12px]" style="margin:0">${t("auto.logs.help")}</p>
        ${recentLogs.length === 0
          ? `<div class="text-dim text-[12px]" style="padding:10px 0">${t("auto.logs.empty")}</div>`
          : `<div style="display:flex;flex-direction:column;gap:6px">${recentLogs
              .map((l) => {
                const color =
                  l.status === "sent" ? "var(--ok)" : l.status === "skipped" ? "var(--warn)" : "var(--bad)";
                const when = new Date(l.createdAt).toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
                const kindLabel = l.kind === "comment_dm" ? t("auto.logKind.commentDm") : l.kind === "comment_reply" ? t("auto.logKind.commentReply") : l.kind === "comment_dm_public" ? t("auto.logKind.commentDmPublic") : t("auto.logKind.dmReply");
                return `<div style="display:flex;gap:10px;align-items:flex-start;border:1px solid var(--line);background:var(--panel2);padding:8px 10px">
                  <span class="font-mono text-[10px]" style="color:${color};border:1px solid ${color};padding:2px 6px;flex:none">${esc(l.status.toUpperCase())}</span>
                  <span style="flex:1;min-width:0">
                    <span class="text-[12px] text-cream" style="display:block">${esc(kindLabel)}${l.username ? " · " + esc(l.username) : ""} ${l.platform ? "· " + esc(l.platform) : ""}</span>
                    <span class="text-[11px] text-dim" style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(l.message ?? "")}</span>
                    ${l.error ? `<span class="text-[10.5px]" style="color:var(--bad);display:block">⚠ ${esc(l.error)}</span>` : ""}
                  </span>
                  <span class="text-[10px] font-mono" style="color:var(--dim);flex:none">${esc(when)}</span>
                </div>`;
              })
              .join("")}</div>`}
      </div>
    </div>
    <script>
    (function () {
      const TEMPLATES = ${JSON.stringify(CAMPAIGN_TEMPLATES)};
      const $ = (id) => document.getElementById(id);
      function fill(t) {
        if (!t) { // vaciar
          $("kind").value = "comment_dm";
          $("platform").value = "all";
          $("keywords").value = "";
          $("message").value = "";
          $("button_label").value = "";
          $("button_url").value = "";
          $("reply_to_comment").value = "";
          $("whole_word_match").checked = true;
          $("require_follow").checked = false;
          $("follow_prompt_message").value = "";
          $("follow_button_label").value = "";
          return;
        }
        const d = t.defaults || {};
        $("kind").value = d.kind || "comment_dm";
        $("platform").value = d.platform || "all";
        $("keywords").value = (d.keywords || []).join(", ");
        $("message").value = d.message || "";
        $("button_label").value = d.buttonLabel || "";
        $("button_url").value = d.buttonUrl || "";
        $("reply_to_comment").value = d.replyToComment || "";
        $("whole_word_match").checked = d.wholeWordMatch !== false;
        $("require_follow").checked = !!d.requireFollow;
        $("follow_prompt_message").value = d.followPromptMessage || "";
        $("follow_button_label").value = d.followButtonLabel || "";
        $("auto-form").scrollIntoView({ behavior: "smooth", block: "start" });
      }
      document.querySelectorAll(".tpl-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const tpl = TEMPLATES.find((t) => t.id === btn.dataset.tpl);
          fill(tpl);
        });
      });
    })();
    </script>`;

  return layout({ title: t("auto.title"), activeTab: "automatizaciones", body, env });
}
