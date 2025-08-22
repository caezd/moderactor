export function parsePagination(
    doc,
    { pageSizeOverride, defaultPageSize = 50 } = {}
) {
    const out = {
        current: undefined,
        total: undefined,
        page_size_detected: undefined,
    };

    // 1) Trouver le conteneur de pagination
    const pager =
        doc.querySelector(".pagination") ||
        doc.querySelector(".pagelink") ||
        doc.querySelector(".topic-actions .pagination");
    if (pager) {
        const txt = pager.textContent.replace(/\s+/g, " ").trim().toLowerCase();
        // "page 1 sur 750" (FR) ou "page 1 of 750" (EN)
        const m = txt.match(/page\s+(\d+)\s+(?:sur|of)\s+(\d+)/i);
        if (m) {
            out.current = Number(m[1]);
            out.total = Number(m[2]);
        }
    }

    // 2) Heuristique taille de page : (a) override
    let pageSize = Number.isFinite(pageSizeOverride)
        ? pageSizeOverride
        : undefined;

    // 3) (b) Script inline Forumactif : start = (start - 1) * 35;
    if (!pageSize && pager) {
        for (const s of pager.querySelectorAll("script")) {
            const code = s.textContent || "";
            const mm = code.match(/start\s*=\s*\(start\s*-\s*1\)\s*\*\s*(\d+)/);
            if (mm) {
                pageSize = Number(mm[1]);
                break;
            }
        }
    }

    // 4) (c) Déduction via les liens /f103p35-... /f103p70-...
    if (!pageSize && pager) {
        const ps = [];
        pager.querySelectorAll('a[href*="/f"][href*="p"]').forEach((a) => {
            const href = a.getAttribute("href") || "";
            const m2 = href.match(/\/f\d+p(\d+)-/i);
            if (m2) ps.push(Number(m2[1]));
        });
        // La plus petite valeur non nulle correspond généralement à la taille de page
        if (ps.length) {
            const minPos = Math.min(...ps.filter((n) => n > 0));
            if (Number.isFinite(minPos)) pageSize = minPos;
        }
    }

    // 5) Fallback
    if (!pageSize) pageSize = defaultPageSize;

    out.page_size_detected = pageSize;
    return out;
}
