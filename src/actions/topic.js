import { BaseResource } from "./_base.js";

export default class TopicResource extends BaseResource {
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
