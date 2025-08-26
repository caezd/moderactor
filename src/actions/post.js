// actions/post.js
import { BaseResource } from "./_base.js";
import { resolveTopicId, resolveForumId } from "../core/moderation.js";

export default class PostResource extends BaseResource {
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
