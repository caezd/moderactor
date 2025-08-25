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

        // état du sélecteur d’actions
        this._actionsRegistry = new Map(); // key -> { label, iconSVG }
        this._visibleActions = []; // liste des keys visibles
        this._selectedAction = null; // key sélectionnée
        this._actionHandlers = new Set(); // callbacks onAction

        this.build();
    }

    getContext() {
        return this._resolveContext();
    }

    build() {
        if (typeof document === "undefined") return;

        const scope = this.options?.targetContainer || document;
        const existingContainer = scope.querySelector(
            ".moderactor-ui-container"
        );
        if (existingContainer) existingContainer.remove();

        this.container = document.createElement("div");
        this.container.classList.add("moderactor-ui-container");

        const fragment = document.createDocumentFragment();
        fragment.appendChild(this.container);

        (this.options?.targetContainer || document.body).appendChild(fragment);

        this._buildActionSelect();

        this._buildComposer();

        this.onAction((key) => {
            const ctx = this.getContext();
            if (key === "delete") {
                this._confirmAndDelete(ctx);
            } else {
                this._renderComposerFor(key, ctx);
            }
        });

        console.log("Moderactor UI container ready:", this.container);
    }

    defineActions(actionMap) {
        // actionMap: { key: {label: string, icon: string (SVG path or full svg)} }
        for (const [key, def] of Object.entries(actionMap)) {
            const safe = {
                label: def.label ?? key,
                icon: def.icon ?? "", // innerHTML (svg string) ou texte
            };
            this._actionsRegistry.set(key, safe);
        }
        // si rien de visible encore, rendre visibles toutes par défaut
        if (!this._visibleActions.length) {
            this._visibleActions = [...this._actionsRegistry.keys()];
            this._renderActionMenu();
        }
    }

    setActions(keys) {
        // restreint aux clés connues
        this._visibleActions = keys.filter((k) => this._actionsRegistry.has(k));
        // si la sélection actuelle n’est plus visible, bascule sur la première
        if (!this._visibleActions.includes(this._selectedAction)) {
            this._selectedAction = this._visibleActions[0] ?? null;
        }
        this._renderActionMenu();
        this._updateActionButton();
    }

    selectAction(key) {
        if (!this._actionsRegistry.has(key)) return;
        this._selectedAction = key;
        this._updateActionButton();
        this._announceAction(key);
    }

    onAction(fn) {
        if (typeof fn === "function") this._actionHandlers.add(fn);
        return () => this._actionHandlers.delete(fn);
    }

    // compat avec ton appel existant
    morphButtonDropdown(switchOption) {
        this.selectAction(switchOption);
    }
    _buildActionSelect() {
        // wrapper
        this.actionRoot = document.createElement("div");
        this.actionRoot.className = "mdr-action-select";

        // bouton toggle
        this.actionButton = document.createElement("button");
        this.actionButton.type = "button";
        this.actionButton.className = "mdr-action-btn";
        this.actionButton.setAttribute("aria-haspopup", "listbox");
        this.actionButton.setAttribute("aria-expanded", "false");
        this.actionButton.innerHTML = `
      <span class="mdr-action-icon" aria-hidden="true"></span>
      <span class="mdr-action-label"></span>
      <span class="mdr-action-caret" aria-hidden="true">▾</span>
    `;
        this.actionRoot.appendChild(this.actionButton);

        // menu (listbox)
        this.actionMenu = document.createElement("ul");
        this.actionMenu.className = "mdr-action-menu";
        this.actionMenu.setAttribute("role", "listbox");
        this.actionMenu.tabIndex = -1;
        this.actionMenu.hidden = true;
        this.actionRoot.appendChild(this.actionMenu);

        // interactivité
        this._bindActionSelectEvents();

        // insérer dans le container
        this.container.appendChild(this.actionRoot);

        // valeurs par défaut (tu peux les surcharger via defineActions)
        if (this._actionsRegistry.size === 0) {
            this.defineActions({
                create: { label: "Créer", icon: this._svgPlus() },
                reply: { label: "Répondre", icon: this._svgReply() },
                "new-pm": { label: "Nouveau MP", icon: this._svgMail() },
                delete: { label: "Supprimer", icon: this._svgTrash() },
            });
            this._selectedAction = "create";
            this._renderActionMenu();
            this._updateActionButton();
        }
    }

    _bindActionSelectEvents() {
        // ouvrir/fermer
        this.actionButton.addEventListener("click", () => {
            const isOpen =
                this.actionButton.getAttribute("aria-expanded") === "true";
            this._setMenuOpen(!isOpen);
        });

        // clavier sur bouton
        this.actionButton.addEventListener("keydown", (e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                this._setMenuOpen(true);
                this._focusFirstOrLast(e.key === "ArrowUp");
            } else if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                const isOpen =
                    this.actionButton.getAttribute("aria-expanded") === "true";
                this._setMenuOpen(!isOpen);
            }
        });

        // clicks et clavier dans le menu
        this.actionMenu.addEventListener("click", (e) => {
            const li = e.target.closest("[role='option']");
            if (!li) return;
            this.selectAction(li.dataset.key);
            this._setMenuOpen(false);
            this.actionButton.focus();
        });

        this.actionMenu.addEventListener("keydown", (e) => {
            const items = this._menuItems();
            const idx = items.indexOf(document.activeElement);
            if (e.key === "Escape") {
                e.preventDefault();
                this._setMenuOpen(false);
                this.actionButton.focus();
            } else if (e.key === "ArrowDown") {
                e.preventDefault();
                const next = items[(idx + 1) % items.length];
                next?.focus();
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                const prev = items[(idx - 1 + items.length) % items.length];
                prev?.focus();
            } else if (e.key === "Home") {
                e.preventDefault();
                items[0]?.focus();
            } else if (e.key === "End") {
                e.preventDefault();
                items[items.length - 1]?.focus();
            } else if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                const li = document.activeElement;
                if (li?.dataset?.key) {
                    this.selectAction(li.dataset.key);
                    this._setMenuOpen(false);
                    this.actionButton.focus();
                }
            }
        });

        // fermeture click en dehors
        document.addEventListener("click", (e) => {
            if (!this.actionRoot.contains(e.target)) this._setMenuOpen(false);
        });
    }

    _renderActionMenu() {
        // reconstruit la liste visible
        this.actionMenu.innerHTML = "";
        for (const key of this._visibleActions) {
            const def = this._actionsRegistry.get(key);
            if (!def) continue;
            const li = document.createElement("li");
            li.setAttribute("role", "option");
            li.tabIndex = -1;
            li.dataset.key = key;
            li.className = "mdr-action-item";
            li.innerHTML = `
        <span class="mdr-action-item-icon" aria-hidden="true">${def.icon}</span>
        <span class="mdr-action-item-label">${def.label}</span>
      `;
            this.actionMenu.appendChild(li);
        }
        // marquer l’option sélectionnée
        this._updateMenuSelection();
    }

    _updateActionButton() {
        const def = this._actionsRegistry.get(this._selectedAction);
        const iconSpan = this.actionButton.querySelector(".mdr-action-icon");
        const labelSpan = this.actionButton.querySelector(".mdr-action-label");
        iconSpan.innerHTML = def?.icon ?? "";
        labelSpan.textContent = def?.label ?? "";
        this._updateMenuSelection();
    }

    _updateMenuSelection() {
        const items = this._menuItems();
        for (const li of items) {
            const selected = li.dataset.key === this._selectedAction;
            li.setAttribute("aria-selected", String(selected));
            li.classList.toggle("is-selected", selected);
        }
    }

    _setMenuOpen(open) {
        this.actionButton.setAttribute("aria-expanded", String(open));
        this.actionMenu.hidden = !open;
        if (open) this._focusCurrentOrFirst();
    }

    _menuItems() {
        return Array.from(this.actionMenu.querySelectorAll("[role='option']"));
    }

    _focusFirstOrLast(last = false) {
        const items = this._menuItems();
        const el = last ? items[items.length - 1] : items[0];
        el?.focus();
    }

    _focusCurrentOrFirst() {
        const items = this._menuItems();
        const current = items.find(
            (li) => li.dataset.key === this._selectedAction
        );
        (current ?? items[0])?.focus();
    }

    _announceAction(key) {
        // callbacks
        for (const fn of this._actionHandlers) {
            try {
                fn(key);
            } catch {}
        }
        // CustomEvent (si tu veux écouter ailleurs)
        this.container.dispatchEvent(
            new CustomEvent("mdr:action", { detail: { key } })
        );
    }

    // --------- petites icônes SVG inline (tu peux remplacer) -------------------
    _svgPlus() {
        return `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M11 11V5h2v6h6v2h-6v6h-2v-6H5v-2z"/></svg>`;
    }
    _svgReply() {
        return `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M10 9V5l-7 7 7 7v-4.1c6 0 9.5 1.9 11 6.1-.5-6-4-12-11-12z"/></svg>`;
    }
    _svgMail() {
        return `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M20 4H4c-1.1 0-2 .9-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5L4 8V6l8 5 8-5v2z"/></svg>`;
    }
    _svgTrash() {
        return `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M3 6h18v2H3V6zm3 3h12l-1 12H7L6 9zm3-5h6v2H9V4z"/></svg>`;
    }

    // -----------------------------------------------------------
    //           MINI‑COMPOSER : UI + logique de submit
    // -----------------------------------------------------------

    _buildComposer() {
        this.composerRoot = document.createElement("div");
        this.composerRoot.className = "mdr-composer";
        this.composerRoot.hidden = true;

        this.composerForm = document.createElement("form");
        this.composerForm.className = "mdr-composer-form";
        this.composerForm.noValidate = true;

        // zone dynamique
        this.composerFields = document.createElement("div");
        this.composerFields.className = "mdr-composer-fields";

        // barre d’actions
        const actionsBar = document.createElement("div");
        actionsBar.className = "mdr-composer-actions";

        this.composerSubmit = document.createElement("button");
        this.composerSubmit.type = "submit";
        this.composerSubmit.className = "mdr-btn mdr-btn--primary";
        this.composerSubmit.textContent = "Envoyer";

        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "mdr-btn";
        cancelBtn.textContent = "Annuler";
        cancelBtn.addEventListener("click", () => {
            this._hideComposer();
        });

        actionsBar.appendChild(this.composerSubmit);
        actionsBar.appendChild(cancelBtn);

        this.composerForm.appendChild(this.composerFields);
        this.composerForm.appendChild(actionsBar);
        this.composerRoot.appendChild(this.composerForm);
        this.container.appendChild(this.composerRoot);

        // submit → route vers la bonne Resource
        this.composerForm.addEventListener("submit", (e) => {
            e.preventDefault();
            this._handleComposerSubmit();
        });
    }

    _showComposer() {
        this.composerRoot.hidden = false;
    }
    _hideComposer() {
        this.composerRoot.hidden = true;
        this.composerFields.innerHTML = "";
    }

    _inputRow({ label, name, type = "text", placeholder = "", value = "" }) {
        const row = document.createElement("label");
        row.className = "mdr-row";
        const span = document.createElement("span");
        span.className = "mdr-row-label";
        span.textContent = label;
        const input = document.createElement("input");
        input.type = type;
        input.name = name;
        input.placeholder = placeholder;
        input.value = value;
        input.className = "mdr-input";
        row.appendChild(span);
        row.appendChild(input);
        return row;
    }

    _textareaRow({ label, name, placeholder = "", value = "" }) {
        const row = document.createElement("label");
        row.className = "mdr-row";
        const span = document.createElement("span");
        span.className = "mdr-row-label";
        span.textContent = label;
        const ta = document.createElement("textarea");
        ta.name = name;
        ta.placeholder = placeholder;
        ta.value = value;
        ta.rows = 6;
        ta.className = "mdr-textarea";
        row.appendChild(span);
        row.appendChild(ta);
        return row;
    }

    _renderComposerFor(actionKey, ctx) {
        this.composerFields.innerHTML = "";
        this.composerRoot.hidden = false;

        // header accessible
        this.composerRoot.setAttribute("aria-label", `Composer: ${actionKey}`);

        if (actionKey === "create") {
            // créer un topic dans un forum
            this.composerFields.appendChild(
                this._inputRow({
                    label: "Titre",
                    name: "title",
                    placeholder: "Titre du sujet",
                })
            );
            this.composerFields.appendChild(
                this._textareaRow({
                    label: "Contenu",
                    name: "content",
                    placeholder: "Écris ton message…",
                })
            );
            // forumId (visible seulement si non détecté)
            if (!ctx.forumId && !ctx.categoryId) {
                this.composerFields.appendChild(
                    this._inputRow({
                        label: "Forum ID",
                        name: "forumId",
                        type: "number",
                        placeholder: "Ex: 12",
                    })
                );
            }
            this.composerSubmit.textContent = "Créer le sujet";
        }

        if (actionKey === "reply") {
            // répondre dans un topic
            this.composerFields.appendChild(
                this._textareaRow({
                    label: "Réponse",
                    name: "content",
                    placeholder: "Ta réponse…",
                })
            );
            // topicId (si non détecté)
            if (!ctx.topicId && !ctx.resid) {
                this.composerFields.appendChild(
                    this._inputRow({
                        label: "Topic ID",
                        name: "topicId",
                        type: "number",
                        placeholder: "Ex: 345",
                    })
                );
            }
            this.composerSubmit.textContent = "Répondre";
        }

        if (actionKey === "new-pm") {
            // message privé
            this.composerFields.appendChild(
                this._inputRow({
                    label: "Sujet",
                    name: "subject",
                    placeholder: "Sujet du message",
                })
            );
            this.composerFields.appendChild(
                this._textareaRow({
                    label: "Message",
                    name: "content",
                    placeholder: "Ton message…",
                })
            );
            // userId (si non détecté)
            if (!ctx.userId) {
                this.composerFields.appendChild(
                    this._inputRow({
                        label: "Destinataire (userId)",
                        name: "userId",
                        type: "number",
                        placeholder: "Ex: 123",
                    })
                );
            }
            this.composerSubmit.textContent = "Envoyer le MP";
        }

        // focus le 1er champ utile
        const firstInput = this.composerFields.querySelector("input, textarea");
        firstInput?.focus();
    }

    _handleComposerSubmit() {
        const formData = new FormData(this.composerForm);
        const data = Object.fromEntries(formData.entries());
        const key = this._selectedAction;
        const ctx = this.getContext();
        const M =
            typeof window !== "undefined" && window.Moderactor
                ? window.Moderactor
                : null;

        if (!M) {
            console.warn("[Moderactor] API globale introuvable.");
            return;
        }

        // routes concrètes (ajuste les noms méthodes selon tes Resources réelles)
        if (key === "create") {
            const forumId =
                ctx.forumId ??
                ctx.categoryId ??
                (data.forumId ? Number(data.forumId) : null);
            if (!forumId) return this._notifyMissing("forumId");
            const title = (data.title || "").trim();
            const content = (data.content || "").trim();
            if (!title || !content)
                return alert("Titre et contenu sont requis.");
            try {
                M.forum(forumId).createTopic({ title, content });
                this._hideComposer();
            } catch (e) {
                console.error(e);
                alert("Échec de création du sujet.");
            }
        }

        if (key === "reply") {
            const topicId =
                ctx.topicId ??
                ctx.resid ??
                (data.topicId ? Number(data.topicId) : null);
            if (!topicId) return this._notifyMissing("topicId");
            const content = (data.content || "").trim();
            if (!content) return alert("Le contenu est requis.");
            try {
                M.post(topicId).reply({ content });
                this._hideComposer();
            } catch (e) {
                console.error(e);
                alert("Échec de l’envoi de la réponse.");
            }
        }

        if (key === "new-pm") {
            const userId =
                ctx.userId ?? (data.userId ? Number(data.userId) : null);
            const subject = (data.subject || "").trim();
            const content = (data.content || "").trim();
            if (!subject || !content)
                return alert("Sujet et message sont requis.");
            try {
                // si userId absent, à toi de supporter une liste de destinataires à l’avenir
                M.user(userId).message({ subject, content });
                this._hideComposer();
            } catch (e) {
                console.error(e);
                alert("Échec de l’envoi du MP.");
            }
        }
    }

    _confirmAndDelete(ctx) {
        const M =
            typeof window !== "undefined" && window.Moderactor
                ? window.Moderactor
                : null;
        if (!M) return;

        const postId = ctx.postId ?? null;
        const pmId = ctx.pmId ?? null;

        if (!postId && !pmId) {
            return this._notifyMissing("postId/pmId");
        }

        const targetLabel = postId
            ? `le post #${postId}`
            : `le message privé #${pmId}`;
        if (!confirm(`Supprimer définitivement ${targetLabel} ?`)) return;

        try {
            if (postId) {
                M.post(postId).delete();
            } else if (pmId) {
                M.chat().delete(pmId);
            }
            // feedback minimal
            alert("Suppression effectuée.");
        } catch (e) {
            console.error(e);
            alert("Échec de la suppression.");
        }
    }

    // -----------------------------------------------------------
    //           CONTEXTE / DÉTECTION D’ID (déjà en place)
    // -----------------------------------------------------------

    getContext() {
        return this._resolveContext();
    }

    _resolveContext() {
        const a = this.adapter || {};
        const ctx = {
            pagetype: a.pagetype || null,
            resid: a.resid ?? null,
            forumId: a.forumid ?? null,
            categoryId: a.categoryid ?? null,
            topicId: a.topicid ?? null,
            postId: a.postid ?? null,
            userId: a.userid ?? null,
            pmId: a.pmid ?? null,
        };

        const urlData = this._resolveFromUrl();
        for (const k in urlData)
            if (ctx[k] == null && urlData[k] != null) ctx[k] = urlData[k];

        const domData = this._resolveFromDom();
        for (const k in domData)
            if (ctx[k] == null && domData[k] != null) ctx[k] = domData[k];

        return ctx;
    }

    _resolveFromUrl() {
        if (typeof location === "undefined") return {};
        const href = location.href;
        const mTopicPath = href.match(/\/t(\d+)[-\/]?/i);
        const mTopicQ = href.match(/[?&]t=(\d+)/i);
        const mPostPath = href.match(/\/p(\d+)[-\/]?/i);
        const mUserPath = href.match(/\/u(\d+)[-\/]?/i);
        const mForumQ = href.match(/[?&]f=(\d+)/i);
        const mCatQ = href.match(/[?&]c=(\d+)/i);
        const mPmQ = href.match(/[?&](msg|id)=(\d+)/i);

        return {
            topicId: mTopicPath
                ? Number(mTopicPath[1])
                : mTopicQ
                ? Number(mTopicQ[1])
                : null,
            postId: mPostPath ? Number(mPostPath[1]) : null,
            userId: mUserPath ? Number(mUserPath[1]) : null,
            forumId: mForumQ ? Number(mForumQ[1]) : null,
            categoryId: mCatQ ? Number(mCatQ[1]) : null,
            pmId: mPmQ ? Number(mPmQ[2]) : null,
        };
    }

    _resolveFromDom() {
        if (typeof document === "undefined") return {};
        const pickNum = (sel, attr) => {
            const el = document.querySelector(sel);
            const v = el?.getAttribute(attr);
            const n = v && /^\d+$/.test(v) ? Number(v) : null;
            return n ?? null;
        };
        return {
            topicId: pickNum("[data-topic-id]", "data-topic-id"),
            postId: pickNum("[data-post-id]", "data-post-id"),
            userId: pickNum("[data-user-id]", "data-user-id"),
            forumId: pickNum("[data-forum-id]", "data-forum-id"),
            categoryId: pickNum("[data-category-id]", "data-category-id"),
            pmId: pickNum("[data-pm-id]", "data-pm-id"),
        };
    }

    _notifyMissing(name) {
        console.warn(`[Moderactor] impossible d'identifier ${name}.`);
    }

    // action → ressource
    performAction(key) {
        const ctx = this._resolveContext();
        const M =
            typeof window !== "undefined" && window.Moderactor
                ? window.Moderactor
                : null;
        if (!M) return console.warn("[Moderactor] API globale introuvable.");

        switch (key) {
            case "create": {
                // créer un topic dans le forum courant
                const forumId = ctx.forumId ?? ctx.categoryId ?? null;
                if (!forumId) return this._notifyMissing("forumId");
                // ex: ouvrir un composer, ou déclencher un flux natif
                // M.forum(forumId).createTopic({ title: "...", content: "..." });
                console.log("[Action] create → forum:", forumId);
                break;
            }
            case "reply": {
                const topicId = ctx.topicId ?? ctx.resid ?? null;
                if (!topicId) return this._notifyMissing("topicId");
                // M.post(topicId).reply({ content: "..." });
                console.log("[Action] reply → topic:", topicId);
                break;
            }
            case "new-pm": {
                // Depuis un profil, cible l'userId ; depuis inbox, pas de cible
                const userId = ctx.userId ?? null;
                // M.user(userId).message({ subject: "...", content: "..." })
                console.log("[Action] new-pm → user:", userId);
                break;
            }
            case "delete": {
                // selon le pagetype, on supprime un post/message/topic
                const postId = ctx.postId ?? null;
                const msgId = ctx.pmId ?? null;
                console.log("[Action] delete → post:", postId, "pm:", msgId);
                // if (postId) M.post(postId).delete();
                // else if (msgId) M.chat().delete(msgId);
                break;
            }
            default:
                console.warn("[Moderactor] action inconnue:", key);
        }
    }

    // ---------------------------------------------------------------------------
    // internes : résolution du contexte (adapter d'abord, URL/DOM ensuite)

    _resolveContext() {
        const a = this.adapter || {};
        const ctx = {
            pagetype: a.pagetype || null,
            resid: a.resid ?? null, // id principal fourni par l’adapter
            forumId: a.forumid ?? null, // si ton adapter les expose
            categoryId: a.categoryid ?? null,
            topicId: a.topicid ?? null,
            postId: a.postid ?? null,
            userId: a.userid ?? null,
            pmId: a.pmid ?? null,
        };

        // Complète par URL si manquant
        const urlData = this._resolveFromUrl();
        for (const k in urlData)
            if (ctx[k] == null && urlData[k] != null) ctx[k] = urlData[k];

        // DOM hints (facultatif): ex. <meta data-topic-id="123">
        const domData = this._resolveFromDom();
        for (const k in domData)
            if (ctx[k] == null && domData[k] != null) ctx[k] = domData[k];

        return ctx;
    }

    _resolveFromUrl() {
        if (typeof location === "undefined") return {};
        const href = location.href;

        // patterns forumactif (classiques)
        // topic pages: .../t123- , .../topic?p=, ...&t=123
        const mTopicPath = href.match(/\/t(\d+)[-\/]?/i);
        const mTopicQ = href.match(/[?&]t=(\d+)/i);
        const mPostPath = href.match(/\/p(\d+)[-\/]?/i);
        const mUserPath = href.match(/\/u(\d+)[-\/]?/i);
        const mForumQ = href.match(/[?&]f=(\d+)/i);
        const mCatQ = href.match(/[?&]c=(\d+)/i);
        const mPmQ = href.match(/[?&](msg|id)=(\d+)/i); // privmsg

        return {
            topicId: mTopicPath
                ? Number(mTopicPath[1])
                : mTopicQ
                ? Number(mTopicQ[1])
                : null,
            postId: mPostPath ? Number(mPostPath[1]) : null,
            userId: mUserPath ? Number(mUserPath[1]) : null,
            forumId: mForumQ ? Number(mForumQ[1]) : null,
            categoryId: mCatQ ? Number(mCatQ[1]) : null,
            pmId: mPmQ ? Number(mPmQ[2]) : null,
        };
    }

    _resolveFromDom() {
        if (typeof document === "undefined") return {};
        const pickNum = (sel, attr) => {
            const el = document.querySelector(sel);
            const v = el?.getAttribute(attr);
            const n = v && /^\d+$/.test(v) ? Number(v) : null;
            return n ?? null;
        };

        // à toi d’ajouter des hooks si ton thème fournit des data-* (exemples)
        return {
            topicId: pickNum("[data-topic-id]", "data-topic-id"),
            postId: pickNum("[data-post-id]", "data-post-id"),
            userId: pickNum("[data-user-id]", "data-user-id"),
            forumId: pickNum("[data-forum-id]", "data-forum-id"),
            categoryId: pickNum("[data-category-id]", "data-category-id"),
            pmId: pickNum("[data-pm-id]", "data-pm-id"),
        };
    }

    _notifyMissing(name) {
        console.warn(`[Moderactor] impossible d'identifier ${name}.`);
        // tu peux afficher un toast/UI ici si besoin
    }
}

class UIInterface extends BaseInterface {
    build() {
        super.build();

        this.defineActions({
            create: { label: "Créer", icon: this._svgPlus?.() || "" },
            reply: { label: "Répondre", icon: this._svgReply?.() || "" },
            "new-pm": { label: "Nouveau MP", icon: this._svgMail?.() || "" },
            delete: { label: "Supprimer", icon: this._svgTrash?.() || "" },
        });

        const pageType = this.adapter.pagetype;
        console.log(pageType);
        switch (pageType) {
            case "inbox":
                this.setActions(["create", "new-pm", "delete"]);
                this.selectAction("create");
                break;
            case "profile":
            case "topic":
                this.setActions(["new-pm", "ban", "unban"]);
                this.selectAction("new-pm");
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
    get env() {
        const cached = getCachedEnv();
        return cached ?? refreshEnv({ stats: true });
    },
    set env(opts = {}) {
        return refreshEnv(opts);
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
    ui: (options) => {
        if (!getCachedEnv()) refreshEnv({ stats: true });
        return new UIInterface(forumactifAdapter, options);
    },
    adapter: forumactifAdapter,
};

if (typeof window !== "undefined") {
    window.Moderactor = Moderactor;
}

export { Moderactor as default };
//# sourceMappingURL=moderactor.esm.js.map
