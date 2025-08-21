import { BaseResource } from "./_base.js";

export default class ChatResource extends BaseResource {
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
