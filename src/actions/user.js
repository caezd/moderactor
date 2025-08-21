import { BaseResource } from "./_base.js";

export default class UserResource extends BaseResource {
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
