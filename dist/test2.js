(async function () {
    "use strict";

    /**
     * Configuration des commentaires
     */

    const CFG = {
        allowed_forums: [1, 3],
        mode: "per_topic",
        comments_forum_id: 4,
        // Sujet unique si mode = "single_topic"
        single_topic_id: null,
        use_overlay: true, // false => redirection éditeur
        ui: {
            comment_button: "Commenter",
            overlay_title: "Commenter ce message",
            cancel: "Annuler",
            send: "Envoyer",
            missing_post_id: "ID du message introuvable.",
            posted_toast: "Commentaire publié !",
        },

        // Construire le titre du sujet de commentaires (deterministe)
        comment_title_template: (rp) => `${rp.title} • Commentaires`,

        // Message d'introduction lors de la création d'un nouveau fil de commentaires
        new_thread_intro: (rp) => {
            console.log(rp);
            return `[b]Commentaires pour ce RP[/b]\nRP : ${rp.url} ${rp.tag}\n\n— Postez ici vos réactions aux messages, sans polluer le fil RP.`;
        },

        format_comment: ({ rp, postPermalink, body, selection }) => {
            const quoted = selection
                ? `\n[quote]${selection.trim()}[/quote]\n`
                : "";
            return `[url=${postPermalink}]→ Voir le message RP[/url]${quoted}\n${body}`;
        },
        debug: true, // par défaut, false
    };

    const env = await Moderactor.env();

    if (window.MRP_CONFIG && typeof window.MRP_CONFIG === "object") {
        Object.assign(CFG, window.MRP_CONFIG);
    }

    const I18N = {
        fr: {
            comment_button: CFG.ui.comment_button || "Commenter",
            overlay_title: CFG.ui.overlay_title || "Commenter ce message",
            cancel: CFG.ui.cancel || "Annuler",
            send: CFG.ui.send || "Envoyer",
            missing_post_id:
                CFG.ui.missing_post_id || "ID du message introuvable.",
            posted_toast: CFG.ui.posted_toast || "Commentaire publié !",
        },
        en: {
            comment_button: "Comment",
            overlay_title: "Comment on this post",
            cancel: "Cancel",
            send: "Send",
            missing_post_id: "Post ID not found.",
            posted_toast: "Comment posted!",
        },
        es: {
            comment_button: "Comentar",
            overlay_title: "Comentar este mensaje",
            cancel: "Cancelar",
            send: "Enviar",
            missing_post_id: "ID del mensaje no encontrado.",
            posted_toast: "¡Comentario publicado!",
        },
    };
    const lang =
        env.user.lang || window.navigator.language.split("-")[0] || "fr"; // or détection navigator.language
    const T = (k) => (I18N[lang] && I18N[lang][k]) || k;

    /**
     * Helpers pour le dom et contexte
     */
    const $ = (sel, ctx = document) => ctx.querySelector(sel);
    const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

    const getPageContext = () => {
        if (CFG.debug) console.log(env);
        try {
            if (env?.schema?.breadcrumbs) {
                const crumbs = env.schema.breadcrumbs.items || [];
                let forumId = null,
                    topicId = null;
                for (const it of crumbs) {
                    if (!it?.url) continue;
                    const mT = it.url.match(/\/t(\d+)-/);
                    const mF = it.url.match(/\/f(\d+)-/);
                    if (mT) topicId = mT[1];
                    if (mF) forumId = mF[1];
                }
                const out = {
                    forumId: forumId || parseForumIdFromLocation(),
                    topicId: topicId || parseTopicIdFromLocation(),
                    title: document.title.replace(/^\s*.*? - /, "").trim(),
                    url: location.href.split("#")[0],
                };
                return out;
            }
        } catch (_) {
            console.error("Error while getting page context:", _);
        }
    };

    const buildPermalink = (topicUrl, postId) => {
        return `${String(topicUrl).split("#")[0]}#p${postId}`;
    };

    const getPostIdFromNode = (postEl) => {
        const idAttr = postEl.getAttribute("id") || "";
        const byId = idAttr.match(/^p(\d+)$/);
        if (byId) return byId[1];
        const a = postEl.querySelector('[class*="post--"]');
        if (a) {
            const m = a.getAttribute("href").match(/#p(\d+)/);
            if (m) return m[1];
        }
        return postEl.dataset.postId || null;
    };

    /**
     * API basée sur Moderactor
     */

    const API = {
        async createTopic({ forumId, subject, message }) {
            if (CFG.debug)
                console.log("[API.createTopic]", { forumId, subject, message });
            const res = await Moderactor.forum(forumId).post({
                subject,
                message,
            });
            if (CFG.debug) console.log("[API.createTopic] response:", res);
        },
        async reply({ topicId, message }) {
            if (CFG.debug)
                console.log("[API.reply]", {
                    topicId,
                    messageLength: message?.length,
                });
            const res = await Moderactor.topic(topicId).post({ message });
            if (CFG.debug) console.log("[API.reply] response:", res);
            return res;
        },
        async findTopicByTitle() {
            console.log("[API.findTopicByTitle] à faire");
        },
        async findCommentThreadViaTag({ topicId }) {
            const resp = await Moderactor.adapter.get(`/tags/t${topicId}`);
            if (!resp?.ok) return null;
            const tagLink = resp.doc.querySelector(
                `a[href="/tags/t${topicId}"]`
            );
            if (!tagLink) return null;
            // Cherche le lien de topic le plus proche
            let a =
                tagLink.closest('a[href^="/t"]') ||
                tagLink.parentElement.querySelector('a[href^="/t"]');
            if (a && a.getAttribute("href").match(/\/t(\d+)-/)) {
                console.log("[API.findCommentThreadViaTag]", { topicId });
                return topicFromHref(a.getAttribute("href"), a);
            }
            return null;
        },
    };

    const ensureCommentTopic = async (rp) => {
        const title = CFG.comment_title_template(rp);
        console.log("[ensureCommentTopic]", { rp, title });

        // Utiliser localStorage pour le cache RP <-> CommentTopic
        const LS_KEY = "mrp_comment_threads";
        const loadCache = () => {
            try {
                return JSON.parse(localStorage.getItem(LS_KEY)) || {};
            } catch {
                return {};
            }
        };
        const saveCache = (obj) => {
            localStorage.setItem(LS_KEY, JSON.stringify(obj));
        };

        // Cache mémoire pour éviter course-condition
        if (!ensureCommentTopic._cache) ensureCommentTopic._cache = new Map();
        const memCache = ensureCommentTopic._cache;
        const lsCache = loadCache();

        // Vérifier cache mémoire
        if (memCache.has(rp.id)) return memCache.get(rp.id);

        // Vérifier cache localStorage
        if (lsCache[rp.id]) {
            memCache.set(rp.id, lsCache[rp.id]);
            return lsCache[rp.id];
        }

        const work = (async () => {
            // 1) via tag
            try {
                const viaTag = await API.findCommentThreadViaTag({
                    topicId: rp.id,
                });
                if (viaTag?.id) {
                    // Mettre à jour le cache
                    lsCache[rp.id] = viaTag;
                    saveCache(lsCache);
                    return viaTag;
                }
            } catch (_) {}
            // 2) création
            const created = await API.createTopic({
                forumId: CFG.comments_forum_id,
                subject: title,
                message: CFG.new_thread_intro(rp),
            });
            if (created?.id) {
                lsCache[rp.id] = created;
                saveCache(lsCache);
                return created;
            }
        })();

        memCache.set(rp.id, work);
        try {
            const result = await work;
            memCache.set(rp.id, result);
            return result;
        } catch (e) {
            memCache.delete(rp.id);
            throw e;
        }
    };

    async function postComment({ rp, postPermalink, body, quoted }) {
        const header = quoted ? `[quote]${quoted}[/quote]\n` : "";
        const payload = `${header}[url=${postPermalink}]→ Voir le message RP[/url]\n\n${body}`;
        if (CFG.mode === "single_topic") {
            return API.reply({
                topicId: CFG.single_topic_id,
                message: payload,
            });
        }
        const thread = await ensureCommentTopic(rp);
        return API.reply({ topicId: thread.id, message: payload });
    }

    const topicFromHref = (href, a) => {
        if (!href) return null;
        const m = href.match(/\/t(\d+)(?:p\d+)?-/);
        if (!m) return null;
        return {
            id: Number(m[1]),
            url: href,
            title: a?.textContent?.trim() || undefined,
        };
    };

    /**
     * -----------------------------
     * Montage UI (bouton + overlay)
     * -----------------------------
     */
    function openOverlay({
        title = T("overlay_title"),
        preset = "",
        onSubmit,
    }) {
        const wrap = document.createElement("div");
        wrap.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:9999;display:grid;place-items:center;padding:16px;`;
        const card = document.createElement("div");
        card.style.cssText = `background:var(--fa-bg,#fff);color:inherit;width:min(680px,100%);border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.2);padding:16px;max-height:80vh;display:flex;flex-direction:column;gap:12px;`;
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
<button type="button" data-send style="padding:.5rem .8rem;border-radius:8px;background:#0ea5e9;color:#fff;border:none;cursor:pointer">${T(
            "send"
        )}</button>
</div>`;
        wrap.appendChild(card);
        document.body.appendChild(wrap);

        const textarea = card.querySelector("[data-body]");
        textarea.value = preset;
        textarea.focus();

        const close = () => wrap.remove();
        card.querySelector("[data-close]").onclick = close;
        card.querySelector("[data-cancel]").onclick = close;
        card.querySelector("[data-send]").onclick = async () => {
            const body = textarea.value.trim();
            if (!body) return;
            try {
                await onSubmit(body);
                close();
                window.Moderactor?.ui?.toast?.(T("posted_toast"));
            } catch (e) {
                alert(e?.message || e);
            }
        };

        const esc = (ev) => {
            if (ev.key === "Escape") {
                close();
                document.removeEventListener("keydown", esc);
            }
        };
        document.addEventListener("keydown", esc);
    }

    function captureSelectedTextWithin(container) {
        const sel = window.getSelection?.();
        if (!sel || sel.isCollapsed) return "";
        try {
            const range = sel.getRangeAt(0);
            if (!container.contains(range.commonAncestorContainer)) return "";
            const div = document.createElement("div");
            div.appendChild(range.cloneContents());
            return div.textContent.trim();
        } catch {
            return "";
        }
    }

    function mountButtons() {
        const { topicId, forumId } = getPageContext();

        // Restreindre aux forums autorisés
        console.log("topicId:", topicId);
        console.log(CFG.allowed_forums.includes(Number(forumId)));
        if (
            !topicId ||
            (CFG.allowed_forums.length &&
                !CFG.allowed_forums.includes(Number(forumId)))
        )
            return;

        console.log("on est ou ?");

        // Afficher seulement si l’utilisateur est connecté
        if (!env?.user?.is_logged) return;

        const posts = $$(
            ".post, .postrow, .post-container, [id^='p'][class*='post']"
        );
        for (const node of posts) {
            if (node.querySelector(`.${CFG.button_class}`)) continue;

            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = CFG.button_class;
            btn.textContent = T("comment_button");
            btn.style.cssText = `margin-left:.5rem;padding:.25rem .5rem;border-radius:8px;background:#e2e8f0;border:1px solid #cbd5e1;cursor:pointer;font-size:.85rem;`;
            btn.setAttribute("aria-label", T("comment_button"));

            const actions = node.querySelector(".post_contact");
            (actions || node).appendChild(btn);

            btn.addEventListener("click", async () => {
                const postId = getPostIdFromNode(node);
                if (!postId) return alert(T("missing_post_id"));
                const permalink = buildPermalink(location.href, postId);
                const quoted = captureSelectedTextWithin(node);
                const rp = {
                    id: topicId,
                    tag: `#t${env.page.id}`,
                    forumId,
                    title: document.title.replace(/^\s*.*? - /, "").trim(),
                    url: location.href.split("#")[0],
                };

                if (!CFG.use_overlay) {
                    const prefill = `${
                        quoted ? `[quote]${quoted}[/quote]\n` : ""
                    }[url=${permalink}]→ Voir le message RP[/url]\n\n`;
                    sessionStorage.setItem("__mrp_prefill", prefill);
                    if (CFG.mode === "single_topic")
                        location.href = `/post?mode=reply&t=${CFG.single_topic_id}`;
                    else {
                        const thr = await ensureCommentTopic(rp);
                        location.href = `/post?mode=reply&t=${thr.id}`;
                    }
                    return;
                }

                openOverlay({
                    title: T("overlay_title"),
                    preset: quoted ? `[quote]${quoted}[/quote]\n\n` : "",
                    onSubmit: async (body) =>
                        postComment({
                            rp,
                            postPermalink: permalink,
                            body,
                            quoted: "",
                        }),
                });
            });
        }
    }

    async function boot() {
        try {
            mountButtons(env);
        } catch (e) {
            console.warn("[MRP] init skipped:", e);
        }
    }

    await boot();
})();
