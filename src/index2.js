// Moderactor.mjs — ESM + script embarqué (Forumactif)
// v0.1 2025-08-21
// Objectif : fournir un objet global `Moderactor` et un export ESM par défaut
// API (exemples) :
// Moderactor.topic(1).lock()
// Moderactor.topic(1).post({ message: "..." })
// Moderactor.forum(42).post({ subject: "Titre", message: "Corps" })
// const res = await Moderactor.user(123).pm({ subject:"…", message:"…" })

// ───────────────────────────────────────────────────────────────────────────────
// Utilitaires communs
// ───────────────────────────────────────────────────────────────────────────────

const isArray = Array.isArray;
const toArray = (v) => (v == null ? [] : isArray(v) ? v : [v]);

function byIdOrArray(input) {
    const arr = toArray(input)
        .filter((x) => x != null)
        .map((x) => (typeof x === "number" ? x : parseInt(String(x), 10)))
        .filter((x) => Number.isFinite(x) && x > 0);
    return arr;
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

function findFirst(el, selector) {
    return el.querySelector(selector) || undefined;
}

// ───────────────────────────────────────────────────────────────────────────────
// Adaptateur Forumactif (transport + helpers spécifiques)
// ───────────────────────────────────────────────────────────────────────────────
const Forumactif = {
    get tid() {
        // tente: input[name=tid] puis lien &tid=…
        const input = document.querySelector("input[name=tid]");
        if (input?.value) return input.value;
        const href =
            document.querySelector("a[href*='&tid=']")?.getAttribute("href") ||
            "";
        const m = href.match(/[?&]tid=([a-z0-9]+)/i);
        return m ? m[1] : "";
    },

    get pagetype() {
        const p = location.pathname;
        if (/^\/t\d+(p\d+)?-/.test(p)) return "topic";
        if (/^\/f\d+(p\d+)?-/.test(p)) return "forum";
        if (/^\/c\d+-/.test(p)) return "category";
        return "";
    },

    async get(url) {
        const r = await fetch(url, { credentials: "same-origin" });
        const text = await r.text();
        return { ok: r.ok, status: r.status, text, doc: htmlFromText(text) };
    },

    async post(url, data) {
        const body = encodeForm(data);

        const r = await fetch(url, {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "Content-Type":
                    "application/x-www-form-urlencoded;charset=UTF-8",
            },
            body,
        });
        const text = await r.text();
        return { ok: r.ok, status: r.status, text, doc: htmlFromText(text) };
    },

    // Extraction minimale des retours serveurs FA (succès / message / ids)
    bridge(resp) {
        const { text, doc } = resp;
        // Message :
        const msg =
            doc
                .querySelector(
                    ".message, .main-content p.center, .box-content.error p, .msg, h2 + p"
                )
                ?.textContent?.trim() || "";

        // Déductions basiques d'ids via URL présentes dans les liens de confirmation
        const firstLink = doc.querySelector("a[href]");
        const href = firstLink?.getAttribute("href") || "";
        const t = href.match(/\/(?:viewtopic\?.*t=|t)(\d+)/)?.[1];
        const f = href.match(/\/f(\d+)-/)?.[1];
        const p = href.match(/#(\d+)$/)?.[1];

        return {
            ok: resp.ok,
            message: msg,
            topic_id: t ? Number(t) : undefined,
            forum_id: f ? Number(f) : undefined,
            post_id: p ? Number(p) : undefined,
            href,
            raw: text,
        };
    },

    // Récupère un formulaire existant pour conserver les champs obligatoires (token, etc.)
    async getForm(url, formSelector) {
        const { ok, doc, status, text } = await this.get(url);
        if (!ok) return { ok, status, text };
        const form = doc.querySelector(formSelector);
        if (!form) return { ok: false, status: 404, text: "Form not found" };
        const fd = new FormData(form);
        const obj = Object.fromEntries(fd.entries());
        return { ok: true, data: obj, doc };
    },
};

// ───────────────────────────────────────────────────────────────────────────────
// Cœur Moderactor
// ───────────────────────────────────────────────────────────────────────────────
class Base {
    constructor(ids) {
        this.ids = byIdOrArray(ids);
    }
    _all(promises) {
        return Promise.all(promises);
    }
}

class ForumResource extends Base {
    async post(input) {
        const { subject, message, notify = 0 } = input || {};
        if (!subject || !message)
            throw new Error("Forum.post: subject et message sont requis");

        const tid = Forumactif.tid;
        const tasks = this.ids.map((f) =>
            Forumactif.post("/post", {
                post: 1,
                mode: "newtopic",
                f,
                subject,
                message,
                notify,
            }).then((r) => Forumactif.bridge(r))
        );
        return this._all(tasks);
    }
}

class TopicResource extends Base {
    async post(input) {
        const { message, notify = 0 } = input || {};
        if (!message) throw new Error("Topic.post: message est requis");
        const tasks = this.ids.map((t) =>
            Forumactif.post("/post", {
                post: 1,
                mode: "reply",
                t,
                message,
                notify,
            }).then((r) => Forumactif.bridge(r))
        );
        return this._all(tasks);
    }
    async lock() {
        const tid = Forumactif.tid;
        const tasks = this.ids.map((t) =>
            Forumactif.get(`/modcp?mode=lock&t=${t}&tid=${tid}`).then((r) =>
                Forumactif.bridge(r)
            )
        );
        return this._all(tasks);
    }
    async unlock() {
        const tid = Forumactif.tid;
        const tasks = this.ids.map((t) =>
            Forumactif.post(`/modcp?mode=unlock&t=${t}&tid=${tid}`).then((r) =>
                Forumactif.bridge(r)
            )
        );
        return this._all(tasks);
    }
    async move(newForumId) {
        if (!newForumId) throw new Error("Topic.move: forum id manquant");
        const tid = Forumactif.tid;
        const tasks = this.ids.map((t) =>
            Forumactif.post(`/modcp?tid=${tid}`, {
                tid,
                new_forum: "f" + newForumId,
                mode: "move",
                t,
                confirm: 1,
            }).then((r) => Forumactif.bridge(r))
        );
        return this._all(tasks);
    }

    async trash() {
        const tid = Forumactif.tid;
        const tasks = this.ids.map((t) =>
            Forumactif.get(`/modcp?mode=trash&t=${t}&tid=${tid}`).then((r) =>
                Forumactif.bridge(r)
            )
        );
        return this._all(tasks);
    }

    async remove() {
        const tid = Forumactif.tid;
        const tasks = this.ids.map((t) =>
            Forumactif.post(`/modcp?tid=${tid}`, {
                t,
                mode: "delete",
                confirm: 1,
            }).then((r) => Forumactif.bridge(r))
        );
        return this._all(tasks);
    }
}

// ───────────────────────────────────────────────────────────────────────────────
// Fabrique Moderactor
// ───────────────────────────────────────────────────────────────────────────────
const Moderactor = {
    forum: (idOrArray) => new ForumResource(idOrArray),
    topic: (idOrArray) => new TopicResource(idOrArray),
    post: (idOrArray) => new PostResource(idOrArray),
    user: (idOrArray) => new UserResource(idOrArray),
    chat: () => new ChatResource(),
    utils: { Forumactif },
};

// Rendre disponible en global pour un "script embarqué" (injection fin de page)
if (typeof window !== "undefined") {
    window.Moderactor = Moderactor;
}

export default Moderactor;
