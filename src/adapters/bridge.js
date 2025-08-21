// ──────────────────────────────────────────────────────────────────────────────
// File: src/adapters/phpbb3/bridge.js
// ──────────────────────────────────────────────────────────────────────────────
// Bridge pour Forumactif : parse les pages de confirmation/erreur

function first(el, sel) {
    return el.querySelector(sel) || undefined;
}
function all(el, sel) {
    return Array.from(el.querySelectorAll(sel));
}

function extractMessage(doc) {
    // Récupère tous les <p> et concatène leurs textes
    const ps = Array.from(doc.querySelectorAll("p")).map((p) =>
        p.textContent.trim()
    );
    const text = ps.join(" ").replace(/\s+/g, " ").trim();
    return text;
}

function parseIdsFromHref(href) {
    const ids = {};
    if (!href) return ids;
    const t = href.match(/\/(?:t|viewtopic\?.*?t=)(\d+)/);
    if (t) ids.topic_id = Number(t[1]);
    const f = href.match(/\/f(\d+)-/);
    if (f) ids.forum_id = Number(f[1]);
    const p = href.match(/#(\d+)$/);
    if (p) ids.post_id = Number(p[1]);
    return ids;
}

function inferAction(message) {
    const lower = (message || "").toLowerCase();
    if (/déplacé/.test(lower)) return "topic.move";
    if (/verrouill/.test(lower) && !/déverrouill/.test(lower))
        return "topic.lock";
    if (/déverrouill/.test(lower)) return "topic.unlock";
    if (/supprim/.test(lower)) return "topic.delete";
    if (/corbeille|poubelle/.test(lower)) return "topic.trash";
    if (/répon|enregistré avec succès/.test(lower)) return "topic.post";
    if (/nouveau sujet/.test(lower)) return "forum.post";
    if (/message priv/.test(lower)) return "user.pm";
    if (/banni/.test(lower)) return "user.ban";
    if (/débanni|unban/.test(lower)) return "user.unban";
    return "unknown";
}

function validateOk(action, message) {
    const lowerMsg = (message || "").toLowerCase();
    switch (action) {
        case "topic.move":
            return /déplacé/.test(lowerMsg);
        case "topic.lock":
            return /verrouill/.test(lowerMsg);
        case "topic.unlock":
            return /déverrouill/.test(lowerMsg);
        case "topic.delete":
            return /supprim/.test(lowerMsg);
        case "topic.trash":
            return /corbeille|poubelle/.test(lowerMsg);
        case "topic.post":
            return /répon|enregistré avec succès/.test(lowerMsg);
        case "forum.post":
            return /nouveau sujet/.test(lowerMsg);
        case "user.pm":
            return /message priv/.test(lowerMsg);
        case "user.ban":
            return /banni/.test(lowerMsg);
        case "user.unban":
            return /débanni|unban/.test(lowerMsg);
        default:
            return false;
    }
}

export function bridgeParse(resp) {
    const { doc, text } = resp;
    const message = extractMessage(doc);

    const firstLink = first(doc, "a[href]");
    const href = firstLink ? firstLink.getAttribute("href") : "";
    const ids = parseIdsFromHref(href);

    const action = inferAction(message);
    const ok = validateOk(action, message);

    const links = {
        first: href || undefined,
        topic:
            all(doc, 'a[href^="/t"], a[href*="viewtopic"]').map((a) =>
                a.getAttribute("href")
            )[0] || undefined,
        forum:
            all(doc, 'a[href^="/f"]').map((a) => a.getAttribute("href"))[0] ||
            undefined,
    };

    return {
        ok,
        status: resp.status,
        action,
        message,
        ids,
        links,
        href,
        raw: text,
    };
}

export const __bridgeInternals = {
    extractMessage,
    parseIdsFromHref,
    inferAction,
    validateOk,
};
