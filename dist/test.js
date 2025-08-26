// ==UserPlugin==
// @name         Moderactor - Commentaires RP
// @description  Ajouter un bouton "Commenter" aux messages RP et poster dans un sujet dédié.
// @version      0.1.0
// ==/UserPlugin==

/**
 * CONFIG
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
    comment_title_template: (topic) =>
        `[Commentaires] t:${topic.id} • ${topic.title}`,

    // Texte d’intro auto dans un nouveau sujet de commentaires
    new_thread_intro: (rpTopic) =>
        `[b]Commentaires pour ce RP[/b]\nRP : ${rpTopic.url}\n\n— Postez ici vos réactions aux messages, sans polluer le fil RP.`,
};

/**
 * Helpers Forumactif
 */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

// Récupération du contexte de page (Forumactif)
function getPageContext() {
    // T = id du topic, F = id du forum, ancre message #pID
    const u = new URL(location.href);
    const topicId = (u.pathname.match(/\/t(\d+)-/) || [])[1] || null;
    const forumId = (u.pathname.match(/\/f(\d+)-/) || [])[1] || null;
    const title = document.title.replace(/^\s*.*? - /, "").trim();
    const url = location.href;
    return { forumId, topicId, title, url };
}

// ID de message depuis le DOM post (ModernBB/Phpbb2/Phpbb3 varient un peu)
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

// Lien propre vers un message
function buildPermalink(topicUrl, postId) {
    // Normaliser l’URL canonical du sujet (enlever ?view=newest etc.)
    const clean = topicUrl.split("#")[0];
    return `${clean}#p${postId}`;
}

/**
 * UI Overlay minimaliste
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
    card.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
      <h3 style="margin:0;font-size:1.1rem">${title}</h3>
      <button type="button" data-close style="background:transparent;border:none;font-size:20px;cursor:pointer">✕</button>
    </div>
    <textarea data-body rows="8" style="width:100%;resize:vertical"></textarea>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button type="button" data-cancel>Annuler</button>
      <button type="button" data-send style="padding:.5rem .8rem;border-radius:8px;background:#0ea5e9;color:white;border:none;cursor:pointer">Envoyer</button>
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
}

const API = {
    // Créer un sujet dans un forum
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

    // Répondre dans un sujet
    async reply({ topicId, message }) {
        if (window.Moderactor) {
            // Ex: Moderactor.post([topicId]).reply({ message })
            return await Moderactor.topic([topicId]).post({ message });
        }
        throw new Error("Moderactor.post() indisponible: adapte API.reply()");
    },

    // Lister / trouver un topic par titre dans un forum (pour éviter les requêtes lourdes côté client, utilise un helper Moderactor si tu l’as)
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
 * Logique "par sujet RP" : garantir/obtenir le sujet de commentaires
 */
async function ensureCommentThread(rp) {
    const title = CFG.comment_title_template(rp);
    // 1) Chercher
    const existing = await API.findTopicByTitle({
        forumId: CFG.comments_forum_id,
        title,
    });
    if (existing) return existing;

    // 2) Créer
    const created = await API.createTopic({
        forumId: CFG.comments_forum_id,
        subject: title,
        message: CFG.new_thread_intro(rp),
    });
    // Normalise le retour : { id, url, title }
    if (!created?.id) {
        // Si Moderactor renvoie autre chose, force une 2e passe de recherche
        const again = await API.findTopicByTitle({
            forumId: CFG.comments_forum_id,
            title,
        });
        if (again) return again;
        throw new Error("Sujet de commentaires non retrouvé après création.");
    }
    return created;
}

/**
 * Poster un commentaire (inclut auto-lien vers le message RP).
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
 * Intégration UI : un bouton sous chaque message
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
        btn.textContent = CFG.button_label;
        btn.style.cssText = `
      margin-left: .5rem; padding: .25rem .5rem; border-radius: 8px;
      background: #e2e8f0; border: 1px solid #cbd5e1; cursor: pointer; font-size: .85rem;
    `;

        // Où insérer ? En bas du post, près des actions
        const actions = node.querySelector(
            ".post-options, .post-buttons, .post-actions, .postbody"
        );
        (actions || node).appendChild(btn);

        btn.addEventListener("click", async () => {
            const postId = getPostIdFromNode(node);
            if (!postId) return alert("ID du message introuvable.");
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
                title: "Commenter ce message",
                onSubmit: async (body) => {
                    await postComment({ rp, postPermalink: permalink, body });
                    // Optionnel : toast
                    try {
                        // Si tu as une UI Moderactor de toast
                        window.Moderactor?.ui?.toast?.("Commentaire publié !");
                    } catch (_) {}
                },
            });
        });
    }
}

/**
 * (Avancé) — Compteur de commentaires par message
 * Sans BDD, on peut approximer en comptant les posts dans le thread qui contiennent le lien #pID.
 * ATTENTION : ça veut dire 1 requête par post => à garder pour une version future avec batching.
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
 * Bootstrap
 */
(function init() {
    document.addEventListener("DOMContentLoaded", mountButtons, {
        once: true,
    });
})();
