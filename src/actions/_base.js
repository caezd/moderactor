import { byIdOrArray } from "../core/utils.js";

export class BaseResource {
    constructor(ids, adapter) {
        this.ids = byIdOrArray(ids);
        this.adapter = adapter;
    }
    _all(promises) {
        return Promise.all(promises);
    }
}
