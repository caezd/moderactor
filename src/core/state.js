function getTidFromDomOrUrl() {
    const input = document.querySelector("input[name=tid]");
    if (input?.value) return input.value;

    const anchor = document.querySelector("a[href*='&tid=']");
    const href = anchor?.getAttribute("href") || "";
    const m = href.match(/[?&]tid=([a-z0-9]+)/i);
    if (m) return m[1];

    // fallback: parse pathname (/t123-/f456-)
    const p = location.pathname;
    const t = p.match(/\/t(\d+)(?:p\d+)?-/);
    if (t) return t[1];
    const f = p.match(/\/f(\d+)(?:p\d+)?-/);
    if (f) return f[1];

    return null;
}

function getPageType() {
    const p = location.pathname;
    if (/^\/t\d+(p\d+)?-/.test(p)) return "topic";
    if (/^\/f\d+(p\d+)?-/.test(p)) return "forum";
    if (/^\/c\d+-/.test(p)) return "category";
    if (/^\/u\d+-/.test(p)) return "profile";
    if (/^\/privmsg\?/.test(p)) return "inbox";
    const qs = p + location.search;
    const m = qs.match(/\/modcp\?mode=([^&]+)/);
    return m ? m[1] : "";
}

function getResId() {
    const p = location.pathname;
    let m = p.match(/^\/[tfc](\d+)(?:p\d+)?-/);
    if (!m) m = p.match(/^\/u(\d+)/);
    return m ? Number(m[1]) : 0;
}

function getPageNum() {
    const p = location.pathname;
    const m = p.match(/^\/[tf]\d+(p\d+)-/);
    return m ? Number(m[1].slice(1)) : 0;
}

export const state = {
    get tid() {
        return getTidFromDomOrUrl();
    },
    get pagetype() {
        return getPageType();
    },
    get resid() {
        return getResId();
    },
    get pagenum() {
        return getPageNum();
    },
    get charset() {
        return (
            document.charset ||
            document.characterSet ||
            "utf-8"
        ).toLowerCase();
    },
};
