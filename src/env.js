import { state } from "./core/state.js";

export async function env(url) {
    // Si pas d'URL : on retourne l'env courant (basé sur state)
    if (!url) {
        return {
            url: location.href,
            tid: state.tid,
            pagetype: state.pagetype,
            resid: state.resid,
            pagenum: state.pagenum,
            charset: state.charset,
            anchorId: location.hash ? location.hash.substring(1) : null,
        };
    }

    // Sinon, on va chercher l'URL et on parse les infos utiles
    const r = await fetch(url, { credentials: "same-origin" });
    const text = await r.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "text/html");

    const u = new URL(url, location.href);
    const pathname = u.pathname;
    const hash = u.hash ? u.hash.substring(1) : null;

    // extraction minimale d'infos depuis le DOM chargé
    const mTid = pathname.match(/\/t(\d+)(?:p\d+)?-/);
    const mFid = pathname.match(/\/f(\d+)(?:p\d+)?-/);

    return {
        url,
        tid:
            doc.querySelector("input[name=tid]")?.value ||
            (mTid ? mTid[1] : null) ||
            (mFid ? mFid[1] : null),
        pagetype: (() => {
            if (/^\/t\d+(p\d+)?-/.test(pathname)) return "topic";
            if (/^\/f\d+(p\d+)?-/.test(pathname)) return "forum";
            if (/^\/c\d+-/.test(pathname)) return "category";
            return "";
        })(),
        resid: (() => {
            let m = pathname.match(/^\/[tfc](\d+)(?:p\d+)?-/);
            if (!m) m = pathname.match(/^\/u(\d+)/);
            return m ? Number(m[1]) : 0;
        })(),
        pagenum: (() => {
            const m = pathname.match(/^\/[tf]\d+(p\d+)-/);
            return m ? Number(m[1].slice(1)) : 0;
        })(),
        charset: (doc.characterSet || "utf-8").toLowerCase(),
        anchorId: hash,
    };
}
