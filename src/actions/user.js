import { BaseResource } from "./_base.js";
import { extractBreadcrumbs } from "../core/jsonld.js";
import { toNFC, isNumericId, uniqueNFC } from "../core/utils.js";

export async function fetchUsernameById(adapter, id) {
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

export async function resolveRecipients(adapter, input) {
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

export default class UserResource extends BaseResource {
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
