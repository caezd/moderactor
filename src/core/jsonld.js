// src/core/jsonld.js
// Utilitaires de parsing JSON‑LD (BreadcrumbList, DiscussionForumPosting, …)
// - découplé du thème
// - extensible via un registre de handlers

/** Récupère tous les <script type="application/ld+json"> du document */
export function getJsonLdNodes(doc = document) {
    return Array.from(
        doc.querySelectorAll('script[type="application/ld+json"]')
    );
}

/** Parse un <script> en JSON JS (retourne [] si erreur) */
export function parseJsonLdScript(node) {
    try {
        const txt = (node?.textContent || "").trim();
        if (!txt) return [];
        const parsed = JSON.parse(txt);
        return normalizeJsonLdRoot(parsed);
    } catch {
        return [];
    }
}

/** Normalise la racine: peut être objet, tableau, ou contenir @graph */
export function normalizeJsonLdRoot(root) {
    const arr = Array.isArray(root) ? root : [root];
    // aplatis les @graph éventuels
    const items = [];
    for (const it of arr) {
        if (it && Array.isArray(it["@graph"])) items.push(...it["@graph"]);
        else items.push(it);
    }
    // filtre les objets valides ayant un @type
    return items.filter((x) => x && typeof x === "object" && x["@type"]);
}

/* ===========================
   Handlers par type JSON-LD
   =========================== */

/** Handler: BreadcrumbList → { type:'BreadcrumbList', items:[{position,url,name}] } */
export function extractBreadcrumbList(obj) {
    if (
        obj["@type"] !== "BreadcrumbList" ||
        !Array.isArray(obj.itemListElement)
    )
        return null;
    const items = obj.itemListElement
        .filter((li) => li && li["@type"] === "ListItem" && li.item)
        .map((li) => ({
            position: Number(li.position) || null,
            url: (li.item && (li.item["@id"] || li.item.url)) || null,
            name: (li.item && li.item.name) || null,
        }));
    return items.length ? { type: "BreadcrumbList", items } : null;
}

/** Handler: DiscussionForumPosting → objet normalisé du topic */
export function extractDiscussionForumPosting(obj) {
    if (obj["@type"] !== "DiscussionForumPosting") return null;
    const interaction = obj.interactionStatistic || {};
    const interactionCount = Number(interaction.userInteractionCount) || null;
    return {
        type: "DiscussionForumPosting",
        headline: obj.headline || null,
        name: obj.name || null,
        url: obj.url || null,
        datePublished: obj.datePublished || null,
        dateModified: obj.dateModified || null,
        pageStart: Number(obj.pageStart) || null,
        pageEnd: Number(obj.pageEnd) || null,
        author: obj.author?.name || null,
        author_url: obj.author?.url || null,
        publisher: obj.publisher?.name || null,
        logo: obj.publisher?.logo?.url || null,
        image: obj.image || null,
        interactionCount,
    };
}

/* ===========================
   Registre extensible
   =========================== */

const defaultHandlers = new Map([
    ["BreadcrumbList", extractBreadcrumbList],
    ["DiscussionForumPosting", extractDiscussionForumPosting],
]);

/** Permet d’enregistrer/écraser un handler pour un @type donné */
export function registerJsonLdHandler(type, handlerFn) {
    defaultHandlers.set(type, handlerFn);
}

/**
 * Parse tout le JSON‑LD de la page et renvoie un objet par type.
 * @param {Document} doc
 * @param {string[]=} onlyTypes liste de types à extraire (sinon tous ceux connus)
 * @returns {{ byType: Record<string, any[]>, all: any[] }}
 */
export function extractJsonLd(doc = document, onlyTypes) {
    const nodes = getJsonLdNodes(doc);
    const resultsByType = {};
    const allRaw = [];

    for (const node of nodes) {
        const items = parseJsonLdScript(node);
        for (const obj of items) {
            const t = Array.isArray(obj["@type"])
                ? obj["@type"][0]
                : obj["@type"];
            allRaw.push(obj);

            // Filtrage par types demandés (facultatif)
            if (onlyTypes && !onlyTypes.includes(t)) continue;

            // Si on a un handler, on l’applique
            const handler = defaultHandlers.get(t);
            if (handler) {
                const normalized = handler(obj);
                if (normalized) {
                    if (!resultsByType[t]) resultsByType[t] = [];
                    resultsByType[t].push(normalized);
                }
            }
        }
    }

    return { byType: resultsByType, all: allRaw };
}

/** Raccourcis pratiques pour les 2 types courants */
export function extractBreadcrumbs(doc = document) {
    return (
        extractJsonLd(doc, ["BreadcrumbList"]).byType["BreadcrumbList"] || []
    );
}

export function extractDiscussion(doc = document) {
    return (
        extractJsonLd(doc, ["DiscussionForumPosting"]).byType[
            "DiscussionForumPosting"
        ] || []
    );
}
