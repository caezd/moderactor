// default options and extend with custom
const defaultOptions = {
    targetContainer: null, // if null, append to body
};

export default class BaseInterface {
    constructor(adapter, options) {
        this.adapter = adapter;
        this.options = { ...defaultOptions, ...options };

        // état du sélecteur d’actions
        this._actionsRegistry = new Map(); // key -> { label, iconSVG }
        this._visibleActions = []; // liste des keys visibles
        this._selectedAction = null; // key sélectionnée
        this._actionHandlers = new Set(); // callbacks onAction

        this.build();
    }

    getContext() {
        return this._resolveContext();
    }

    build() {
        if (typeof document === "undefined") return;

        const scope = this.options?.targetContainer || document;
        const existingContainer = scope.querySelector(
            ".moderactor-ui-container"
        );
        if (existingContainer) existingContainer.remove();

        this.container = document.createElement("div");
        this.container.classList.add("moderactor-ui-container");

        const fragment = document.createDocumentFragment();
        fragment.appendChild(this.container);

        (this.options?.targetContainer || document.body).appendChild(fragment);

        this._buildActionSelect();

        this._buildComposer();

        this.onAction((key) => {
            const ctx = this.getContext();
            if (key === "delete") {
                this._confirmAndDelete(ctx);
            } else {
                this._renderComposerFor(key, ctx);
            }
        });

        console.log("Moderactor UI container ready:", this.container);
    }

    defineActions(actionMap) {
        // actionMap: { key: {label: string, icon: string (SVG path or full svg)} }
        for (const [key, def] of Object.entries(actionMap)) {
            const safe = {
                label: def.label ?? key,
                icon: def.icon ?? "", // innerHTML (svg string) ou texte
            };
            this._actionsRegistry.set(key, safe);
        }
        // si rien de visible encore, rendre visibles toutes par défaut
        if (!this._visibleActions.length) {
            this._visibleActions = [...this._actionsRegistry.keys()];
            this._renderActionMenu();
        }
    }

    setActions(keys) {
        // restreint aux clés connues
        this._visibleActions = keys.filter((k) => this._actionsRegistry.has(k));
        // si la sélection actuelle n’est plus visible, bascule sur la première
        if (!this._visibleActions.includes(this._selectedAction)) {
            this._selectedAction = this._visibleActions[0] ?? null;
        }
        this._renderActionMenu();
        this._updateActionButton();
    }

    selectAction(key) {
        if (!this._actionsRegistry.has(key)) return;
        this._selectedAction = key;
        this._updateActionButton();
        this._announceAction(key);
    }

    onAction(fn) {
        if (typeof fn === "function") this._actionHandlers.add(fn);
        return () => this._actionHandlers.delete(fn);
    }

    // compat avec ton appel existant
    morphButtonDropdown(switchOption) {
        this.selectAction(switchOption);
    }
    _buildActionSelect() {
        // wrapper
        this.actionRoot = document.createElement("div");
        this.actionRoot.className = "mdr-action-select";

        // bouton toggle
        this.actionButton = document.createElement("button");
        this.actionButton.type = "button";
        this.actionButton.className = "mdr-action-btn";
        this.actionButton.setAttribute("aria-haspopup", "listbox");
        this.actionButton.setAttribute("aria-expanded", "false");
        this.actionButton.innerHTML = `
      <span class="mdr-action-icon" aria-hidden="true"></span>
      <span class="mdr-action-label"></span>
      <span class="mdr-action-caret" aria-hidden="true">▾</span>
    `;
        this.actionRoot.appendChild(this.actionButton);

        // menu (listbox)
        this.actionMenu = document.createElement("ul");
        this.actionMenu.className = "mdr-action-menu";
        this.actionMenu.setAttribute("role", "listbox");
        this.actionMenu.tabIndex = -1;
        this.actionMenu.hidden = true;
        this.actionRoot.appendChild(this.actionMenu);

        // interactivité
        this._bindActionSelectEvents();

        // insérer dans le container
        this.container.appendChild(this.actionRoot);

        // valeurs par défaut (tu peux les surcharger via defineActions)
        if (this._actionsRegistry.size === 0) {
            this.defineActions({
                create: { label: "Créer", icon: this._svgPlus() },
                reply: { label: "Répondre", icon: this._svgReply() },
                "new-pm": { label: "Nouveau MP", icon: this._svgMail() },
                delete: { label: "Supprimer", icon: this._svgTrash() },
            });
            this._selectedAction = "create";
            this._renderActionMenu();
            this._updateActionButton();
        }
    }

    _bindActionSelectEvents() {
        // ouvrir/fermer
        this.actionButton.addEventListener("click", () => {
            const isOpen =
                this.actionButton.getAttribute("aria-expanded") === "true";
            this._setMenuOpen(!isOpen);
        });

        // clavier sur bouton
        this.actionButton.addEventListener("keydown", (e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                this._setMenuOpen(true);
                this._focusFirstOrLast(e.key === "ArrowUp");
            } else if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                const isOpen =
                    this.actionButton.getAttribute("aria-expanded") === "true";
                this._setMenuOpen(!isOpen);
            }
        });

        // clicks et clavier dans le menu
        this.actionMenu.addEventListener("click", (e) => {
            const li = e.target.closest("[role='option']");
            if (!li) return;
            this.selectAction(li.dataset.key);
            this._setMenuOpen(false);
            this.actionButton.focus();
        });

        this.actionMenu.addEventListener("keydown", (e) => {
            const items = this._menuItems();
            const idx = items.indexOf(document.activeElement);
            if (e.key === "Escape") {
                e.preventDefault();
                this._setMenuOpen(false);
                this.actionButton.focus();
            } else if (e.key === "ArrowDown") {
                e.preventDefault();
                const next = items[(idx + 1) % items.length];
                next?.focus();
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                const prev = items[(idx - 1 + items.length) % items.length];
                prev?.focus();
            } else if (e.key === "Home") {
                e.preventDefault();
                items[0]?.focus();
            } else if (e.key === "End") {
                e.preventDefault();
                items[items.length - 1]?.focus();
            } else if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                const li = document.activeElement;
                if (li?.dataset?.key) {
                    this.selectAction(li.dataset.key);
                    this._setMenuOpen(false);
                    this.actionButton.focus();
                }
            }
        });

        // fermeture click en dehors
        document.addEventListener("click", (e) => {
            if (!this.actionRoot.contains(e.target)) this._setMenuOpen(false);
        });
    }

    _renderActionMenu() {
        // reconstruit la liste visible
        this.actionMenu.innerHTML = "";
        for (const key of this._visibleActions) {
            const def = this._actionsRegistry.get(key);
            if (!def) continue;
            const li = document.createElement("li");
            li.setAttribute("role", "option");
            li.tabIndex = -1;
            li.dataset.key = key;
            li.className = "mdr-action-item";
            li.innerHTML = `
        <span class="mdr-action-item-icon" aria-hidden="true">${def.icon}</span>
        <span class="mdr-action-item-label">${def.label}</span>
      `;
            this.actionMenu.appendChild(li);
        }
        // marquer l’option sélectionnée
        this._updateMenuSelection();
    }

    _updateActionButton() {
        const def = this._actionsRegistry.get(this._selectedAction);
        const iconSpan = this.actionButton.querySelector(".mdr-action-icon");
        const labelSpan = this.actionButton.querySelector(".mdr-action-label");
        iconSpan.innerHTML = def?.icon ?? "";
        labelSpan.textContent = def?.label ?? "";
        this._updateMenuSelection();
    }

    _updateMenuSelection() {
        const items = this._menuItems();
        for (const li of items) {
            const selected = li.dataset.key === this._selectedAction;
            li.setAttribute("aria-selected", String(selected));
            li.classList.toggle("is-selected", selected);
        }
    }

    _setMenuOpen(open) {
        this.actionButton.setAttribute("aria-expanded", String(open));
        this.actionMenu.hidden = !open;
        if (open) this._focusCurrentOrFirst();
    }

    _menuItems() {
        return Array.from(this.actionMenu.querySelectorAll("[role='option']"));
    }

    _focusFirstOrLast(last = false) {
        const items = this._menuItems();
        const el = last ? items[items.length - 1] : items[0];
        el?.focus();
    }

    _focusCurrentOrFirst() {
        const items = this._menuItems();
        const current = items.find(
            (li) => li.dataset.key === this._selectedAction
        );
        (current ?? items[0])?.focus();
    }

    _announceAction(key) {
        // callbacks
        for (const fn of this._actionHandlers) {
            try {
                fn(key);
            } catch {}
        }
        // CustomEvent (si tu veux écouter ailleurs)
        this.container.dispatchEvent(
            new CustomEvent("mdr:action", { detail: { key } })
        );
    }

    // --------- petites icônes SVG inline (tu peux remplacer) -------------------
    _svgPlus() {
        return `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M11 11V5h2v6h6v2h-6v6h-2v-6H5v-2z"/></svg>`;
    }
    _svgReply() {
        return `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M10 9V5l-7 7 7 7v-4.1c6 0 9.5 1.9 11 6.1-.5-6-4-12-11-12z"/></svg>`;
    }
    _svgMail() {
        return `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M20 4H4c-1.1 0-2 .9-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5L4 8V6l8 5 8-5v2z"/></svg>`;
    }
    _svgTrash() {
        return `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M3 6h18v2H3V6zm3 3h12l-1 12H7L6 9zm3-5h6v2H9V4z"/></svg>`;
    }

    // -----------------------------------------------------------
    //           MINI‑COMPOSER : UI + logique de submit
    // -----------------------------------------------------------

    _buildComposer() {
        this.composerRoot = document.createElement("div");
        this.composerRoot.className = "mdr-composer";
        this.composerRoot.hidden = true;

        this.composerForm = document.createElement("form");
        this.composerForm.className = "mdr-composer-form";
        this.composerForm.noValidate = true;

        // zone dynamique
        this.composerFields = document.createElement("div");
        this.composerFields.className = "mdr-composer-fields";

        // barre d’actions
        const actionsBar = document.createElement("div");
        actionsBar.className = "mdr-composer-actions";

        this.composerSubmit = document.createElement("button");
        this.composerSubmit.type = "submit";
        this.composerSubmit.className = "mdr-btn mdr-btn--primary";
        this.composerSubmit.textContent = "Envoyer";

        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "mdr-btn";
        cancelBtn.textContent = "Annuler";
        cancelBtn.addEventListener("click", () => {
            this._hideComposer();
        });

        actionsBar.appendChild(this.composerSubmit);
        actionsBar.appendChild(cancelBtn);

        this.composerForm.appendChild(this.composerFields);
        this.composerForm.appendChild(actionsBar);
        this.composerRoot.appendChild(this.composerForm);
        this.container.appendChild(this.composerRoot);

        // submit → route vers la bonne Resource
        this.composerForm.addEventListener("submit", (e) => {
            e.preventDefault();
            this._handleComposerSubmit();
        });
    }

    _showComposer() {
        this.composerRoot.hidden = false;
    }
    _hideComposer() {
        this.composerRoot.hidden = true;
        this.composerFields.innerHTML = "";
    }

    _inputRow({ label, name, type = "text", placeholder = "", value = "" }) {
        const row = document.createElement("label");
        row.className = "mdr-row";
        const span = document.createElement("span");
        span.className = "mdr-row-label";
        span.textContent = label;
        const input = document.createElement("input");
        input.type = type;
        input.name = name;
        input.placeholder = placeholder;
        input.value = value;
        input.className = "mdr-input";
        row.appendChild(span);
        row.appendChild(input);
        return row;
    }

    _textareaRow({ label, name, placeholder = "", value = "" }) {
        const row = document.createElement("label");
        row.className = "mdr-row";
        const span = document.createElement("span");
        span.className = "mdr-row-label";
        span.textContent = label;
        const ta = document.createElement("textarea");
        ta.name = name;
        ta.placeholder = placeholder;
        ta.value = value;
        ta.rows = 6;
        ta.className = "mdr-textarea";
        row.appendChild(span);
        row.appendChild(ta);
        return row;
    }

    _renderComposerFor(actionKey, ctx) {
        this.composerFields.innerHTML = "";
        this.composerRoot.hidden = false;

        // header accessible
        this.composerRoot.setAttribute("aria-label", `Composer: ${actionKey}`);

        if (actionKey === "create") {
            // créer un topic dans un forum
            this.composerFields.appendChild(
                this._inputRow({
                    label: "Titre",
                    name: "title",
                    placeholder: "Titre du sujet",
                })
            );
            this.composerFields.appendChild(
                this._textareaRow({
                    label: "Contenu",
                    name: "content",
                    placeholder: "Écris ton message…",
                })
            );
            // forumId (visible seulement si non détecté)
            if (!ctx.forumId && !ctx.categoryId) {
                this.composerFields.appendChild(
                    this._inputRow({
                        label: "Forum ID",
                        name: "forumId",
                        type: "number",
                        placeholder: "Ex: 12",
                    })
                );
            }
            this.composerSubmit.textContent = "Créer le sujet";
        }

        if (actionKey === "reply") {
            // répondre dans un topic
            this.composerFields.appendChild(
                this._textareaRow({
                    label: "Réponse",
                    name: "content",
                    placeholder: "Ta réponse…",
                })
            );
            // topicId (si non détecté)
            if (!ctx.topicId && !ctx.resid) {
                this.composerFields.appendChild(
                    this._inputRow({
                        label: "Topic ID",
                        name: "topicId",
                        type: "number",
                        placeholder: "Ex: 345",
                    })
                );
            }
            this.composerSubmit.textContent = "Répondre";
        }

        if (actionKey === "new-pm") {
            // message privé
            this.composerFields.appendChild(
                this._inputRow({
                    label: "Sujet",
                    name: "subject",
                    placeholder: "Sujet du message",
                })
            );
            this.composerFields.appendChild(
                this._textareaRow({
                    label: "Message",
                    name: "content",
                    placeholder: "Ton message…",
                })
            );
            // userId (si non détecté)
            if (!ctx.userId) {
                this.composerFields.appendChild(
                    this._inputRow({
                        label: "Destinataire (userId)",
                        name: "userId",
                        type: "number",
                        placeholder: "Ex: 123",
                    })
                );
            }
            this.composerSubmit.textContent = "Envoyer le MP";
        }

        // focus le 1er champ utile
        const firstInput = this.composerFields.querySelector("input, textarea");
        firstInput?.focus();
    }

    _handleComposerSubmit() {
        const formData = new FormData(this.composerForm);
        const data = Object.fromEntries(formData.entries());
        const key = this._selectedAction;
        const ctx = this.getContext();
        const M =
            typeof window !== "undefined" && window.Moderactor
                ? window.Moderactor
                : null;

        if (!M) {
            console.warn("[Moderactor] API globale introuvable.");
            return;
        }

        // routes concrètes (ajuste les noms méthodes selon tes Resources réelles)
        if (key === "create") {
            const forumId =
                ctx.forumId ??
                ctx.categoryId ??
                (data.forumId ? Number(data.forumId) : null);
            if (!forumId) return this._notifyMissing("forumId");
            const title = (data.title || "").trim();
            const content = (data.content || "").trim();
            if (!title || !content)
                return alert("Titre et contenu sont requis.");
            try {
                M.forum(forumId).createTopic({ title, content });
                this._hideComposer();
            } catch (e) {
                console.error(e);
                alert("Échec de création du sujet.");
            }
        }

        if (key === "reply") {
            const topicId =
                ctx.topicId ??
                ctx.resid ??
                (data.topicId ? Number(data.topicId) : null);
            if (!topicId) return this._notifyMissing("topicId");
            const content = (data.content || "").trim();
            if (!content) return alert("Le contenu est requis.");
            try {
                M.post(topicId).reply({ content });
                this._hideComposer();
            } catch (e) {
                console.error(e);
                alert("Échec de l’envoi de la réponse.");
            }
        }

        if (key === "new-pm") {
            const userId =
                ctx.userId ?? (data.userId ? Number(data.userId) : null);
            const subject = (data.subject || "").trim();
            const content = (data.content || "").trim();
            if (!subject || !content)
                return alert("Sujet et message sont requis.");
            try {
                // si userId absent, à toi de supporter une liste de destinataires à l’avenir
                M.user(userId).message({ subject, content });
                this._hideComposer();
            } catch (e) {
                console.error(e);
                alert("Échec de l’envoi du MP.");
            }
        }
    }

    _confirmAndDelete(ctx) {
        const M =
            typeof window !== "undefined" && window.Moderactor
                ? window.Moderactor
                : null;
        if (!M) return;

        const postId = ctx.postId ?? null;
        const pmId = ctx.pmId ?? null;

        if (!postId && !pmId) {
            return this._notifyMissing("postId/pmId");
        }

        const targetLabel = postId
            ? `le post #${postId}`
            : `le message privé #${pmId}`;
        if (!confirm(`Supprimer définitivement ${targetLabel} ?`)) return;

        try {
            if (postId) {
                M.post(postId).delete();
            } else if (pmId) {
                M.chat().delete(pmId);
            }
            // feedback minimal
            alert("Suppression effectuée.");
        } catch (e) {
            console.error(e);
            alert("Échec de la suppression.");
        }
    }

    // -----------------------------------------------------------
    //           CONTEXTE / DÉTECTION D’ID (déjà en place)
    // -----------------------------------------------------------

    getContext() {
        return this._resolveContext();
    }

    _resolveContext() {
        const a = this.adapter || {};
        const ctx = {
            pagetype: a.pagetype || null,
            resid: a.resid ?? null,
            forumId: a.forumid ?? null,
            categoryId: a.categoryid ?? null,
            topicId: a.topicid ?? null,
            postId: a.postid ?? null,
            userId: a.userid ?? null,
            pmId: a.pmid ?? null,
        };

        const urlData = this._resolveFromUrl();
        for (const k in urlData)
            if (ctx[k] == null && urlData[k] != null) ctx[k] = urlData[k];

        const domData = this._resolveFromDom();
        for (const k in domData)
            if (ctx[k] == null && domData[k] != null) ctx[k] = domData[k];

        return ctx;
    }

    _resolveFromUrl() {
        if (typeof location === "undefined") return {};
        const href = location.href;
        const mTopicPath = href.match(/\/t(\d+)[-\/]?/i);
        const mTopicQ = href.match(/[?&]t=(\d+)/i);
        const mPostPath = href.match(/\/p(\d+)[-\/]?/i);
        const mUserPath = href.match(/\/u(\d+)[-\/]?/i);
        const mForumQ = href.match(/[?&]f=(\d+)/i);
        const mCatQ = href.match(/[?&]c=(\d+)/i);
        const mPmQ = href.match(/[?&](msg|id)=(\d+)/i);

        return {
            topicId: mTopicPath
                ? Number(mTopicPath[1])
                : mTopicQ
                ? Number(mTopicQ[1])
                : null,
            postId: mPostPath ? Number(mPostPath[1]) : null,
            userId: mUserPath ? Number(mUserPath[1]) : null,
            forumId: mForumQ ? Number(mForumQ[1]) : null,
            categoryId: mCatQ ? Number(mCatQ[1]) : null,
            pmId: mPmQ ? Number(mPmQ[2]) : null,
        };
    }

    _resolveFromDom() {
        if (typeof document === "undefined") return {};
        const pickNum = (sel, attr) => {
            const el = document.querySelector(sel);
            const v = el?.getAttribute(attr);
            const n = v && /^\d+$/.test(v) ? Number(v) : null;
            return n ?? null;
        };
        return {
            topicId: pickNum("[data-topic-id]", "data-topic-id"),
            postId: pickNum("[data-post-id]", "data-post-id"),
            userId: pickNum("[data-user-id]", "data-user-id"),
            forumId: pickNum("[data-forum-id]", "data-forum-id"),
            categoryId: pickNum("[data-category-id]", "data-category-id"),
            pmId: pickNum("[data-pm-id]", "data-pm-id"),
        };
    }

    _notifyMissing(name) {
        console.warn(`[Moderactor] impossible d'identifier ${name}.`);
    }

    // action → ressource
    performAction(key) {
        const ctx = this._resolveContext();
        const M =
            typeof window !== "undefined" && window.Moderactor
                ? window.Moderactor
                : null;
        if (!M) return console.warn("[Moderactor] API globale introuvable.");

        switch (key) {
            case "create": {
                // créer un topic dans le forum courant
                const forumId = ctx.forumId ?? ctx.categoryId ?? null;
                if (!forumId) return this._notifyMissing("forumId");
                // ex: ouvrir un composer, ou déclencher un flux natif
                // M.forum(forumId).createTopic({ title: "...", content: "..." });
                console.log("[Action] create → forum:", forumId);
                break;
            }
            case "reply": {
                const topicId = ctx.topicId ?? ctx.resid ?? null;
                if (!topicId) return this._notifyMissing("topicId");
                // M.post(topicId).reply({ content: "..." });
                console.log("[Action] reply → topic:", topicId);
                break;
            }
            case "new-pm": {
                // Depuis un profil, cible l'userId ; depuis inbox, pas de cible
                const userId = ctx.userId ?? null;
                // M.user(userId).message({ subject: "...", content: "..." })
                console.log("[Action] new-pm → user:", userId);
                break;
            }
            case "delete": {
                // selon le pagetype, on supprime un post/message/topic
                const postId = ctx.postId ?? null;
                const msgId = ctx.pmId ?? null;
                console.log("[Action] delete → post:", postId, "pm:", msgId);
                // if (postId) M.post(postId).delete();
                // else if (msgId) M.chat().delete(msgId);
                break;
            }
            default:
                console.warn("[Moderactor] action inconnue:", key);
        }
    }

    // ---------------------------------------------------------------------------
    // internes : résolution du contexte (adapter d'abord, URL/DOM ensuite)

    _resolveContext() {
        const a = this.adapter || {};
        const ctx = {
            pagetype: a.pagetype || null,
            resid: a.resid ?? null, // id principal fourni par l’adapter
            forumId: a.forumid ?? null, // si ton adapter les expose
            categoryId: a.categoryid ?? null,
            topicId: a.topicid ?? null,
            postId: a.postid ?? null,
            userId: a.userid ?? null,
            pmId: a.pmid ?? null,
        };

        // Complète par URL si manquant
        const urlData = this._resolveFromUrl();
        for (const k in urlData)
            if (ctx[k] == null && urlData[k] != null) ctx[k] = urlData[k];

        // DOM hints (facultatif): ex. <meta data-topic-id="123">
        const domData = this._resolveFromDom();
        for (const k in domData)
            if (ctx[k] == null && domData[k] != null) ctx[k] = domData[k];

        return ctx;
    }

    _resolveFromUrl() {
        if (typeof location === "undefined") return {};
        const href = location.href;

        // patterns forumactif (classiques)
        // topic pages: .../t123- , .../topic?p=, ...&t=123
        const mTopicPath = href.match(/\/t(\d+)[-\/]?/i);
        const mTopicQ = href.match(/[?&]t=(\d+)/i);
        const mPostPath = href.match(/\/p(\d+)[-\/]?/i);
        const mUserPath = href.match(/\/u(\d+)[-\/]?/i);
        const mForumQ = href.match(/[?&]f=(\d+)/i);
        const mCatQ = href.match(/[?&]c=(\d+)/i);
        const mPmQ = href.match(/[?&](msg|id)=(\d+)/i); // privmsg

        return {
            topicId: mTopicPath
                ? Number(mTopicPath[1])
                : mTopicQ
                ? Number(mTopicQ[1])
                : null,
            postId: mPostPath ? Number(mPostPath[1]) : null,
            userId: mUserPath ? Number(mUserPath[1]) : null,
            forumId: mForumQ ? Number(mForumQ[1]) : null,
            categoryId: mCatQ ? Number(mCatQ[1]) : null,
            pmId: mPmQ ? Number(mPmQ[2]) : null,
        };
    }

    _resolveFromDom() {
        if (typeof document === "undefined") return {};
        const pickNum = (sel, attr) => {
            const el = document.querySelector(sel);
            const v = el?.getAttribute(attr);
            const n = v && /^\d+$/.test(v) ? Number(v) : null;
            return n ?? null;
        };

        // à toi d’ajouter des hooks si ton thème fournit des data-* (exemples)
        return {
            topicId: pickNum("[data-topic-id]", "data-topic-id"),
            postId: pickNum("[data-post-id]", "data-post-id"),
            userId: pickNum("[data-user-id]", "data-user-id"),
            forumId: pickNum("[data-forum-id]", "data-forum-id"),
            categoryId: pickNum("[data-category-id]", "data-category-id"),
            pmId: pickNum("[data-pm-id]", "data-pm-id"),
        };
    }

    _notifyMissing(name) {
        console.warn(`[Moderactor] impossible d'identifier ${name}.`);
        // tu peux afficher un toast/UI ici si besoin
    }
}
