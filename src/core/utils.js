export const isArray = Array.isArray;

export const toArray = (v) => (v == null ? [] : isArray(v) ? v : [v]);

export function byIdOrArray(input) {
    return toArray(input)
        .filter((x) => x != null)
        .map((x) => (typeof x === "number" ? x : parseInt(String(x), 10)))
        .filter((x) => Number.isFinite(x) && x > 0);
}

export function safeLower(s) {
    return String(s || "").toLowerCase();
}
export function text(el) {
    return (el?.textContent || "").trim();
}
export function toISO(d) {
    try {
        return new Date(d).toISOString();
    } catch {
        return undefined;
    }
}

export const getDirectText = (el) =>
    !el
        ? ""
        : Array.from(el.childNodes)
              .filter((n) => n.nodeType === Node.TEXT_NODE)
              .map((n) => n.nodeValue.trim())
              .filter(Boolean)
              .join(" ");

export const num = (s) => {
    const m = String(s || "")
        .replace(/\s/g, "")
        .match(/-?\d+/);
    return m ? Number(m[0]) : undefined;
};

export const idsFromHref = (href) => {
    const ids = {};
    if (!href) return ids;
    const t = href.match(/\/t(\d+)/) || href.match(/[?&]t=(\d+)/);
    const p = href.match(/#p?(\d+)$/);
    const f = href.match(/\/f(\d+)-/);
    if (t) ids.topic_id = Number(t[1]);
    if (p) ids.post_id = Number(p[1]);
    if (f) ids.forum_id = Number(f[1]);
    return ids;
};

export function uniq(arr) {
    return Array.from(new Set(arr));
}

// Extrait {id, slug} depuis une URL canonique /t238-mon-sujet
export function parseFromUrl(u) {
    try {
        const href = typeof u === "string" ? u : u?.href || "";
        const m = href.match(/\/[ftc](\d+)(?:[p]\d+)?-([a-z0-9-]+)/i);
        return m ? { id: Number(m[1]), slug: m[2] } : {};
    } catch {
        return {};
    }
}
