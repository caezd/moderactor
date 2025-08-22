import { getDirectText, idsFromHref } from "../core/utils.js";
import { extractBreadcrumbs } from "../core/jsonld.js";
import { parsePagination } from "./pagination.js";

// Compte les lignes de sujets (selon plusieurs templates)
const countTopics = (doc) => {
    const candidates = [
        "tr.topic", // phpBB3
        "tr.rowtopic", // anciens thèmes
        "li.topic", // ModernBB/PunBB custom
        "div.topic", // variantes
        "div.topics li", // listes
        "a.topictitle", // phpBB-like
        ".topicslist_row.row", // fallback parfois utile
    ];
    let max = 0;
    for (const sel of candidates) {
        const c = doc.querySelectorAll(sel).length;
        max = Math.max(max, c);
    }
    // si on trouve 0, on ne renvoie rien (undefined)
    return max || undefined;
};

// Récupère des métadonnées (titre, fil d’Ariane)
const readForumMeta = (doc) => {
    // Titre de la page
    const titleEl = doc.querySelector("h1.page-title, h1, .page-title");
    const name =
        getDirectText(titleEl) ||
        (titleEl?.textContent || "").trim() ||
        undefined;

    // id forum via canonical, breadcrumb ou premier lien /fXX-
    let forum_id;
    const canonical =
        doc.querySelector('link[rel="canonical"]')?.getAttribute("href") || "";
    forum_id = idsFromHref(canonical).forum_id;

    // lien forum courant (utile pour re-naviguer)
    const forumHref = canonical;

    return {
        name,
        forum_id: Number.isFinite(forum_id) ? forum_id : undefined,
        forumHref,
    };
};

// Détection permission (peut varier)
// Grossièrement selon la présence d’un bouton "Nouveau", "Nouveau sujet" ou d’un formulaire
const readPermissions = (doc) => {
    const canPost =
        !!doc.querySelector(
            'a[href*="mode=newtopic"], a[href*="post?f="], .button-newtopic, .btn-newtopic'
        ) ||
        !!doc.querySelector(
            'form[action*="mode=newtopic"], form[action*="/post"]'
        );

    return { can_post: canPost };
};

export function parseForumStats(
    doc,
    { pageSizeOverride, defaultPageSize = 50 } = {}
) {
    const meta = readForumMeta(doc);
    const topicsListCount = countTopics(doc);
    const perms = readPermissions(doc);

    const pagination = parsePagination(doc, {
        pageSizeOverride,
        defaultPageSize,
    });
    const topics_estimated =
        Number.isFinite(pagination.total) &&
        Number.isFinite(pagination.page_size_detected)
            ? pagination.total * pagination.page_size_detected
            : undefined;

    return {
        id: meta.forum_id,
        name: meta.name,
        topics_count: topics_estimated ?? topicsListCount,
        href: meta.forumHref || undefined,
        pagination: {
            current: pagination.current,
            total: pagination.total,
            page_size: pagination.page_size_detected,
            topics_estimated: topics_estimated, // estimation globale par pagination
            topics_visible: topicsListCount || undefined, // comptage réel de la page courante
        },
        permissions: perms,
    };
}
