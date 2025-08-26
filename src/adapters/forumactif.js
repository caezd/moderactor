import { Adapter } from "../core/adapter.js";
import { httpGet, httpPost } from "../core/requests.js";
import { state } from "../core/state.js";
import { bridgeParse } from "./bridge.js";

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
export default forumactifAdapter;
