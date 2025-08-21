import forumactifAdapter from "./adapters/forumactif.js";
import ForumResource from "./actions/forum.js";
import TopicResource from "./actions/topic.js";
import PostResource from "./actions/post.js";
import UserResource from "./actions/user.js";
import ChatResource from "./actions/chat.js";

const Moderactor = {
    forum: (idOrArray) => new ForumResource(idOrArray, forumactifAdapter),
    topic: (idOrArray) => new TopicResource(idOrArray, forumactifAdapter),
    post: (idOrArray) => new PostResource(idOrArray, forumactifAdapter),
    user: (idOrArray) => new UserResource(idOrArray, forumactifAdapter),
    chat: () => new ChatResource(forumactifAdapter),
    adapter: forumactifAdapter,
};

if (typeof window !== "undefined") {
    window.Moderactor = Moderactor;
}

export default Moderactor;
