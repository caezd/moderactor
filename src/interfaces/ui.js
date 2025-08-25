import BaseInterface from "./_base.js";

export default class UIInterface extends BaseInterface {
    build() {
        super.build();

        this.defineActions({
            create: { label: "Créer", icon: this._svgPlus?.() || "" },
            reply: { label: "Répondre", icon: this._svgReply?.() || "" },
            "new-pm": { label: "Nouveau MP", icon: this._svgMail?.() || "" },
            delete: { label: "Supprimer", icon: this._svgTrash?.() || "" },
        });

        const pageType = this.adapter.pagetype;
        console.log(pageType);
        switch (pageType) {
            case "inbox":
                this.setActions(["create", "new-pm", "delete"]);
                this.selectAction("create");
                break;

                break;
            case "profile":
            case "topic":
                this.setActions(["new-pm", "ban", "unban"]);
                this.selectAction("new-pm");
                break;
                /**
                 * Build the profile UI components
                 * which means :
                 * we need to filter what actions are possibles based on the current page
                 * edit profile, ban, unban user, etc.
                 * when viewing a profile, put "new private message" to this user button dropdown (from BaseInterface and already built inside this.container) as first and already selected
                 */
                break;
            case "forum":
                break;
            case "category":
                break;
            case "topic":
                /**
                 * Build the topic UI components
                 * which means :
                 * we need to filter what actions are possibles based on the current page
                 * like reply to topic, report topic, etc.
                 * when viewing a topic, put "reply" button dropdown (from BaseInterface and already built inside this.container) as first and already selected
                 */
                this.morphButtonDropdown("reply");
                break;
            default:
                break;
        }
    }
}
