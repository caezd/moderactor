// ==UserPlugin==
// @name         Moderactor - Commentaires RP
// @description  Ajouter un bouton "Commenter" aux messages RP et poster dans un sujet dédié.
// @version      0.1.0
// ==/UserPlugin==
/*
 * =============================================================
 *  FICHIER : test.js (plugin utilisateur Moderactor)
 *  OBJET   : Ajout de commentaires "out of band" pour un RP (RolePlay)
 *
 *  FONCTIONNEMENT (vue d'ensemble) :
 *  1. Injection d'un bouton « Commenter » sous chaque message d'un sujet RP.
 *  2. Au clic : ouverture d'une mini‑fenêtre (overlay) ou redirection vers l'éditeur.
 *  3. Le message saisi est publié soit :
 *       - dans un sujet unique (mode "single_topic"),
 *       - dans un sujet dédié par RP (créé ou retrouvé automatiquement) (mode "per_topic").
 *  4. Chaque commentaire inclut un lien vers le message RP d'origine.
 *
 *  POINTS CLÉS D'IMPLÉMENTATION :
 *  - Configuration centralisée dans l'objet CFG.
 *  - Couche API (objet API) s'appuyant sur Moderactor pour créer / répondre aux sujets.
 *  - Fonctions utilitaires DOM pour récupérer l'ID de message et fabriquer un permalink.
 *  - Overlay minimaliste auto‑contenu évitant de quitter la page.
 *
 *  LIMITES / REMARQUES TECHNIQUES :
 *  - La fonction `topicFromHref` est utilisée (normalizeCreatedTopicFromBridge, findCommentThreadViaTag) mais n'est PAS définie dans ce fichier. Prévoir soit son import, soit son implémentation (ex: parsing /t(\d+)-). Sans elle, certaines résolutions d'URL peuvent échouer silencieusement.
 *  - Dans `ensureCommentThread`, l'appel est `API.findCommentThreadViaTag(...)` alors que la fonction globale définie est `findCommentThreadViaTag` (hors objet API). Cela provoquera une erreur d'exécution (TypeError: API.findCommentThreadViaTag is not a function). Deux options :
 *        a) Renommer l'appel en `await findCommentThreadViaTag({ topicId: ..., ... })` (mais signatures différentes ici),
 *        b) Intégrer la fonction au sein de l'objet API et aligner la signature.
 *    → Pour l'instant, on laisse tel quel et on marque un TODO.
 *  - Aucune gestion d'i18n (libellés en français en dur).
 *  - Pas de throttling / batch sur le futur compteur de commentaires.
 *  - `sessionStorage` utilisé pour pré-remplir l'éditeur externe (à implémenter côté page d'édition si besoin).
 *
 *  SÉCURITÉ / ROBUSTESSE :
 *  - Pas de sanitation côté client (on s'appuie sur l'éditeur / backend).
 *  - Suppose que l'utilisateur est authentifié et autorisé à poster.
 *  - En cas d'échec de création du sujet de commentaires, une deuxième recherche par titre est tentée.
 *
 *  EXTENSIONS POSSIBLES :
 *  - Système de cache local des IDs de sujets de commentaires.
 *  - Indicateur du nombre de commentaires déjà postés pour chaque message (avec batching).
 *  - Paramétrage avancé (labels, sélecteurs de posts) via un objet global ou un panneau d'options.
 *
 *  (Documentation ajoutée le 2025‑08‑26)
 * =============================================================
 */

/**
 * CONFIGURATION PRINCIPALE
 * mode :
 *   - "single_topic" : tous les commentaires vont dans un sujet unique (CFG.single_topic_id)
 *   - "per_topic"    : un sujet de commentaires distinct est créé / retrouvé pour chaque RP.
 * comments_forum_id : ID du forum où stocker/chercher les sujets de commentaires (mode per_topic).
 * single_topic_id   : ID du sujet unique (mode single_topic).
 * use_overlay       : true => popup interne ; false => redirection éditeur natif.
 * button_label/class: aspects UI pour le bouton injecté.
 * comment_title_template(topic) : génère un titre déterministe pour retrouver le sujet.
 * new_thread_intro(rpTopic)     : contenu initial inséré lors de la création d'un nouveau sujet commentaire.
 */
const CFG = {
    // Mode de routage des commentaires
    mode: /** "single_topic" | "per_topic" */ "per_topic",

    // Forum cible où stocker les commentaires
    comments_forum_id: 4, // <-- change-moi

    // Sujet unique (si mode = "single_topic")
    single_topic_id: 345, // <-- change-moi

    // UI
    use_overlay: true, // false => redirection à l’éditeur
    button_label: "Commenter",
    button_class: "mrp-comment-btn",

    // Titres déterministes pour retrouver le sujet de commentaires d’un RP
    comment_title_template: (topic) => `${topic.title} • Commentaires`,

    // Texte d’intro auto dans un nouveau sujet de commentaires
    new_thread_intro: (rpTopic) =>
        `[b]Commentaires pour ce RP[/b]\nRP : ${rpTopic.url}\n\n— Postez ici vos réactions aux messages, sans polluer le fil RP.`,
};

// Permettre des overrides runtime (ex: window.MRP_CONFIG = { use_overlay:false })
if (window.MRP_CONFIG && typeof window.MRP_CONFIG === "object") {
    Object.assign(CFG, window.MRP_CONFIG);
}

/**
 * I18N minimal – possibilité d'étendre.
 */
const I18N = {
    fr: {
        comment_button: CFG.button_label || "Commenter",
        overlay_title: "Commenter ce message",
        cancel: "Annuler",
        send: "Envoyer",
        missing_post_id: "ID du message introuvable.",
        posted_toast: "Commentaire publié !",
    },
};
const lang = "fr"; // futur: détection navigator.language
const T = (k) => (I18N[lang] && I18N[lang][k]) || k;

/**
 * HELPERS DOM / CONTEXTE FORUMACTIF
 * Sélecteurs pratiques ($, $$) + extraction contexte de page + utilitaires posts.
 */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

/**
 * Récupère informations de contexte sur une page de sujet / forum.
 * @returns {{forumId:string|null, topicId:string|null, title:string, url:string}}
 */
function getPageContext() {
    // T = id du topic, F = id du forum, ancre message #pID
    const u = new URL(location.href);
    const topicId = (u.pathname.match(/\/t(\d+)-/) || [])[1] || null;
    const forumId = (u.pathname.match(/\/f(\d+)-/) || [])[1] || null;
    const title = document.title.replace(/^\s*.*? - /, "").trim();
    const url = location.href;
    return { forumId, topicId, title, url };
}

/**
 * Extrait l'ID numérique d'un message à partir de son élément DOM.
 * Gère différentes variantes de thèmes / structures (id="p123", ancres internes, data-post-id).
 * @param {HTMLElement} postEl
 * @returns {string|null}
 */
function getPostIdFromNode(postEl) {
    // Beaucoup de thèmes utilisent id="p12345"
    const idAttr = postEl.getAttribute("id") || "";
    const byId = idAttr.match(/^p(\d+)$/);
    if (byId) return byId[1];

    // fallback: cherches un anchor interne
    const a = postEl.querySelector('a[href*="#p"]');
    if (a) {
        const m = a.getAttribute("href").match(/#p(\d+)/);
        if (m) return m[1];
    }
    // dernier recours: data-post-id custom si tu l’ajoutes côté thème
    return postEl.dataset.postId || null;
}

/**
 * Construit un permalink canonique vers un message précis.
 * @param {string} topicUrl URL du sujet courant (peut contenir un hash).
 * @param {string|number} postId ID du message (numérique sans le préfixe p).
 * @returns {string}
 */
function buildPermalink(topicUrl, postId) {
    // Normaliser l’URL canonical du sujet (enlever ?view=newest etc.)
    const clean = topicUrl.split("#")[0];
    return `${clean}#p${postId}`;
}

/**
 * Crée et affiche un overlay minimaliste avec textarea et boutons.
 * @param {Object} params
 * @param {string} [params.title]
 * @param {(body:string)=>Promise<void>|void} params.onSubmit Callback asynchrone déclenchée lors de l'envoi.
 */
function openOverlay({ title = "Commenter ce message", onSubmit }) {
    const wrap = document.createElement("div");
    wrap.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,.4); z-index: 9999;
    display: grid; place-items: center; padding: 16px;
  `;
    const card = document.createElement("div");
    card.style.cssText = `
    background: var(--fa-bg, #fff); color: inherit; width: min(680px, 100%);
    border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.2); padding: 16px; max-height: 80vh; display:flex; flex-direction:column; gap:12px;
  `;
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-label", title);
    card.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
            <h3 style="margin:0;font-size:1.1rem">${title}</h3>
            <button type="button" data-close aria-label="Close" style="background:transparent;border:none;font-size:20px;cursor:pointer">✕</button>
        </div>
        <textarea data-body rows="8" style="width:100%;resize:vertical" aria-label="Comment"></textarea>
        <div style="display:flex;gap:8px;justify-content:flex-end">
            <button type="button" data-cancel>${T("cancel")}</button>
            <button type="button" data-send style="padding:.5rem .8rem;border-radius:8px;background:#0ea5e9;color:white;border:none;cursor:pointer">${T(
                "send"
            )}</button>
        </div>
    `;
    wrap.appendChild(card);
    document.body.appendChild(wrap);

    const close = () => wrap.remove();
    card.querySelector("[data-close]").onclick = close;
    card.querySelector("[data-cancel]").onclick = close;
    card.querySelector("[data-send]").onclick = async () => {
        const body = card.querySelector("[data-body]").value.trim();
        if (!body) return;
        try {
            await onSubmit(body);
            close();
        } catch (e) {
            alert(e?.message || e);
        }
    };
    // focus management & ESC
    const textarea = card.querySelector("[data-body]");
    textarea.focus();
    const escListener = (ev) => {
        if (ev.key === "Escape") {
            close();
            document.removeEventListener("keydown", escListener);
        }
    };
    document.addEventListener("keydown", escListener);
}

/**
 * Couche API encapsulant les appels Moderactor nécessaires : création de sujet, réponse, recherche.
 * NOTE: suppose la présence globale de `window.Moderactor` avec les méthodes forum()/topic().
 */
const API = {
    /**
     * Crée un nouveau sujet dans un forum.
     * @param {{forumId:number|string, subject:string, message:string}} payload
     * @returns {Promise<{id:number, url:string|null, title:string}>}
     * @throws {Error} si le sujet ne peut pas être retrouvé après tentative de création.
     */
    async createTopic({ forumId, subject, message }) {
        // 1) POST de création
        const [res] = await Moderactor.forum(forumId).post({
            subject,
            message,
        });
        console.log("[createTopic] bridge:", res);

        // 2) Essayer d’identifier l’URL et l’ID du sujet
        //    - priorité au lien /tID-slug
        //    - sinon viewtopic?start=&t=ID#post
        //    - sinon premier href qui matche /t ou viewtopic
        const topicHref = res?.links?.topic || res?.href || "";

        // 3) Extraire l’ID du topic depuis l’URL OU le bridge.ids
        //    (/t123-..., ou ...?t=123, ou fallback)
        const idFromUrl =
            topicHref.match(/\/t(\d+)-/)?.[1] ||
            topicHref.match(/[?&]t=(\d+)/)?.[1] ||
            null;

        const topicId = Number(res?.ids?.topic_id || idFromUrl || 0) || null;

        // 4) Choisir l’URL “la plus propre” à retourner
        //    - si on a déjà un /tID-slug, on garde
        //    - si on n’a qu’un viewtopic, on retourne tel quel (ça reste cliquable)
        let url = null;
        if (/^\/t\d+-/i.test(topicHref)) {
            url = topicHref;
        } else if (/\/viewtopic\?/i.test(topicHref)) {
            url = topicHref;
        } else {
            // Dernier filet: cherche n'importe quel <a> /t... dans la page
            try {
                const doc =
                    res.doc ||
                    new DOMParser().parseFromString(res.raw || "", "text/html");
                url =
                    doc?.querySelector('a[href^="/t"]')?.getAttribute("href") ||
                    doc
                        ?.querySelector('a[href*="viewtopic"]')
                        ?.getAttribute("href") ||
                    null;
            } catch {}
        }

        // 5) Succès si on a l’ID; le titre de retour = sujet demandé
        if (topicId) {
            return {
                id: topicId,
                url: url || null,
                title: subject,
            };
        }

        // 6) Fallback: recherche par titre si le bridge n’a pas été concluant
        const again = await API.findTopicByTitle({
            forumId,
            title: subject,
        });
        if (again) return again;

        // 7) Erreur claire
        throw new Error("Sujet de commentaires non retrouvé après création.");
    },

    /**
     * Poste une réponse dans un sujet existant.
     * @param {{topicId:number|string, message:string}} payload
     * @returns {Promise<any>}
     */
    async reply({ topicId, message }) {
        if (window.Moderactor) {
            // Ex: Moderactor.post([topicId]).reply({ message })
            return await Moderactor.topic([topicId]).post({ message });
        }
        throw new Error("Moderactor.post() indisponible: adapte API.reply()");
    },

    /**
     * Recherche un sujet par titre exact dans un forum.
     * (Utilise si possible une méthode Moderactor côté bridge, sinon fallback HTML.)
     * @param {{forumId:number|string, title:string}} params
     * @returns {Promise<{id:string, url:string, title:string}|null>}
     */
    async findTopicByTitle({ forumId, title }) {
        if (window.Moderactor?.forum) {
            // Idéalement : Moderactor.forum([forumId]).findByTitle(title)
            const found = await Moderactor.forum([forumId]).findByTitle?.(
                title
            );
            if (found) return found; // {id, url, title}
        }
        // Fallback ultra simple et léger : essaye la première page du forum et cherche un lien dont le texte correspond
        const res = await fetch(`/f${forumId}p1-d`, {
            credentials: "same-origin",
        });
        if (!res.ok) return null;
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        const link = Array.from(
            doc.querySelectorAll(
                'a[href*="/t"][class*="topictitle"], a.topictitle'
            )
        ).find((a) => a.textContent.trim() === title.trim());
        if (!link) return null;
        const m = link.getAttribute("href").match(/\/t(\d+)-/);
        if (!m) return null;
        return { id: m[1], url: link.href, title: link.textContent.trim() };
    },
};

/**
 * Normalise un objet de retour de création (bridge Moderactor) vers {id,url,title}.
 * @param {any} res Réponse brute du bridge.
 * @param {string} fallbackTitle Titre utilisé si absent.
 * @returns {{id:number, url:string|null, title:string|null}|null}
 */
function normalizeCreatedTopicFromBridge(res, fallbackTitle) {
    if (!res) return null;

    // 1) Essaye via /tID-slug
    const href = res?.links?.topic || res?.href || "";
    let t = topicFromHref(href);

    // 2) Si on n’a qu’un viewtopic?…&t=ID#post
    if (!t && href.includes("/viewtopic?")) {
        const idFromQuery = href.match(/[?&]t=(\d+)/)?.[1];
        if (idFromQuery) {
            t = {
                id: Number(idFromQuery),
                url: href,
                title: fallbackTitle || null,
            };
        }
    }

    // 3) Bridge.ids
    if (!t && res?.ids?.topic_id) {
        t = {
            id: Number(res.ids.topic_id),
            url: href || null,
            title: fallbackTitle || null,
        };
    }

    return t || null;
}

/**
 * Tente de retrouver un sujet de commentaires via la page de tag #t{topicId}.
 * @param {{topicId:number|string, matchText?:RegExp}} params
 * @returns {Promise<{id:number, url:string, title?:string}|null>}
 */
async function findCommentThreadViaTag({ topicId, matchText = /comment/i }) {
    // /tags/t123  → page listant les sujets taggés #t123
    const resp = await Moderactor.adapter.get(`/tags/t${topicId}`);
    if (!resp?.ok) return null;

    // 1) Tous les liens vers /t{ID}-...
    const sel = `a[href^="/t${topicId}-"]`;
    const links = Array.from(resp.doc.querySelectorAll(sel));

    // 2) Garde le(s) lien(s) dont le texte contient “commentaire(s)”
    const filtered =
        links.filter((a) => matchText.test(a.textContent || "")) || links;

    const a = filtered[0] || links[0];
    return a ? topicFromHref(a.getAttribute("href"), a) : null;
}

/**
 * Garantit l'existence (ou retrouve) le sujet de commentaires pour un RP courant.
 * MODE per_topic uniquement. Crée le sujet si manquant.
 * NOTE: BUG POTENTIEL → utilisation de API.findCommentThreadViaTag inexistant.
 * @param {{id:string, forumId:string, title:string, url:string}} rp
 * @returns {Promise<{id:number|string, url:string|null, title:string}>}
 */
async function ensureCommentThread(rp) {
    const title = CFG.comment_title_template(rp);
    // 0) Cache mémoire pour éviter re‑créations simultanées
    if (!ensureCommentThread._cache) ensureCommentThread._cache = new Map();
    const cache = ensureCommentThread._cache;
    if (cache.has(rp.id)) return cache.get(rp.id);

    const work = (async () => {
        // 1) Chercher via tag (si accessible)
        try {
            const viaTag = await findCommentThreadViaTag({ topicId: rp.id });
            if (viaTag?.id) return viaTag;
        } catch {}
        // 2) Chercher via titre déterministe
        const existing = await API.findTopicByTitle({
            forumId: CFG.comments_forum_id,
            title,
        });
        if (existing) return existing;
        // 3) Créer
        const created = await API.createTopic({
            forumId: CFG.comments_forum_id,
            subject: title,
            message: CFG.new_thread_intro(rp),
        });
        if (created?.id) return created;
        // 4) Re‑cherche finale
        const again = await API.findTopicByTitle({
            forumId: CFG.comments_forum_id,
            title,
        });
        if (again) return again;
        throw new Error("Sujet de commentaires non retrouvé après création.");
    })();

    cache.set(rp.id, work);
    try {
        const result = await work;
        cache.set(rp.id, result); // remplacer la Promise par la valeur
        return result;
    } catch (e) {
        cache.delete(rp.id);
        throw e;
    }
}

/**
 * Poste un commentaire (ajoute le lien vers le message RP ciblé).
 * @param {{rp:{id:string,forumId:string,title:string,url:string}, postPermalink:string, body:string}} params
 * @returns {Promise<any>}
 */
async function postComment({ rp, postPermalink, body }) {
    if (CFG.mode === "single_topic") {
        return API.reply({
            topicId: CFG.single_topic_id,
            message: `[url=${postPermalink}]→ Voir le message RP[/url]\n\n${body}`,
        });
    }

    // per_topic
    const thread = await ensureCommentThread(rp);
    return API.reply({
        topicId: thread.id,
        message: `[url=${postPermalink}]→ Voir le message RP[/url]\n\n${body}`,
    });
}

/**
 * Injecte les boutons d'action sous chaque message du sujet courant.
 * - Récupère le contexte (topicId) puis parcourt les conteneurs posts.
 * - Évite la duplication si déjà monté.
 */
function mountButtons() {
    const ctx = getPageContext();
    if (!ctx.topicId) return; // pas sur une page de sujet

    // Définis comment repérer les blocs "post"
    const postNodes =
        $$(".post, .postrow, .post-container, [id^='p'][class*='post']") || [];

    for (const node of postNodes) {
        if (node.querySelector(`.${CFG.button_class}`)) continue;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = CFG.button_class;
        btn.textContent = T("comment_button");
        btn.style.cssText = `
      margin-left: .5rem; padding: .25rem .5rem; border-radius: 8px;
      background: #e2e8f0; border: 1px solid #cbd5e1; cursor: pointer; font-size: .85rem;
    `;
        btn.setAttribute("aria-label", T("comment_button"));

        // Où insérer ? En bas du post, près des actions
        const actions = node.querySelector(
            ".post-options, .post-buttons, .post-actions, .postbody"
        );
        (actions || node).appendChild(btn);

        btn.addEventListener("click", async () => {
            const postId = getPostIdFromNode(node);
            if (!postId) return alert(T("missing_post_id"));
            const permalink = buildPermalink(location.href, postId);

            const rp = {
                id: ctx.topicId,
                forumId: ctx.forumId,
                title: ctx.title,
                url: location.href.split("#")[0],
            };

            if (!CFG.use_overlay) {
                // OPTION SIMPLE : rediriger l’utilisateur vers l’éditeur standard,
                // en pré-remplissant le champ message via un hash ou un stockage temporaire.
                const prefill = `[url=${permalink}]→ Voir le message RP[/url]\n\n`;
                sessionStorage.setItem("__mrp_prefill", prefill); // Ton loader côté éditeur peut récupérer ceci
                if (CFG.mode === "single_topic") {
                    location.href = `/post?mode=reply&t=${CFG.single_topic_id}`;
                } else {
                    // Assure-toi que le thread existe avant de rediriger
                    const thr = await ensureCommentThread(rp);
                    location.href = `/post?mode=reply&t=${thr.id}`;
                }
                return;
            }

            // OPTION POPUP : composer et envoyer sans quitter la page
            openOverlay({
                title: T("overlay_title"),
                onSubmit: async (body) => {
                    await postComment({ rp, postPermalink: permalink, body });
                    // Optionnel : toast
                    try {
                        // Si tu as une UI Moderactor de toast
                        window.Moderactor?.ui?.toast?.(T("posted_toast"));
                    } catch (_) {}
                },
            });
        });
    }
}

/**
 * Parse un href /t1234-... et renvoie {id, url, title?}
 * @param {string} href
 * @param {HTMLAnchorElement} [a]
 * @returns {{id:number,url:string,title?:string}|null}
 */
function topicFromHref(href, a) {
    if (!href) return null;
    const m = href.match(/\/t(\d+)-/);
    if (!m) return null;
    return {
        id: Number(m[1]),
        url: href,
        title: a?.textContent?.trim() || null,
    };
}

/**
 * (FONCTION EXPÉRIMENTALE) Compte approximativement les commentaires contenant le permalink.
 * Stratégie : charge la première page du sujet de commentaires et compte les occurrences textuelles.
 * LIMITES :
 *   - Faux positifs si plusieurs messages collent le même lien.
 *   - Incomplet si >1 page ou pagination.
 *   - Coût = 1 requête par message (DOIT être batché/optimisé si activé).
 * @param {string} permalink Lien (#pID) du message RP.
 * @param {{id:string,forumId:string,title:string,url:string}} rp Contexte du RP.
 * @returns {Promise<number>} Nombre estimé de commentaires.
 */
async function fetchCommentCountFor(permalink, rp) {
    // Idée : charger la première page du sujet de commentaires et compter
    // (ou mieux : prévoir un endpoint Moderactor qui filtre côté serveur si tu as un worker)
    console.log(rp);
    const thr =
        CFG.mode === "single_topic"
            ? { id: CFG.single_topic_id }
            : await ensureCommentThread(rp);

    const res = await fetch(`/t${thr.id}-?page=1`, {
        credentials: "same-origin",
    });
    if (!res.ok) return 0;
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const posts = Array.from(
        doc.querySelectorAll(".post, .postrow, .post-container")
    );
    return posts.reduce((n, p) => {
        const txt = p.textContent || "";
        return n + (txt.includes(permalink) ? 1 : 0);
    }, 0);
}

/**
 * Point d'entrée : attend le DOM prêt puis monte les boutons.
 */
(function init() {
    document.addEventListener("DOMContentLoaded", mountButtons, {
        once: true,
    });
})();

// Optionnel: exposer certaines fonctions pour debug (désactiver en prod si besoin)
// window.__MRP_DEBUG = { getPageContext, ensureCommentThread, postComment };
