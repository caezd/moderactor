import { state } from "./core/state.js";
import { getCookie } from "./core/utils.js";

export async function env(url) {
    console.log(
        "fa_" + location.host.replace(/\./g, "_") + "_data",
        getCookie("fa_" + location.host.replace(/\./g, "_") + "_data"),
        parseInt(getCookie("fa_" + location.host.replace(/\./g, "_") + "_data"))
    );
    const user_id = parseInt(
        ((
            getCookie("fa_" + location.host.replace(/\./g, "_") + "_data") || ""
        ).match(/"userid";(?:s:[0-9]+:"|i:)([0-9]+)/) || [0, -1])[1]
    );

    const _ud = _userdata || {};

    // Si pas d'URL : on retourne l'env courant (basé sur state)
    if (!url) {
        const u = location;
        const hash = u.hash ? u.hash.substring(1) : null;

        return {
            url: location.href,
            t_id: state.tid,
            page_type: state.pagetype,
            res_id: state.resid,
            page_num: state.pagenum,
            charset: state.charset,
            anchor_id: hash,
            user_id,
            is_guest: user_id == -1,
            is_admin: _ud["user_level"] == 1,
            is_mod: _ud["user_level"] > 0,
            lang: _ud["user_lang"],
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
        t_id:
            doc.querySelector("input[name=tid]")?.value ||
            (mTid ? mTid[1] : null) ||
            (mFid ? mFid[1] : null),
        page_type: (() => {
            if (/^\/t\d+(p\d+)?-/.test(pathname)) return "topic";
            if (/^\/f\d+(p\d+)?-/.test(pathname)) return "forum";
            if (/^\/c\d+-/.test(pathname)) return "category";
            return "";
        })(),
        res_id: (() => {
            let m = pathname.match(/^\/[tfc](\d+)(?:p\d+)?-/);
            if (!m) m = pathname.match(/^\/u(\d+)/);
            return m ? Number(m[1]) : 0;
        })(),
        page_num: (() => {
            const m = pathname.match(/^\/[tf]\d+(p\d+)-/);
            return m ? Number(m[1].slice(1)) : 0;
        })(),
        charset: (doc.characterSet || "utf-8").toLowerCase(),
        anchor_id: hash,
        user_id,
        is_guest: user_id == -1,
        is_admin: _ud["user_level"] == 1,
        is_mod: _ud["user_level"] > 0,
        lang: _ud["user_lang"],
    };
}
