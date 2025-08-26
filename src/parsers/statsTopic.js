import { parseFromUrl } from "../core/utils.js";
import { parsePagination } from "./pagination.js";

function countReplies(doc) {
    const candidates = [".postbody"];
    let max = 0;
    for (const sel of candidates) {
        const c = doc.querySelectorAll(sel).length;
        max = Math.max(max, c);
    }
    // si on trouve 0, on ne renvoie rien (undefined)
    return max || undefined;
}

export function parseTopicStats(
    doc,
    { pageSizeOverride, defaultPageSize = 25 } = {}
) {
    const title =
        discussion?.headline ||
        doc.querySelector("h1.page-title")?.textContent?.trim() ||
        null;
    const canonical = doc.querySelector('link[rel="canonical"]')?.href || null;

    const meta = parseFromUrl(canonical);
    const url = canonical || null;
    const topic_id = meta.id || null;

    const repliesListCount = countReplies(doc);

    const pagination = parsePagination(doc, {
        pageSizeOverride,
        defaultPageSize,
    });
    const replies_estimated =
        Number.isFinite(pagination.total) &&
        Number.isFinite(pagination.page_size_detected)
            ? pagination.total * pagination.page_size_detected
            : undefined;

    return {
        id: topic_id,
        url,
        slug: meta.slug || null,
        title,
        pagination: {
            current: pagination.current,
            total: pagination.total,
            page_size: pagination.page_size_detected,
            replies_estimated: replies_estimated, // estimation globale par pagination
            replies_visible: repliesListCount || undefined, // comptage réel de la page courante
        },
        replies_count: replies_estimated ?? repliesListCount,
    };
}
