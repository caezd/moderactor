var Moderactor = (function () {
    'use strict';

    class Adapter {
        async get(url) {
            throw new Error("Adapter.get not implemented");
        }
        async post(url, data) {
            throw new Error("Adapter.post not implemented");
        }
        async getForm(url, formSelector) {
            throw new Error("Adapter.getForm not implemented");
        }
        bridge(resp) {
            throw new Error("Adapter.bridge not implemented");
        }
        get tid() {
            return null;
        }
        get pagetype() {
            return "";
        }
    }

    function encodeForm(data) {
        const form_data = new FormData();
        for (const key in data) {
            const val = data[key];
            if (Array.isArray(val)) {
                const k = key.endsWith("[]") ? key : key + "[]";
                for (const v of val) form_data.append(k, v);
            } else {
                form_data.append(key, val);
            }
        }
        return [...form_data.entries()]
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
            .join("&");
    }

    function htmlFromText(text) {
        const parser = new DOMParser();
        return parser.parseFromString(text, "text/html");
    }

    async function httpGet(url) {
        const r = await fetch(url, { credentials: "same-origin" });
        const text = await r.text();
        return { ok: r.ok, status: r.status, text, doc: htmlFromText(text) };
    }

    async function httpPost(url, data) {
        const body = encodeForm(data);
        console.log("[httpPost] body:", body);
        const r = await fetch(url, {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
            },
            body,
        });
        const text = await r.text();
        return { ok: r.ok, status: r.status, text, doc: htmlFromText(text) };
    }

    function getTidFromDomOrUrl() {
        const input = document.querySelector("input[name=tid]");
        if (input?.value) return input.value;

        const anchor = document.querySelector("a[href*='&tid=']");
        const href = anchor?.getAttribute("href") || "";
        const m = href.match(/[?&]tid=([a-z0-9]+)/i);
        if (m) return m[1];

        // fallback: parse pathname (/t123-/f456-)
        const p = location.pathname;
        const t = p.match(/\/t(\d+)(?:p\d+)?-/);
        if (t) return t[1];
        const f = p.match(/\/f(\d+)(?:p\d+)?-/);
        if (f) return f[1];

        return null;
    }

    function getPageType() {
        const p = location.pathname;
        if (/^\/t\d+(p\d+)?-/.test(p)) return "topic";
        if (/^\/f\d+(p\d+)?-/.test(p)) return "forum";
        if (/^\/c\d+-/.test(p)) return "category";
        if (/^\/u\d+/.test(p)) return "profile";
        if (/^\/privmsg\?/.test(p)) return "inbox";
        const qs = p + location.search;
        const m = qs.match(/\/modcp\?mode=([^&]+)/);
        return m ? m[1] : "";
    }

    function getResId() {
        const p = location.pathname;
        let m = p.match(/^\/[tfc](\d+)(?:p\d+)?-/);
        if (!m) m = p.match(/^\/u(\d+)/);
        return m ? Number(m[1]) : 0;
    }

    function getPageNum() {
        const p = location.pathname;
        const m = p.match(/^\/[tf]\d+(p\d+)-/);
        return m ? Number(m[1].slice(1)) : 0;
    }

    const state = {
        get tid() {
            return getTidFromDomOrUrl();
        },
        get pagetype() {
            return getPageType();
        },
        get resid() {
            return getResId();
        },
        get pagenum() {
            return getPageNum();
        },
        get charset() {
            return (
                document.charset ||
                document.characterSet ||
                "utf-8"
            ).toLowerCase();
        },
    };

    // ──────────────────────────────────────────────────────────────────────────────
    // File: src/adapters/phpbb3/bridge.js
    // ──────────────────────────────────────────────────────────────────────────────
    // Bridge pour Forumactif : parse les pages de confirmation/erreur

    function first(el, sel) {
        return el.querySelector(sel) || undefined;
    }
    function all(el, sel) {
        return Array.from(el.querySelectorAll(sel));
    }

    function extractMessage(doc) {
        // Récupère tous les <p> et concatène leurs textes
        const ps = Array.from(doc.querySelectorAll("p")).map((p) =>
            p.textContent.trim()
        );
        const text = ps.join(" ").replace(/\s+/g, " ").trim();
        return text;
    }

    function parseIdsFromHref(href) {
        const ids = {};
        if (!href) return ids;

        // topic id (depuis /tID-... OU viewtopic?...t=ID)
        const t =
            href.match(/\/t(\d+)-/) || href.match(/viewtopic\?.*?[?&]t=(\d+)/);
        if (t) ids.topic_id = Number(t[1]);

        // slug
        const s = href.match(/\/t\d+-([^\/?#]+)/);
        if (s) ids.topic_slug = s[1];

        // forum id
        const f = href.match(/\/f(\d+)-/);
        if (f) ids.forum_id = Number(f[1]);

        // post id (anchor)
        const p = href.match(/#(\d+)$/);
        if (p) ids.post_id = Number(p[1]);

        // start (pagination)
        const st = href.match(/[?&]start=(\d+)/);
        if (st) ids.start = Number(st[1]);

        // flags utiles
        ids.is_topic = /^\/t\d+-/.test(href);
        ids.is_viewtopic = /\/viewtopic\?/.test(href);

        return ids;
    }

    function canonicalTopicUrl(doc) {
        const a = all(doc, 'a[href^="/t"]').filter((href) =>
            /^\/t\d+(p\d+)?-/.test(href)
        );
        return a.length > 0 ? a[0].getAttribute("href") : undefined;
    }

    function inferAction(message) {
        const lower = (message || "").toLowerCase();
        if (/déplacé/.test(lower)) return "topic.move";
        if (/verrouill/.test(lower) && !/déverrouill/.test(lower))
            return "topic.lock";
        if (/déverrouill/.test(lower)) return "topic.unlock";
        if (/supprim/.test(lower)) return "topic.delete";
        if (/corbeille|poubelle/.test(lower)) return "topic.trash";
        if (/répon|enregistré avec succès/.test(lower)) return "topic.post";
        if (/nouveau sujet/.test(lower)) return "forum.post";
        if (/message priv/.test(lower)) return "user.pm";
        if (/banni/.test(lower)) return "user.ban";
        if (/débanni|unban/.test(lower)) return "user.unban";
        return "unknown";
    }

    function validateOk(action, message) {
        const lowerMsg = (message || "").toLowerCase();
        switch (action) {
            case "topic.move":
                return /déplacé/.test(lowerMsg);
            case "topic.lock":
                return /verrouill/.test(lowerMsg);
            case "topic.unlock":
                return /déverrouill/.test(lowerMsg);
            case "topic.delete":
                return /supprim/.test(lowerMsg);
            case "topic.trash":
                return /corbeille|poubelle/.test(lowerMsg);
            case "topic.post":
                return /répon|enregistré avec succès/.test(lowerMsg);
            case "forum.post":
                return /nouveau sujet/.test(lowerMsg);
            case "user.pm":
                return /message priv/.test(lowerMsg);
            case "user.ban":
                return /banni/.test(lowerMsg);
            case "user.unban":
                return /débanni|unban/.test(lowerMsg);
            default:
                return false;
        }
    }

    function bridgeParse(resp) {
        const { doc, text } = resp;
        const message = extractMessage(doc);

        const firstLink = first(doc, "a[href]");
        const href = firstLink ? firstLink.getAttribute("href") : "";
        const ids = parseIdsFromHref(href);

        const action = inferAction(message);
        const ok = validateOk(action, message);

        const topicLink = all(doc, 'a[href^="/t"], a[href*="viewtopic"]').map((a) =>
            a.getAttribute("href")
        )[0];
        const forumLinks = all(doc, "a[href]")
            .map((a) => a.getAttribute("href"))
            .filter((href) => /^\/f\d+(p\d+)?-/.test(href));
        const forumLink = forumLinks.length > 0 ? forumLinks[0] : undefined;

        // Tente d’obtenir une URL canonique de sujet (si on n’a qu’un viewtopic)
        let topicUrl = topicLink;
        if (topicUrl && /viewtopic\?/.test(topicUrl)) {
            const can = canonicalTopicUrl(doc);
            if (can) topicUrl = can;
        }

        const links = {
            first: href || undefined,
            topic: topicUrl || undefined,
            forum: forumLink || undefined,
        };

        // Entité normalisée pour usage direct par Moderactor
        const entity = {};
        if (ok) {
            if (
                action === "forum.post" ||
                (action === "topic.post" && ids.is_topic)
            ) {
                // Création d’un nouveau sujet
                entity.topic = {
                    id: ids.topic_id,
                    url: links.topic,
                    slug: ids.topic_slug,
                    forumId: ids.forum_id,
                };
            } else if (action === "topic.post") {
                // Réponse dans un sujet existant
                // si pas de lien canonique, on garde viewtopic#post
                const postHref = links.topic || href;
                entity.post = {
                    id: ids.post_id,
                    topicId: ids.topic_id,
                    url: postHref,
                };
            } else if (action === "user.pm") {
                entity.pm = { inboxUrl: "/privmsg?folder=inbox" };
            }
        }

        return {
            ok,
            status: resp.status,
            action,
            message,
            ids,
            links,
            href,
            entity,
            raw: text,
        };
    }

    class ForumactifAdapter extends Adapter {
        async get(url) {
            return httpGet(url);
        }
        async post(url, data) {
            return httpPost(url, data);
        }
        async getForm(url, formSelector) {
            const resp = await this.get(url);
            if (!resp.ok)
                return { ok: false, status: resp.status, text: resp.text };
            const form = resp.doc.querySelector(formSelector);
            if (!form) return { ok: false, status: 404, text: "Form not found" };
            const fd = new FormData(form);
            const obj = Object.fromEntries(fd.entries());
            return { ok: true, data: obj, doc: resp.doc };
        }

        bridge(resp) {
            return bridgeParse(resp);
        }
        get tid() {
            return state.tid;
        }
        get pagetype() {
            return state.pagetype;
        }
    }

    const forumactifAdapter = new ForumactifAdapter();

    const isArray = Array.isArray;

    const toArray = (v) => (v == null ? [] : isArray(v) ? v : [v]);

    function byIdOrArray(input) {
        return toArray(input)
            .filter((x) => x != null)
            .map((x) => (typeof x === "number" ? x : parseInt(String(x), 10)))
            .filter((x) => Number.isFinite(x) && x > 0);
    }

    const isNumericId = (v) =>
        typeof v === "number" || /^\d+$/.test(String(v));

    const uniqueNFC = (arr) =>
        Array.from(new Set(arr.map((s) => toNFC(String(s)))));

    const toNFC = (s) => (typeof s === "string" ? s.normalize("NFC") : s);

    const toKey = (s, replace = "-") =>
        String(s || "")
            .toString()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim()
            .replace(/\s+/g, replace)
            .replace(/[^\w-]+/g, "")
            .replace(/--+/g, replace);

    function nextSiblingMatching(startEl, selector) {
        let el = startEl?.nextElementSibling || null;
        while (el && !el.matches(selector)) el = el.nextElementSibling;
        return el || null;
    }

    const getDirectText = (el) =>
        !el
            ? ""
            : Array.from(el.childNodes)
                  .filter((n) => n.nodeType === Node.TEXT_NODE)
                  .map((n) => n.nodeValue.trim())
                  .filter(Boolean)
                  .join(" ");

    const idsFromHref = (href) => {
        const ids = {};
        if (!href) return ids;
        const t = href.match(/\/t(\d+)/) || href.match(/[?&]t=(\d+)/);
        const p = href.match(/#p?(\d+)$/);
        const f = href.match(/\/f(\d+)-/);
        if (t) ids.topic_id = Number(t[1]);
        if (p) ids.post_id = Number(p[1]);
        if (f) ids.forum_id = Number(f[1]);
        return ids;
    };

    // Extrait {id, slug} depuis une URL canonique /t238-mon-sujet
    function parseFromUrl(u) {
        try {
            const href = typeof u === "string" ? u : u?.href || "";
            const m = href.match(/\/[ftc](\d+)(?:[p]\d+)?-([a-z0-9-]+)/i);
            return m ? { id: Number(m[1]), slug: m[2] } : {};
        } catch {
            return {};
        }
    }

    class BaseResource {
        constructor(ids, adapter) {
            this.ids = byIdOrArray(ids);
            this.adapter = adapter;
        }
        _all(promises) {
            return Promise.all(promises);
        }
    }

    class ForumResource extends BaseResource {
        async post(input, options = {}) {
            const { subject, message, notify = 0 } = input || {};
            if (!subject || !message)
                throw new Error("Forum.post: subject et message sont requis");
            const tasks = this.ids.map((f) =>
                this.adapter
                    .post("/post", {
                        post: 1,
                        mode: "newtopic",
                        f,
                        subject,
                        message,
                        notify,
                        ...options,
                    })
                    .then((r) => this.adapter.bridge(r))
            );
            return this._all(tasks);
        }
    }

    class TopicResource extends BaseResource {
        async post(input, options = {}) {
            const { message, notify = 0 } = input || {};
            if (!message) throw new Error("Topic.post: message est requis");
            const tasks = this.ids.map((t) =>
                this.adapter
                    .post("/post", {
                        post: 1,
                        mode: "reply",
                        t,
                        message,
                        notify,
                        ...options,
                    })
                    .then((r) => this.adapter.bridge(r))
            );
            return this._all(tasks);
        }

        async lock() {
            const tid = this.adapter.tid;
            if (!tid) throw new Error("Topic.lock: tid introuvable");
            const tasks = this.ids.map((t) =>
                this.adapter
                    .get(`/modcp?mode=lock&t=${t}&tid=${tid}`)
                    .then((r) => this.adapter.bridge(r))
            );
            return this._all(tasks);
        }

        async unlock() {
            const tid = this.adapter.tid;
            if (!tid) throw new Error("Topic.unlock: tid introuvable");
            const tasks = this.ids.map((t) =>
                this.adapter
                    .get(`/modcp?mode=unlock&t=${t}&tid=${tid}`)
                    .then((r) => this.adapter.bridge(r))
            );
            return this._all(tasks);
        }

        async move(newForumId) {
            if (!newForumId) throw new Error("Topic.move: forum id manquant");
            const tid = this.adapter.tid;
            if (!tid) throw new Error("Topic.move: tid introuvable");
            const tasks = this.ids.map((t) =>
                this.adapter
                    .post(`/modcp?tid=${tid}`, {
                        tid,
                        new_forum: "f" + newForumId,
                        mode: "move",
                        t,
                        confirm: 1,
                    })
                    .then((r) => this.adapter.bridge(r))
            );
            return this._all(tasks);
        }

        async trash() {
            const tid = this.adapter.tid;
            if (!tid) throw new Error("Topic.trash: tid introuvable");
            const tasks = this.ids.map((t) =>
                this.adapter
                    .get(`/modcp?mode=trash&t=${t}&tid=${tid}`)
                    .then((r) => this.adapter.bridge(r))
            );
            return this._all(tasks);
        }

        async delete() {
            const tid = this.adapter.tid;
            if (!tid) throw new Error("Topic.remove: tid introuvable");
            const tasks = this.ids.map((t) =>
                this.adapter
                    .post(`/modcp?tid=${tid}`, { t, mode: "delete", confirm: 1 })
                    .then((r) => this.adapter.bridge(r))
            );
            return this._all(tasks);
        }
    }

    /**
     * Récupère l'id du topic (input name="t") à partir d'un post via la page quote,
     * si explicitTopicId est absent.
     * @param {object} adapter - doit exposer getForm(url, selector)
     * @param {number|string|undefined|null} explicitTopicId
     * @param {number|string} postId
     * @returns {Promise<number>}
     */
    async function resolveTopicId(adapter, explicitTopicId, postId) {
        if (explicitTopicId != null) return Number(explicitTopicId);

        const form = await adapter.getForm(
            `/post?p=${postId}&mode=quote`,
            'form[method="post"]'
        );
        if (!form?.ok) {
            throw new Error(
                "resolveTopicId: impossible de récupérer le topic via quote()"
            );
        }
        const t = parseInt(form.data?.t, 10);
        if (!t) throw new Error("resolveTopicId: topicId introuvable (form quote)");
        return t;
    }

    /**
     * Récupère l'id du forum du topic (input name="f") via la page move,
     * si explicitForumId est absent.
     * @param {object} adapter - doit exposer getForm(url, selector)
     * @param {number|string} topicId
     * @param {number|string|undefined|null} explicitForumId
     * @param {number|string} tid - token modcp
     * @returns {Promise<number>}
     */
    async function resolveForumId(adapter, topicId, explicitForumId, tid) {
        if (explicitForumId != null) return Number(explicitForumId);

        const form = await adapter.getForm(
            `/modcp?mode=move&t=${topicId}&tid=${tid}`,
            'form[method="post"]'
        );
        if (!form?.ok) {
            throw new Error(
                "resolveForumId: impossible de récupérer le forum du topic"
            );
        }
        const f = parseInt(form.data?.f, 10);
        if (!f) throw new Error("resolveForumId: forumId introuvable (form move)");
        return f;
    }

    // actions/post.js

    class PostResource extends BaseResource {
        async delete() {
            const tasks = this.ids.map((p) =>
                this.adapter
                    .post("/post", { p, mode: "delete", confirm: "" })
                    .then((r) => this.adapter.bridge(r))
            );
            return this._all(tasks);
        }

        async update({ message }) {
            if (!message) throw new Error("Post.update: message requis");

            const tasks = this.ids.map(async (p) => {
                const form = await this.adapter.getForm(
                    `/post?p=${p}&mode=editpost`,
                    'form[name="post"]'
                );
                if (!form.ok) return form;

                const data = { ...form.data, message }; // <-- FIX
                data.post = 1;

                const resp = await this.adapter.post("/post", data);
                return this.adapter.bridge(resp);
            });

            return this._all(tasks);
        }

        /**
         * Scinde un ou plusieurs messages vers un nouveau sujet
         * @param {string} newTitle - Titre du nouveau sujet
         * @param {number} [newForumId] - Forum cible (sinon forum courant)
         * @param {number} [topicId] - Topic source (sinon déduit du post)
         * @param {boolean} [beyond=false] - true = split beyond, false = split all
         */
        async split(
            newTitle,
            { newForumId = null, topicId = null, beyond = false } = {}
        ) {
            if (!this.ids.length) return [];
            const tid = this.adapter.tid; // token temporaire
            if (!tid) throw new Error("Post.split: tid introuvable");

            const subject = String(title || "").trim();
            if (!subject) throw new Error("Post.split: subject requis");

            const firstPost = this.ids[0];

            // Helpers fournis par moderactor.js
            const t = await resolveTopicId(this.adapter, topicId, firstPost); // topic source
            const f = await resolveForumId(this.adapter, t, newForumId, tid); // forum cible

            const data = {
                subject,
                new_forum_id: "f" + Number(f),
                "post_id_list[]": this.ids.map(Number),
                t: Number(t),
                mode: "split",
                ["split_type_" + (beyond ? "beyond" : "all")]: 1,
            };

            const resp = await this.adapter.post(`/modcp?tid=${tid}`, data); // tid en URL
            return this.adapter.bridge(resp);
        }

        async splitBeyond(title, newForumId, topicId) {
            return this.split(title, newForumId, topicId, true);
        }
    }

    // src/core/jsonld.js
    // Utilitaires de parsing JSON‑LD (BreadcrumbList, DiscussionForumPosting, …)
    // - découplé du thème
    // - extensible via un registre de handlers

    /** Récupère tous les <script type="application/ld+json"> du document */
    function getJsonLdNodes(doc = document) {
        return Array.from(
            doc.querySelectorAll('script[type="application/ld+json"]')
        );
    }

    /** Parse un <script> en JSON JS (retourne [] si erreur) */
    function parseJsonLdScript(node) {
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
    function normalizeJsonLdRoot(root) {
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
    function extractBreadcrumbList(obj) {
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
    function extractDiscussionForumPosting(obj) {
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

    /**
     * Parse tout le JSON‑LD de la page et renvoie un objet par type.
     * @param {Document} doc
     * @param {string[]=} onlyTypes liste de types à extraire (sinon tous ceux connus)
     * @returns {{ byType: Record<string, any[]>, all: any[] }}
     */
    function extractJsonLd(doc = document, onlyTypes) {
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
    function extractBreadcrumbs(doc = document) {
        return (
            extractJsonLd(doc, ["BreadcrumbList"]).byType["BreadcrumbList"] || []
        );
    }

    function extractDiscussion(doc = document) {
        return (
            extractJsonLd(doc, ["DiscussionForumPosting"]).byType[
                "DiscussionForumPosting"
            ] || []
        );
    }

    async function fetchUsernameById(adapter, id) {
        const r = await adapter.get(`/u${id}`);
        if (!r?.ok) throw new Error(`fetchUsernameById: HTTP ${r?.status}`);

        // 1) JSON-LD → BreadcrumbList
        const crumbs = extractBreadcrumbs(r.doc);
        if (crumbs.length) {
            const last = crumbs[0].items
                .slice()
                .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
                .pop();
            const name = last?.name?.trim();
            if (name) return name;
        }

        // Fallback DOM
        const candidates = ["meta[name='title']"];
        for (const sel of candidates) {
            const el = r.doc.querySelector(sel);
            const raw =
                el?.getAttribute?.("content")?.replace(/^Profil\s*-\s*/i, "") ||
                el?.textContent ||
                "";
            const name = raw.trim();
            if (name) return name;
        }

        throw new Error(`fetchUsernameById: username introuvable pour u${id}`);
    }

    async function resolveRecipients(adapter, input) {
        const raw = Array.isArray(input) ? input : [input];

        const jobs = raw.map((item) => {
            if (isNumericId(item)) {
                return fetchUsernameById(adapter, Number(item))
                    .then((name) => toNFC(name))
                    .catch(() => null);
            }
            if (typeof item === "string") {
                const s = toNFC(item.trim());
                return Promise.resolve(s || null);
            }
            return Promise.resolve(null);
        });

        const settled = await Promise.allSettled(jobs);
        const names = settled
            .filter((r) => r.status === "fulfilled" && r.value)
            .map((r) => r.value);

        return uniqueNFC(names);
    }

    class UserResource extends BaseResource {
        constructor(idsOrNames, adapter) {
            const list = Array.isArray(idsOrNames) ? idsOrNames : [idsOrNames];
            super(list, adapter);

            this._raw = list;
            this._idsOnly = list
                .filter((v) => isNumericId(v))
                .map((v) => Number(v));
        }

        /**
         * Envoie un message privé.
         * @param {object} param0
         * @param {string} param0.subject
         * @param {string} param0.message
         * @param {Array<number|string>} [param0.usernames] – override optionnel (ids/noms)
         */
        async pm({ subject, message, usernames } = {}) {
            if (!subject || !message) {
                throw new Error("User.pm: subject et message requis");
            }

            const recipients = await resolveRecipients(
                this.adapter,
                usernames ?? this._raw
            );

            if (!recipients.length) {
                throw new Error("User.pm: aucun destinataire");
            }

            /* const form = await this.adapter.getForm(
                "/privmsg?mode=post",
                'form[name="post"]'
            );
            if (!form?.ok) {
                throw new Error(
                    "User.pm: formulaire introuvable (/privmsg?mode=post)"
                );
            } */

            const data = {
                "username[]": recipients,
                subject,
                message,
                post: 1,
            };

            const resp = await this.adapter.post("/privmsg", data);
            return this.adapter.bridge(resp);
        }

        /**
         * Bannit les IDs présents dans le constructeur (ou fournis).
         * @param {object} param0
         * @param {number} [param0.days=0]
         * @param {string} [param0.reason=""]
         * @param {Array<number>} [param0.ids] – override optionnel (IDs uniquement)
         */
        async ban({ days = 0, reason = "", ids } = {}) {
            const tid = this.adapter.tid;
            if (!tid) throw new Error("User.ban: tid introuvable");

            const targetIds = Array.isArray(ids) ? ids : this._idsOnly;
            if (!targetIds.length) throw new Error("User.ban: aucun ID numérique");

            const tasks = targetIds.map((user_id) =>
                this.adapter
                    .post(`/modcp?tid=${tid}`, {
                        tid,
                        confirm: 1,
                        mode: "ban",
                        user_id,
                        ban_user_date: days,
                        ban_user_reason: reason,
                    })
                    .then((r) => this.adapter.bridge(r))
            );

            return this._all(tasks);
        }

        async unban({ ids } = {}) {
            const tid = this.adapter.tid;
            if (!tid) throw new Error("User.unban: tid introuvable");

            const targetIds = Array.isArray(ids) ? ids : this._idsOnly;
            if (!targetIds.length)
                throw new Error("User.unban: aucun ID numérique");

            const resp = await this.adapter.post(
                `/admin/index.forum?part=users_groups&sub=users&mode=ban_control&extended_admin=1&tid=${tid}`,
                { users_to_unban: targetIds, unban_users: 1 }
            );
            return this.adapter.bridge(resp);
        }
    }

    class ChatResource extends BaseResource {
        constructor(adapter) {
            super([], adapter);
        }
        async post({ message }) {
            if (!message) throw new Error("Chat.post: message requis");
            await this.adapter.post("/chatbox/actions.forum", {
                method: "send",
                archive: 0,
                message,
            });
            return { ok: true };
        }
    }

    function parsePagination(
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

    function parseForumStats(
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

    function parseTopicStats(
        doc,
        { pageSizeOverride, defaultPageSize = 25 } = {}
    ) {
        const title =
            doc.querySelector("h1.page-title")?.textContent?.trim() || null;
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

    /**
     * root
     * probe
     * dt pour  label
     * dd pour content (ou nextElementSibling si null/empty)
     */
    const defaultCandidates = [
        /** PHPBB2 ADVANCED */
        {
            probe: { type: "selector", sel: "#profile-advanced-details dl" },
            dt: "dt span",
            dd: ".field_uneditable",
        },
        /** PHPBB3 & MODERNBB & AWESOMEBB ADVANCED */
        {
            probe: { type: "selector", sel: "#profile-tab-field-profil dl" },
            dt: "dt span",
            dd: ".field_uneditable",
        },
        { probe: { type: "selector", sel: ".mod-login-avatar" }, field: "avatar" },

        /** PunBB & INVISION ADVANCED */
        {
            probe: { type: "selector", sel: "#profile-advanced-details dl" },
            dt: "dt span",
            dd: ".field_uneditable", // => dt.nextElementSibling
        },

        {
            probe: { type: "selector", sel: "h1" },
            field: "username",
            extract: {
                mode: "text",
                remove: [/^Tout à propos de\s*/i],
                normalizeWhitespace: true,
            },
        },
    ];

    function whenEmpty(s) {
        return s === "-" ? "" : s;
    }

    function pickCandidates(doc, candidates = []) {
        const matches = [];
        for (const c of candidates) {
            if (c.probe?.type === "selector" && typeof c.probe.sel === "string") {
                const roots = doc.querySelectorAll(c.probe.sel);
                if (roots.length) {
                    matches.push({ cfg: c, roots: Array.from(roots) });
                }
            }
        }
        return matches;
    }

    function extractValue(rootEl, c) {
        const ex = c.extract;

        // 1) extract peut être une fonction personnalisée
        if (typeof ex === "function") {
            return ex(rootEl) ?? "";
        }

        // 2) extract peut être une chaîne courte : "text" | "innerHTML" | "outerHTML" | "attr:NAME"
        if (typeof ex === "string") {
            if (ex === "text") return rootEl.textContent?.trim() ?? "";
            if (ex === "innerHTML") return rootEl.innerHTML?.trim() ?? "";
            if (ex === "outerHTML") return rootEl.outerHTML?.trim() ?? "";
            if (ex.startsWith("attr:")) {
                const attr = ex.slice("attr:".length);
                return (rootEl.getAttribute?.(attr) || "").trim();
            }
            // défaut: innerHTML
            return rootEl.innerHTML?.trim() ?? "";
        }

        // 3) extract peut être un objet riche
        if (ex && typeof ex === "object") {
            // Options supportées :
            // mode: "text" | "innerHTML" | "outerHTML" | "attr"
            // sel: sous-sélecteur optionnel
            // attr: nom d'attribut si mode === "attr"
            // match: RegExp OU string (on garde le 1er groupe si RegExp avec groupe, sinon le match complet)
            // remove: RegExp | string | Array<RegExp|string> à retirer
            // replace: Array<[RegExp|string, string]> (chaîne de remplacements)
            // normalizeWhitespace: boolean
            // trim: boolean (défaut: true)

            const {
                mode = "innerHTML",
                sel = null,
                attr = null,
                match = null,
                remove = null,
                replace = null,
                normalizeWhitespace = false,
                trim = true,
            } = ex;

            // cibler un sous-élément si demandé
            const el = sel ? rootEl.querySelector(sel) || rootEl : rootEl;

            let val = "";
            if (mode === "text") val = el.textContent ?? "";
            else if (mode === "outerHTML") val = el.outerHTML ?? "";
            else if (mode === "attr" && attr) val = el.getAttribute?.(attr) ?? "";
            else val = el.innerHTML ?? ""; // innerHTML par défaut

            // match : garder seulement une portion
            if (match) {
                if (match instanceof RegExp) {
                    const m = val.match(match);
                    if (m) val = m[1] ?? m[0];
                    else val = "";
                } else if (typeof match === "string") {
                    const idx = val.indexOf(match);
                    val = idx >= 0 ? match : "";
                }
            }

            // remove : retirer motifs
            const applyRemove = (v, pat) =>
                pat instanceof RegExp ? v.replace(pat, "") : v.split(pat).join("");
            if (remove) {
                if (Array.isArray(remove)) {
                    for (const pat of remove) val = applyRemove(val, pat);
                } else {
                    val = applyRemove(val, remove);
                }
            }

            // replace : liste de [pattern, repl]
            if (Array.isArray(replace)) {
                for (const [pat, repl] of replace) {
                    if (pat instanceof RegExp) val = val.replace(pat, repl);
                    else val = val.split(pat).join(repl);
                }
            }

            if (normalizeWhitespace) {
                val = val.replace(/\s+/g, " ");
            }
            if (trim) {
                val = val.trim();
            }
            return val;
        }

        // 4) défaut si extract non fourni : innerHTML
        return rootEl.innerHTML?.trim() ?? "";
    }

    function* iterEntriesForRoot(rootEl, c) {
        // MODE A: champ unique via 'field' (ex: avatar) -> on remonte innerHTML
        if (typeof c.field === "string") {
            const key = toKey(c.field);
            const value = extractValue(rootEl, c);
            yield { key, valueEl: { textContent: value } };
            return;
        }

        // MODE B: dt/dd classique (plusieurs paires)
        const dtSel = c.dt || "dt";
        const ddSel = c.dd ?? null;
        const dts = rootEl.querySelectorAll(dtSel);

        for (const dt of dts) {
            let valueEl = null;
            if (ddSel) {
                valueEl =
                    nextSiblingMatching(dt, ddSel) || rootEl.querySelector(ddSel);
            } else {
                valueEl = dt.nextElementSibling;
            }
            const key = toKey(getDirectText(dt));
            if (key) yield { key, valueEl };
        }
    }

    function readUserFields(doc, candidates) {
        // On veut tous les matchs, pas juste le premier
        const choices = pickCandidates(doc, candidates);
        if (!choices.length) return {};

        const out = {};

        for (const { cfg, roots } of choices) {
            for (const rootEl of roots) {
                for (const { key, valueEl } of iterEntriesForRoot(rootEl, cfg)) {
                    const value =
                        valueEl && "textContent" in valueEl
                            ? whenEmpty(valueEl.textContent.trim())
                            : "";

                    if (!(key in out)) {
                        out[key] = value;
                    } else if (value && !out[key].includes(value)) {
                        out[key] = `${out[key]}, ${value}`;
                    }
                }
            }
        }
        return out;
    }

    function parseProfileStats(doc, { candidates } = {}) {
        const merged = Array.isArray(candidates)
            ? [...candidates, ...defaultCandidates]
            : defaultCandidates;
        return readUserFields(doc, merged);
    }

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
        profile = {},
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
        if (
            effective === "profile" ||
            (effective === "auto" && state.pagetype === "profile")
        ) {
            stats.profile =
                state.pagetype === "profile"
                    ? parseProfileStats(doc, profile)
                    : undefined;
        }

        for (const { url, callback } of extras) {
            try {
                const r = await fetch(url, { credentials: "same-origin" });
                sources.add(url);

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
                    for (const [k, v] of Object.entries(res)) {
                        if (typeof v === "object" && typeof stats[k] === "object") {
                            stats[k] = { ...stats[k], ...v };
                        } else {
                            stats[k] = v;
                        }
                    }
                }

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

    async function env(options = { topic: {}, forum: {}, profile: {} }) {
        const doc = document;
        const statsWanted = !!options?.stats;
        options?.stats?.forum?.pageSize;

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
                posts_count: Number(_ud["userposts"]) || undefined,
                privmsgs_count: Number(_ud["user_nb_privmsgs"]) || undefined,
                group_color: _ud["groupcolor"],
                points_count: Number(_bd["reputation_active"])
                    ? Number(_ud["point_reputation"])
                    : null,
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
                forum: { },
                topic: options?.topic || {},
                profile: options?.profile || {},
            });
            data.stats = s;
        }

        return data;
    }

    const ENV_GLOBAL_KEY = "__MODERACTOR_ENV__";

    const getGlobal = () => {
        if (typeof globalThis !== "undefined") return globalThis;
        if (typeof window !== "undefined") return window;
        if (typeof global !== "undefined") return global;
        return {};
    };

    function cacheEnv(value) {
        const g = getGlobal();
        Moderactor._env = value;
        try {
            g[ENV_GLOBAL_KEY] = value;
        } catch {}
        return value;
    }

    function getCachedEnv() {
        if (Moderactor._env) return Moderactor._env;
        const g = getGlobal();
        if (g[ENV_GLOBAL_KEY]) return (Moderactor._env = g[ENV_GLOBAL_KEY]);
        return null;
    }

    function refreshEnv(opts = {}) {
        const computed = env(opts);
        return cacheEnv(computed);
    }

    const Moderactor = {
        env: () => {
            const cached = getCachedEnv();
            return cached ?? refreshEnv({ stats: true });
        },
        forum: (idOrArray) => {
            if (!getCachedEnv()) refreshEnv({ stats: true });
            return new ForumResource(idOrArray, forumactifAdapter);
        },
        topic: (idOrArray) => {
            if (!getCachedEnv()) refreshEnv({ stats: true });
            return new TopicResource(idOrArray, forumactifAdapter);
        },
        post: (idOrArray) => {
            if (!getCachedEnv()) refreshEnv({ stats: true });
            return new PostResource(idOrArray, forumactifAdapter);
        },
        user: (idOrArray) => {
            if (!getCachedEnv()) refreshEnv({ stats: true });
            return new UserResource(idOrArray, forumactifAdapter);
        },
        chat: () => {
            if (!getCachedEnv()) refreshEnv({ stats: true });
            return new ChatResource(forumactifAdapter);
        },
        /* ui: (options) => {
            if (!getCachedEnv()) refreshEnv({ stats: true });
            return new UIInterface(forumactifAdapter, options);
        }, */
        adapter: forumactifAdapter,
    };

    if (typeof window !== "undefined") {
        window.Moderactor = Moderactor;
    }

    return Moderactor;

})();
//# sourceMappingURL=moderactor.js.map
