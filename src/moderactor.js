import forumactifAdapter from "./adapters/forumactif.js";
import ForumResource from "./actions/forum.js";
import TopicResource from "./actions/topic.js";
import PostResource from "./actions/post.js";
import UserResource from "./actions/user.js";
import ChatResource from "./actions/chat.js";
import { env as envFn } from "./env.js";

const ENV_GLOBAL_KEY = "__MODERACTOR_ENV__";

const getGlobal = () => {
    if (typeof globalThis !== "undefined") return globalThis;
    if (typeof window !== "undefined") return window;
    if (typeof global !== "undefined") return global;
    return {};
};

function cacheEnv(value) {
    const g = getGlobal();
    Moderactor._env = value;
    try {
        g[ENV_GLOBAL_KEY] = value;
    } catch {}
    return value;
}

function getCachedEnv() {
    if (Moderactor._env) return Moderactor._env;
    const g = getGlobal();
    if (g[ENV_GLOBAL_KEY]) return (Moderactor._env = g[ENV_GLOBAL_KEY]);
    return null;
}

function refreshEnv(opts = {}) {
    const computed = envFn(opts);
    return cacheEnv(computed);
}

const Moderactor = {
    get env() {
        const cached = getCachedEnv();
        return cached ?? refreshEnv({ stats: true });
    },
    set env(opts = {}) {
        return refreshEnv(opts);
    },
    forum: (idOrArray) => {
        if (!getCachedEnv()) refreshEnv({ stats: true });
        new ForumResource(idOrArray, forumactifAdapter);
    },
    topic: (idOrArray) => {
        if (!getCachedEnv()) refreshEnv({ stats: true });
        new TopicResource(idOrArray, forumactifAdapter);
    },
    post: (idOrArray) => {
        if (!getCachedEnv()) refreshEnv({ stats: true });
        new PostResource(idOrArray, forumactifAdapter);
    },
    user: (idOrArray) => {
        if (!getCachedEnv()) refreshEnv({ stats: true });
        new UserResource(idOrArray, forumactifAdapter);
    },
    chat: () => {
        if (!getCachedEnv()) refreshEnv({ stats: true });
        new ChatResource(forumactifAdapter);
    },
    adapter: forumactifAdapter,
};

if (typeof window !== "undefined") {
    window.Moderactor = Moderactor;
}

export default Moderactor;
