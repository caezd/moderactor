export class Adapter {
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
