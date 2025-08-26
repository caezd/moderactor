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

    // topic id (depuis /tID-... OU viewtopic?...t=ID)
    const t =
        href.match(/\/t(\d+)-/) || href.match(/viewtopic\?.*?[?&]t=(\d+)/);
    if (t) ids.topic_id = Number(t[1]);

    // slug
    const s = href.match(/\/t\d+-([^\/?#]+)/);
    if (s) ids.topic_slug = s[1];

    // forum id
    const f = href.match(/\/f(\d+)-/);
    if (f) ids.forum_id = Number(f[1]);

    // post id (anchor)
    const p = href.match(/#(\d+)$/);
    if (p) ids.post_id = Number(p[1]);

    // start (pagination)
    const st = href.match(/[?&]start=(\d+)/);
    if (st) ids.start = Number(st[1]);

    // flags utiles
    ids.is_topic = /^\/t\d+-/.test(href);
    ids.is_viewtopic = /\/viewtopic\?/.test(href);

    return ids;
}

function canonicalTopicUrl(doc) {
    const a = doc.querySelector('a[href^="/t"]');
    return a ? a.getAttribute("href") : undefined;
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

    const topicLink = all(doc, 'a[href^="/t"], a[href*="viewtopic"]').map((a) =>
        a.getAttribute("href")
    )[0];
    const forumLink = all(doc, 'a[href^="/f"]').map((a) =>
        a.getAttribute("href")
    )[0];

    // Tente d’obtenir une URL canonique de sujet (si on n’a qu’un viewtopic)
    let topicUrl = topicLink;
    if (topicUrl && /viewtopic\?/.test(topicUrl)) {
        const can = canonicalTopicUrl(doc);
        if (can) topicUrl = can;
    }

    const links = {
        first: href || undefined,
        topic: topicUrl || undefined,
        forum: forumLink || undefined,
    };

    // Entité normalisée pour usage direct par Moderactor
    const entity = {};
    if (ok) {
        if (
            action === "forum.post" ||
            (action === "topic.post" && ids.is_topic)
        ) {
            // Création d’un nouveau sujet
            entity.topic = {
                id: ids.topic_id,
                url: links.topic,
                slug: ids.topic_slug,
                forumId: ids.forum_id,
            };
        } else if (action === "topic.post") {
            // Réponse dans un sujet existant
            // si pas de lien canonique, on garde viewtopic#post
            const postHref = links.topic || href;
            entity.post = {
                id: ids.post_id,
                topicId: ids.topic_id,
                url: postHref,
            };
        } else if (action === "user.pm") {
            entity.pm = { inboxUrl: "/privmsg?folder=inbox" };
        }
    }

    return {
        ok,
        status: resp.status,
        action,
        message,
        ids,
        links,
        href,
        entity,
        raw: text,
    };
}

export const __bridgeInternals = {
    extractMessage,
    parseIdsFromHref,
    inferAction,
    validateOk,
};
