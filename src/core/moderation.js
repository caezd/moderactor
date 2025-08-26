/**
 * Récupère l'id du topic (input name="t") à partir d'un post via la page quote,
 * si explicitTopicId est absent.
 * @param {object} adapter - doit exposer getForm(url, selector)
 * @param {number|string|undefined|null} explicitTopicId
 * @param {number|string} postId
 * @returns {Promise<number>}
 */
export async function resolveTopicId(adapter, explicitTopicId, postId) {
    if (explicitTopicId != null) return Number(explicitTopicId);

    const form = await adapter.getForm(
        `/post?p=${postId}&mode=quote`,
        'form[method="post"]'
    );
    if (!form?.ok) {
        throw new Error(
            "resolveTopicId: impossible de récupérer le topic via quote()"
        );
    }
    const t = parseInt(form.data?.t, 10);
    if (!t) throw new Error("resolveTopicId: topicId introuvable (form quote)");
    return t;
}

/**
 * Récupère l'id du forum du topic (input name="f") via la page move,
 * si explicitForumId est absent.
 * @param {object} adapter - doit exposer getForm(url, selector)
 * @param {number|string} topicId
 * @param {number|string|undefined|null} explicitForumId
 * @param {number|string} tid - token modcp
 * @returns {Promise<number>}
 */
export async function resolveForumId(adapter, topicId, explicitForumId, tid) {
    if (explicitForumId != null) return Number(explicitForumId);

    const form = await adapter.getForm(
        `/modcp?mode=move&t=${topicId}&tid=${tid}`,
        'form[method="post"]'
    );
    if (!form?.ok) {
        throw new Error(
            "resolveForumId: impossible de récupérer le forum du topic"
        );
    }
    const f = parseInt(form.data?.f, 10);
    if (!f) throw new Error("resolveForumId: forumId introuvable (form move)");
    return f;
}
