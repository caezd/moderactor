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
        var form_data = new FormData();

        for (var key in data) {
            form_data.append(key, data[key]);
        }
        return [...form_data.entries()]
            .map((x) => `${encodeURIComponent(x[0])}=${encodeURIComponent(x[1])}`)
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
        if (/^\/u\d+-/.test(p)) return "profile";
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
        const t = href.match(/\/(?:t|viewtopic\?.*?t=)(\d+)/);
        if (t) ids.topic_id = Number(t[1]);
        const f = href.match(/\/f(\d+)-/);
        if (f) ids.forum_id = Number(f[1]);
        const p = href.match(/#(\d+)$/);
        if (p) ids.post_id = Number(p[1]);
        return ids;
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

        const links = {
            first: href || undefined,
            topic:
                all(doc, 'a[href^="/t"], a[href*="viewtopic"]').map((a) =>
                    a.getAttribute("href")
                )[0] || undefined,
            forum:
                all(doc, 'a[href^="/f"]').map((a) => a.getAttribute("href"))[0] ||
                undefined,
        };

        return {
            ok,
            status: resp.status,
            action,
            message,
            ids,
            links,
            href,
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
        async post(input) {
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
                    })
                    .then((r) => this.adapter.bridge(r))
            );
            return this._all(tasks);
        }
    }

    class TopicResource extends BaseResource {
        async post(input) {
            const { message, notify = 0 } = input || {};
            if (!message) throw new Error("Topic.post: message est requis");
            const tasks = this.ids.map((t) =>
                this.adapter
                    .post("/post", { post: 1, mode: "reply", t, message, notify })
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
                const data = { ...form.data, message };
                data.post = 1;
                const resp = await this.adapter.post("/post", data);
                return this.adapter.bridge(resp);
            });
            return this._all(tasks);
        }
    }

    class UserResource extends BaseResource {
        async pm({ subject, message }) {
            if (!subject || !message)
                throw new Error("User.pm: subject et message requis");
            const username = this.ids.join(", ");
            const resp = await this.adapter.post("/privmsg", {
                username,
                mode: "post",
                post: 1,
                subject,
                message,
            });
            return this.adapter.bridge(resp);
        }

        async ban({ days = 0, reason = "" } = {}) {
            const tid = this.adapter.tid;
            if (!tid) throw new Error("User.ban: tid introuvable");
            const tasks = this.ids.map((user_id) =>
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

        async unban() {
            const tid = this.adapter.tid;
            if (!tid) throw new Error("User.unban: tid introuvable");
            const resp = await this.adapter.post(
                `/admin/index.forum?part=users_groups&sub=users&mode=ban_control&extended_admin=1&tid=${tid}`,
                { users_to_unban: this.ids, unban_users: 1 }
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

    // default options and extend with custom
    const defaultOptions = {
      targetContainer: null, // if null, append to body
    };

    class BaseInterface {
      constructor(adapter, options) {
        this.adapter = adapter;
        this.options = { ...defaultOptions, ...options };
        this.build();
      }

      build() {
        // Build the UI components here using this.adapter and this.options
        // first, build the main container, with some classes and attributes, with document fragment?
        // Remove any existing container to avoid duplicates
        const existingContainer = document.querySelector(
          ".moderactor-ui-container"
        );
        if (existingContainer) {
          existingContainer.parentNode.removeChild(existingContainer);
        }

        this.container = document.createElement("div");
        this.container.classList.add("moderactor-ui-container");

        const fragment = document.createDocumentFragment();
        fragment.appendChild(this.container);

        // Append the fragment to the target container or the body
        if (this.options && this.options.targetContainer) {
          this.options.targetContainer.appendChild(fragment);
        } else {
          document.body.appendChild(fragment);
        }
        console.log(fragment, this.content);

        /**
         * Build a dropdown button that opens a form to post something, allowing users to quickly create new content.
         * The dropdown button should be easily accessible and visually distinct.
         * The form should include fields for the content title and body, and which type of content to create (e.g., new topic, new private message, etc.)
         */
      }

      morphDropdownButton(switchOption) {
        console.log("morphDropdownButton", switchOption);
        /* const dropdownButton = this.container.querySelector('.moderactor-dropdown-button');
            const form = dropdownButton.querySelector('.moderactor-post-form');

            // Update the form fields based on the selected option
            switch (switchOption) {
                case 'new-pm':
                    form.querySelector('select[name="content-type"]').value = 'pm';
                    break;
                case 'reply-topic':
                    form.querySelector('select[name="content-type"]').value = 'reply';
                    break;
                default:
                    break;
            }
                    */
      }
    }

    class UIInterface extends BaseInterface {
      build() {
        const pageType = this.adapter.pagetype;
        console.log(pageType);
        switch (pageType) {
          case "inbox":
            /**
             * Build the inbox UI components
             * which means :
             * we need to filter what actions are possibles based on the current page
             * like delete a message when reading it, or reply to it, or mark it as unread, etc.
             * when inside the inbox, put "create" button dropdown (from BaseInterface and already built inside this.container) as first and already selected
             */
            this.morphButtonDropdown("create");

            // add "delete" button dropdown (from BaseInterface and already built inside this.container) as second and already selected
            //this.addUiButton("delete", 'pm', this.adapter.resid);

            break;
          case "profile":
            /**
             * Build the profile UI components
             * which means :
             * we need to filter what actions are possibles based on the current page
             * edit profile, ban, unban user, etc.
             * when viewing a profile, put "new private message" to this user button dropdown (from BaseInterface and already built inside this.container) as first and already selected
             */
            break;
          case "forum":
            break;
          case "category":
            break;
          case "topic":
            /**
             * Build the topic UI components
             * which means :
             * we need to filter what actions are possibles based on the current page
             * like reply to topic, report topic, etc.
             * when viewing a topic, put "reply" button dropdown (from BaseInterface and already built inside this.container) as first and already selected
             */
            this.morphButtonDropdown("reply");
            break;
        }
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
    function extractBreadcrumbs$1(doc = document) {
        return (
            extractJsonLd(doc, ["BreadcrumbList"]).byType["BreadcrumbList"] || []
        );
    }

    function extractDiscussion$1(doc = document) {
        return (
            extractJsonLd(doc, ["DiscussionForumPosting"]).byType[
                "DiscussionForumPosting"
            ] || []
        );
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
        const discussion = extractDiscussion(doc)[0] || null;
        extractBreadcrumbs(doc)[0] || null;

        const title =
            discussion?.headline ||
            doc.querySelector("h1.page-title")?.textContent?.trim() ||
            null;
        const canonical = doc.querySelector('link[rel="canonical"]')?.href || null;

        const meta = parseFromUrl(canonical);
        const url = canonical || null;
        const topic_id = meta.id || null;

        const repliesListCount = countReplies(doc);

        // 2) JSON‑LD (dates + total comments/pages)

        // 4) Pagination visible
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

    async function env(options = {}) {
        const doc = document;
        const statsWanted = !!options?.stats;
        options?.stats?.forum?.pageSize;

        const discussion = extractDiscussion$1(doc)[0] || null;
        const breadcrumbs = extractBreadcrumbs$1(doc)[0] || null;

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
                forum: { },
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
        } catch { }
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
        get env() {
            const cached = getCachedEnv();
            return cached ?? refreshEnv({ stats: true });
        },
        set env(opts = {}) {
            return refreshEnv(opts);
        },
        forum: (idOrArray) => {
            if (!getCachedEnv()) refreshEnv({ stats: true });
            new ForumResource(idOrArray, forumactifAdapter);
        },
        topic: (idOrArray) => {
            if (!getCachedEnv()) refreshEnv({ stats: true });
            new TopicResource(idOrArray, forumactifAdapter);
        },
        post: (idOrArray) => {
            if (!getCachedEnv()) refreshEnv({ stats: true });
            new PostResource(idOrArray, forumactifAdapter);
        },
        user: (idOrArray) => {
            if (!getCachedEnv()) refreshEnv({ stats: true });
            new UserResource(idOrArray, forumactifAdapter);
        },
        chat: () => {
            if (!getCachedEnv()) refreshEnv({ stats: true });
            new ChatResource(forumactifAdapter);
        },
        ui: (options) => {
            if (!getCachedEnv()) refreshEnv({ stats: true });
            new UIInterface(forumactifAdapter, options);
        },
        adapter: forumactifAdapter,
    };

    if (typeof window !== "undefined") {
        window.Moderactor = Moderactor;
    }

    return Moderactor;

})();
//# sourceMappingURL=moderactor.js.map
