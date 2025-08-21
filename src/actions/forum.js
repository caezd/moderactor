import { BaseResource } from "./_base.js";

export default class ForumResource extends BaseResource {
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
