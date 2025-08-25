import BaseInterface from "./_base.js";

export default class UIInterface extends BaseInterface {
  build() {
    const pageType = this.adapter.pagetype;
    console.log(pageType);
    switch (pageType) {
      case "inbox":
        /**
         * Build the inbox UI components
         * which means :
         * we need to filter what actions are possibles based on the current page
         * like delete a message when reading it, or reply to it, or mark it as unread, etc.
         * when inside the inbox, put "create" button dropdown (from BaseInterface and already built inside this.container) as first and already selected
         */
        this.morphButtonDropdown("create");

        // add "delete" button dropdown (from BaseInterface and already built inside this.container) as second and already selected
        //this.addUiButton("delete", 'pm', this.adapter.resid);

        break;
      case "profile":
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
