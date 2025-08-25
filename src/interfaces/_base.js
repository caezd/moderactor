// default options and extend with custom
const defaultOptions = {
  targetContainer: null, // if null, append to body
};

export default class BaseInterface {
  constructor(adapter, options) {
    this.adapter = adapter;
    this.options = { ...defaultOptions, ...options };
    this.build();
  }

  build() {
    // Build the UI components here using this.adapter and this.options
    // first, build the main container, with some classes and attributes, with document fragment?
    // Remove any existing container to avoid duplicates
    const existingContainer = document.querySelector(
      ".moderactor-ui-container"
    );
    if (existingContainer) {
      existingContainer.parentNode.removeChild(existingContainer);
    }

    this.container = document.createElement("div");
    this.container.classList.add("moderactor-ui-container");

    const fragment = document.createDocumentFragment();
    fragment.appendChild(this.container);

    // Append the fragment to the target container or the body
    if (this.options && this.options.targetContainer) {
      this.options.targetContainer.appendChild(fragment);
    } else {
      document.body.appendChild(fragment);
    }
    console.log(fragment, this.content);

    /**
     * Build a dropdown button that opens a form to post something, allowing users to quickly create new content.
     * The dropdown button should be easily accessible and visually distinct.
     * The form should include fields for the content title and body, and which type of content to create (e.g., new topic, new private message, etc.)
     */
  }

  morphDropdownButton(switchOption) {
    console.log("morphDropdownButton", switchOption);
    /* const dropdownButton = this.container.querySelector('.moderactor-dropdown-button');
        const form = dropdownButton.querySelector('.moderactor-post-form');

        // Update the form fields based on the selected option
        switch (switchOption) {
            case 'new-pm':
                form.querySelector('select[name="content-type"]').value = 'pm';
                break;
            case 'reply-topic':
                form.querySelector('select[name="content-type"]').value = 'reply';
                break;
            default:
                break;
        }
                */
  }
}
