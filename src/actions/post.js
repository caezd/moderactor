import { BaseResource } from "./_base.js";

export default class PostResource extends BaseResource {
    async remove() {
        const tasks = this.ids.map((p) =>
            this.adapter
                .post("/post", { p, mode: "delete", confirm: "" })
                .then((r) => this.adapter.bridge(r))
        );
        return this._all(tasks);
    }

    async change({ message }) {
        if (!message) throw new Error("Post.change: message requis");
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
