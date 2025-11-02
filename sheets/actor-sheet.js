/**
 * Extend the basic ActorSheet for Hack100 characters
 */
export class Hack100ActorSheet extends ActorSheet {
  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["hack100", "sheet", "actor"],
      template: "systems/hack100/templates/actor-sheet.hbs",
      width: 1000,
      height: 1080,
      tabs: [
        {
          navSelector: ".sheet-tabs",
          contentSelector: ".sheet-body",
          initial: "main",
        },
      ],
    });
  }

  /** @override */
  get template() {
    return `systems/hack100/templates/actor-character.hbs`;
  }

  /** @override */
  getData() {
    const context = super.getData();

    // Use a safe clone of the actor data for further operations.
    const actorData = this.actor.toObject(false);

    // Add the actor's data to context.data for easier access, as well as flags.
    context.system = actorData.system;
    context.flags = actorData.flags;

    // Calculate health percentage for gradient display
    const healthMax = actorData.system.health.max || 1;
    const healthValue = actorData.system.health.value || 0;
    context.system.healthPercent = Math.max(0, Math.min(100, Math.round((healthValue / healthMax) * 100)));

    // Prepare character data and items.
    if (actorData.type == "character") {
      this._prepareItems(context);
      this._prepareCharacterData(context);
    }

    // Prepare NPC data and items.
    if (actorData.type == "npc") {
      this._prepareItems(context);
    }

    // Add roll data for TinyMCE editors.
    context.rollData = context.actor.getRollData();

    return context;
  }

  /** @override */
  async _render(force, options) {
    await super._render(force, options);

    // Apply color scheme class to the window
    this._applyColorScheme();

    // Restore collapsed sections
    this._restoreCollapsedSections();
  }

  /**
   * Restore collapsed section states from localStorage
   */
  _restoreCollapsedSections() {
    const storageKey = `hack100-collapsed-${this.actor.id}`;
    const stored = localStorage.getItem(storageKey);

    if (!stored) return;

    try {
      const collapsedSections = JSON.parse(stored);
      const element = this.element[0];

      Object.entries(collapsedSections).forEach(([sectionName, isCollapsed]) => {
        if (isCollapsed) {
          const toggle = element.querySelector(`.section-toggle[data-section="${sectionName}"]`);
          if (toggle) {
            const section = toggle.closest(".items-section");
            if (section) {
              section.classList.add("collapsed");
            }
          }
        }
      });
    } catch (e) {
      console.error("Error restoring collapsed sections:", e);
    }
  }

  /**
   * Apply the color scheme class to the actor sheet window
   */
  _applyColorScheme() {
    const colorScheme = this.actor.system.colorScheme || "default";
    const element = this.element[0];

    // Remove all color scheme classes
    element.classList.remove("color-scheme-default", "color-scheme-dark", "color-scheme-light");

    // Add the current color scheme class
    if (colorScheme !== "default") {
      element.classList.add(`color-scheme-${colorScheme}`);
    }
  }

  /**
   * Organize and classify Items for Character sheets.
   */
  _prepareCharacterData(context) {
    // Handle ability scores.
    for (let [k, v] of Object.entries(context.system.abilities)) {
      v.label = game.i18n.localize(CONFIG.HACK100?.abilities?.[k] ?? k);
    }
  }

  /**
   * Organize and classify Items for Character sheets.
   */
  _prepareItems(context) {
    // Initialize containers.
    const gear = [];
    const weapons = [];
    const armor = [];
    const specialisms = [];

    // Iterate through items, allocating to containers
    for (let i of context.items) {
      i.img = i.img || DEFAULT_TOKEN;
      // Append to gear.
      if (i.type === "item") {
        gear.push(i);
      }
      // Append to weapons.
      else if (i.type === "weapon") {
        weapons.push(i);
      }
      // Append to armor.
      else if (i.type === "armor") {
        armor.push(i);
      }
      // Append to specialisms.
      else if (i.type === "specialism") {
        specialisms.push(i);
      }
    }

    // Assign and return
    context.gear = gear;
    context.weapons = weapons;
    context.armor = armor;
    context.specialisms = specialisms;
  }

  /** @override */
  async _onChangeInput(event) {
    // Get the field name
    const fieldName = event.target.name;

    // For certain fields that change frequently, update without re-render
    if (fieldName && (
      fieldName.includes("abilities") ||
      fieldName.includes("specialisms") ||
      fieldName === "name" ||
      fieldName.includes("background")
    )) {
      event.preventDefault();
      const formData = this._getSubmitData();
      await this.actor.update(formData, {render: false});
      return;
    }

    // For other fields, use default behavior
    return super._onChangeInput(event);
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Render the item sheet for viewing/editing prior to the editable check.
    html.find(".item-edit").click((ev) => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      item.sheet.render(true);
    });

    // Section collapse/expand toggle
    html.find(".section-toggle").click((ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const icon = $(ev.currentTarget);
      const section = icon.closest(".items-section");
      const sectionName = icon.data("section");

      // Toggle collapsed state immediately
      section.toggleClass("collapsed");

      // Save to localStorage (purely client-side, no re-render)
      const storageKey = `hack100-collapsed-${this.actor.id}`;
      const stored = localStorage.getItem(storageKey);
      let collapsedSections = {};

      if (stored) {
        try {
          collapsedSections = JSON.parse(stored);
        } catch (e) {
          collapsedSections = {};
        }
      }

      collapsedSections[sectionName] = section.hasClass("collapsed");
      localStorage.setItem(storageKey, JSON.stringify(collapsedSections));
    });

    // Also allow clicking on the h3 to toggle
    html.find(".items-header h3").click((ev) => {
      const toggle = $(ev.currentTarget).find(".section-toggle");
      if (toggle.length > 0) {
        toggle.trigger("click");
      }
    });

    // -------------------------------------------------------------
    // Everything below here is only needed if the sheet is editable
    if (!this.isEditable) return;

    // Color scheme change handler
    html.find('select[name="system.colorScheme"]').change(async (ev) => {
      await this.actor.update({ "system.colorScheme": ev.target.value }, {render: false});
      this._applyColorScheme();
    });

    // Add Inventory Item
    html.find(".item-create").click(this._onItemCreate.bind(this));

    // Delete Inventory Item
    html.find(".item-delete").click(async (ev) => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      await item.delete();
      li.slideUp(200, () => {
        // Item already deleted, no need to re-render
      });
    });

    // Toggle equipped status for items
    html.find(".equipped-checkbox input[type='checkbox']").change(async (ev) => {
      const checkbox = ev.currentTarget;
      const li = $(checkbox).closest(".item");
      const item = this.actor.items.get(li.data("itemId"));
      if (item) {
        await item.update({ "system.equipped": checkbox.checked }, {render: false});
      }
    });

    // Active Effect management
    html
      .find(".effect-control")
      .click((ev) => onManageActiveEffect(ev, this.actor));

    // Rollable abilities.
    html.find(".rollable").click(this._onRoll.bind(this));

    // Experience rolls
    html.find(".experience-roll").click(this._onExperienceRoll.bind(this));

    // Specialism management
    const addButton = html.find(".specialism-add");
    console.log("Hack100 | Found specialism-add buttons:", addButton.length);
    addButton.click(this._onSpecialismAdd.bind(this));
    html.find(".specialism-delete").click(this._onSpecialismDelete.bind(this));

    // Drag events for macros.
    if (this.actor.isOwner) {
      let handler = (ev) => this._onDragStart(ev);
      html.find("li.item").each((i, li) => {
        if (li.classList.contains("inventory-header")) return;
        li.setAttribute("draggable", true);
        li.addEventListener("dragstart", handler, false);
      });
    }
  }

  /**
   * Handle creating a new Owned Item for the actor using initial data defined in the HTML dataset
   */
  async _onItemCreate(event) {
    event.preventDefault();
    const header = event.currentTarget;
    // Get the type of item to create.
    const type = header.dataset.type;
    // Grab any data associated with this control.
    const data = duplicate(header.dataset);
    // Initialize a default name using localization.
    const name = game.i18n.localize(`hack100.items.new${type.capitalize()}`);
    // Prepare the item object.
    const itemData = {
      name: name,
      type: type,
      system: data,
    };
    // Remove the type from the dataset since it's in the itemData.type prop.
    delete itemData.system["type"];

    // Create the item without triggering re-render
    const item = await Item.create(itemData, { parent: this.actor, renderSheet: false });

    // Manually add the item to the list without full re-render
    // (Foundry will handle this through its reactive system)
    return item;
  }

  /**
   * Handle clickable rolls.
   */
  async _onRoll(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const dataset = element.dataset;

    // Handle item rolls.
    if (dataset.rollType) {
      if (dataset.rollType == "item") {
        const itemId = element.closest(".item").dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (item) return item.roll();
      }
    }

    // Handle rolls that supply the formula directly.
    if (dataset.roll) {
      let label = dataset.label ? `[ability] ${dataset.label}` : "";
      let roll = new Roll(dataset.roll, this.actor.getRollData());
      roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: label,
        rollMode: game.settings.get("core", "rollMode"),
      });
      return roll;
    }

    // Handle ability/specialism rolls
    if (dataset.ability) {
      return this.actor.rollAbility(dataset.ability);
    }
  }

  /**
   * Handle experience rolls
   */
  async _onExperienceRoll(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const abilityId = element.dataset.ability;

    if (abilityId) {
      return this.actor.rollExperience(abilityId);
    }
  }

  /**
   * Handle adding a new specialism
   */
  async _onSpecialismAdd(event) {
    event.preventDefault();
    console.log("Hack100 | Adding new specialism");

    const specialisms = this.actor.system.specialisms;

    // Find the next available specialism slot number
    let nextNum = 1;
    while (specialisms[`specialism${nextNum}`]) {
      nextNum++;
    }

    const newKey = `specialism${nextNum}`;
    console.log(`Hack100 | Creating specialism with key: ${newKey}`);

    const updateData = {
      [`system.specialisms.${newKey}`]: {
        name: game.i18n.localize("hack100.character.newSpecialism"),
        value: 10,
        experienceCheck: false
      }
    };

    try {
      await this.actor.update(updateData, {render: false});
      console.log("Hack100 | Specialism added successfully");
      this.render(false); // Soft refresh to show new specialism
    } catch (error) {
      console.error("Hack100 | Error adding specialism:", error);
    }
  }

  /**
   * Handle deleting a specialism
   */
  async _onSpecialismDelete(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const specialismKey = element.dataset.specialism;

    // Confirm deletion if the specialism has a name
    const specialism = this.actor.system.specialisms[specialismKey];
    if (specialism.name) {
      const confirm = await Dialog.confirm({
        title: game.i18n.localize("hack100.buttons.delete"),
        content: `<p>Delete specialism "${specialism.name}"?</p>`
      });
      if (!confirm) return;
    }

    // Remove the specialism by setting it to null, then clean up
    const updateData = {
      [`system.specialisms.-=${specialismKey}`]: null
    };

    await this.actor.update(updateData, {render: false});
    this.render(false); // Soft refresh to remove deleted specialism
  }

  /** @override */
  _onDragStart(event) {
    const li = event.currentTarget;
    if (event.target.classList.contains("content-link")) return;

    // Get the item being dragged
    const itemId = li.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;

    // Create the drag data
    const dragData = {
      actorId: this.actor.id,
      sceneId: this.actor.isToken ? canvas.scene?.id : null,
      tokenId: this.actor.isToken ? this.actor.token.id : null,
      type: "Item",
      uuid: item.uuid,
      data: item.toObject()
    };

    // Set data transfer
    event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
  }
}
