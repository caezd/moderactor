import { state } from "./core/state.js";
import { extractDiscussion, extractBreadcrumbs } from "./core/jsonld.js";
import { getDirectText, text } from "./core/utils.js";
import { parseForumStats } from "./parsers/statsForum.js";
import { parseTopicStats } from "./parsers/statsTopic.js";

function parseMiscVars(data) {
    const misc = {};
    data.querySelectorAll("ul a").forEach((el) => {
        const l = el.innerText.replace(/[^a-zA-Z]/gi, "");
        misc[l] = getDirectText(el.parentNode).replace(/^:/gi, "").trim();
    });

    misc["FORUMAGETYPE"] = "jours";

    misc["NOWDAY"] = new Date().getDate();
    misc["NOWMONTH"] = new Date().getMonth() + 1;
    misc["NOWYEAR"] = new Date().getFullYear();
    misc["NOWHOUR"] = new Date().getHours();
    misc["NOWMINUTE"] = new Date().getMinutes();

    misc["FORUMLASTUSERLINK"] = misc["FORUMLASTUSERLINK"].replace(
        misc["FORUMURLINK"],
        ""
    );
    misc["USERLINK"] = misc["USERLINK"].replace(misc["FORUMURLINK"], "");
    misc["FORUMLASTUSERID"] = misc["FORUMLASTUSERLINK"].replace(/[^0-9]/gi, "");

    return {
        misc,
    };
}

async function computeStats({
    scope = "auto",
    fetchExtra = [],
    forum = {},
    topic = {},
} = {}) {
    const t0 = performance.now();
    const sources = new Set();
    const stats = {};

    const doc = document;
    const effective = scope === "auto" ? state.pagetype || "auto" : scope;

    const defaultExtras = [
        {
            url: "/popup_help.forum?l=miscvars&i=mes_txt",
            callback: parseMiscVars,
        },
    ];
    const extras = [...defaultExtras, ...fetchExtra];

    if (
        effective === "topic" ||
        (effective === "auto" && state.pagetype === "forum")
    ) {
        stats.topic =
            state.pagetype === "topic"
                ? parseTopicStats(doc, topic)
                : undefined;
    }
    if (effective === "forum" || effective === "auto") {
        stats.forum =
            state.pagetype === "forum"
                ? parseForumStats(doc, forum)
                : undefined;
    }

    for (const { url, callback } of extras) {
        try {
            const r = await fetch(url, { credentials: "same-origin" });
            sources.add(url);

            // Détecte le type de réponse
            const ct = r.headers.get("content-type") || "";
            let payload;
            if (ct.includes("html")) {
                const html = await r.text();
                payload = new DOMParser().parseFromString(html, "text/html");
            } else if (ct.includes("json")) {
                payload = await r.json();
            } else {
                payload = await r.text();
            }

            const res = await callback(payload);
            if (res && typeof res === "object") {
                // Merge « doux »
                for (const [k, v] of Object.entries(res)) {
                    if (typeof v === "object" && typeof stats[k] === "object") {
                        stats[k] = { ...stats[k], ...v };
                    } else {
                        stats[k] = v;
                    }
                }
            }

            // Merge « intelligent » sur les clés attendues
            Object.assign(stats, res);
        } catch (e) {
            console.error("Error fetching extra data:", e);
        }
    }

    stats.computed_at = new Date().toISOString();
    stats.elapse_ms = Math.round(performance.now() - t0);
    stats.sources = Array.from(sources);
    return stats;
}

export async function env(options = {}) {
    const doc = document;
    const statsWanted = !!options?.stats;
    const forumPageSize = options?.stats?.forum?.pageSize;

    const discussion = extractDiscussion(doc)[0] || null;
    const breadcrumbs = extractBreadcrumbs(doc)[0] || null;

    const u = location;
    const hash = u.hash ? u.hash.substring(1) : null;

    const _ud = typeof _userdata !== "undefined" ? _userdata : {};
    const _bd = typeof _board !== "undefined" ? _board : {};

    const data = {
        board: {
            tpl: _ud["tpl_used"],
            reputation_active: Number(_bd["reputation_active"]),
        },
        page: {
            url: u.href,
            type: state.pagetype,
            id: state.resid,
            number: state.pagenum,
            charset: state.charset,
            anchor: hash,
        },
        user: {
            t_id: state.tid,
            name: _ud["username"],
            id: Number(_ud["user_id"]) || undefined,
            is_logged: Number(_ud["session_logged_in"]) === 1,
            is_guest: Number(_ud["user_id"]) === -1,
            is_admin: Number(_ud["user_level"]) == 1,
            is_mod: (Number(_ud["user_level"]) || 0) > 0,
            lang: _ud["user_lang"],
            notifications: Number(_ud["notifications"]),
            avatar: _ud["avatar"],
            avatar_link: _ud["avatar_link"],
            posts: Number(_ud["userposts"]) || undefined,
            privmsgs_count: Number(_ud["user_nb_privmsgs"]) || undefined,
            group_color: _ud["groupcolor"],
        },
        schema: {
            discussion,
            breadcrumbs,
        },
    };

    if (statsWanted) {
        const s = await computeStats({
            scope: options.scope || "auto",
            fetchExtra: options.fetchExtra || [],
            forum: { pageSize: forumPageSize },
        });
        data.stats = s;
    }

    return data;
}
