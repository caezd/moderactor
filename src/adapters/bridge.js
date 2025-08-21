function all(el, sel) {
    return Array.from(el.querySelectorAll(sel));
}

// Collecte tous les nœuds texte visibles (hors <script/style/...>)
function collectTextNodes(root) {
    const out = [];
    const skip = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "IFRAME"]);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            const parent = node.parentElement;
            if (!parent || skip.has(parent.tagName))
                return NodeFilter.FILTER_REJECT;
            const txt = node.nodeValue || "";
            if (!txt.trim()) return NodeFilter.FILTER_SKIP;
            return NodeFilter.FILTER_ACCEPT;
        },
    });
    let n;
    while ((n = walker.nextNode())) out.push(n.nodeValue);
    return out;
}

function normalize(s) {
    return (s || "").replace(/\s+/g, " ").trim();
}
function lower(s) {
    return normalize(s).toLowerCase();
}

// Essaie d'extraire la phrase contenant un mot-clé connu (FR/EN)
function extractSentenceAround(text, needles) {
    const t = " " + normalize(text) + " ";
    const idx = needles
        .map((n) => t.indexOf(n))
        .filter((i) => i >= 0)
        .sort((a, b) => a - b)[0];
    if (idx === undefined) return "";
    // bornes de phrase (., !, ?, \n)
    const left = Math.max(
        0,
        t.lastIndexOf(".", idx) + 1,
        t.lastIndexOf("!", idx) + 1,
        t.lastIndexOf("?", idx) + 1,
        t.lastIndexOf("\n", idx) + 1
    );
    let right = t.indexOf(".", idx);
    if (right === -1) right = t.length;
    const s = t.slice(left, right).trim();
    return s || t.trim();
}

// Dictionnaires d’action ↔ mots‑clés (FR/EN)
const ACTION_KEYWORDS = {
    "topic.move": ["déplac", "moved"],
    "topic.lock": ["verrouill", "locked"],
    "topic.unlock": ["déverrouill", "unlocked"],
    "topic.delete": ["supprim", "deleted", "removed"],
    "topic.trash": ["corbeille", "poubelle", "trash"],
    "topic.post": ["répon", "posted", "reply"],
    "forum.post": [
        "nouveau sujet",
        "sujet a été créé",
        "topic has been created",
        "new topic",
    ],
    "user.pm": ["message priv", "private message"],
    "user.ban": ["banni", "banned"],
    "user.unban": ["débanni", "unbann"],
};

const ERROR_KEYWORDS = [
    "aucun",
    "erreur",
    "error",
    "forbidden",
    "not allowed",
    "non autorisé",
    "permission",
];

// Déduction d’action à partir du texte global
function inferActionFromText(text) {
    const t = lower(text);
    for (const [action, keys] of Object.entries(ACTION_KEYWORDS)) {
        if (keys.some((k) => t.includes(k))) return action;
    }
    return "unknown";
}

// Succès si (action détectée) ∧ (au moins un mot‑clé de succès présent) ∧ (aucun mot‑clé d’erreur)
function validateOk(action, message) {
    const keys = ACTION_KEYWORDS[action] || [];
    const msg = lower(message);
    const hasSuccess = keys.some((k) => msg.includes(k));
    const hasError = ERROR_KEYWORDS.some((k) => msg.includes(k));
    return hasSuccess && !hasError;
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

function parseAllIds(doc) {
    const out = {
        topic_id: undefined,
        forum_id: undefined,
        post_id: undefined,
    };
    for (const a of all(doc, "a[href]")) {
        const ids = parseIdsFromHref(a.getAttribute("href") || "");
        if (out.topic_id === undefined && ids.topic_id !== undefined)
            out.topic_id = ids.topic_id;
        if (out.forum_id === undefined && ids.forum_id !== undefined)
            out.forum_id = ids.forum_id;
        if (out.post_id === undefined && ids.post_id !== undefined)
            out.post_id = ids.post_id;
    }
    return out;
}

// Message principal : on recompose depuis TOUS les text nodes
function extractMessage(doc) {
    const textNodes = collectTextNodes(doc.body || doc);
    const combined = normalize(textNodes.join(" "));

    // 1) Extraire la phrase la plus pertinente autour d'un mot‑clé
    const needles = Array.from(
        new Set(Object.values(ACTION_KEYWORDS).flat())
    ).map(lower);
    const sentence = extractSentenceAround(combined, needles);
    if (sentence) return sentence;

    // 2) Secours : premier <p> s’il existe
    const p = (doc.querySelector("p") || {}).textContent || "";
    if (p.trim()) return normalize(p);

    // 3) Dernier recours : tout le texte
    return combined;
}

export function bridgeParse(resp) {
    const { doc, text } = resp;

    // 1) Message robuste (text nodes)
    const message = extractMessage(doc);

    // 2) IDs depuis tous les liens (puis priorise le premier lien)
    const idsAll = parseAllIds(doc);
    const firstLink = doc.querySelector("a[href]");
    const href = firstLink ? firstLink.getAttribute("href") : "";
    const idsFirst = parseIdsFromHref(href);
    const ids = { ...idsAll, ...idsFirst };

    // 3) Action & succès
    const action = inferActionFromText(message);
    let ok = validateOk(action, message);

    // 4) Bloc d’erreur explicite → échec prioritaire
    if (
        doc.querySelector(
            ".box-content.error, .error, .panel .error, .errorbox"
        )
    )
        ok = false;

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
    collectTextNodes,
    extractMessage,
    extractSentenceAround,
    inferActionFromText,
    validateOk,
    parseIdsFromHref,
    parseAllIds,
    normalize,
    lower,
};
