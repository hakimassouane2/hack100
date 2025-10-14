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
    return `systems/hack100/templates/actor-${this.actor.type}.hbs`;
  }

  /** @override */
  getData() {
    const context = super.getData();

    // Use a safe clone of the actor data for further operations.
    const actorData = this.actor.toObject(false);

    // Add the actor's data to context.data for easier access, as well as flags.
    context.system = actorData.system;
    context.flags = actorData.flags;

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
  activateListeners(html) {
    super.activateListeners(html);

    // Render the item sheet for viewing/editing prior to the editable check.
    html.find(".item-edit").click((ev) => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      item.sheet.render(true);
    });

    // -------------------------------------------------------------
    // Everything below here is only needed if the sheet is editable
    if (!this.isEditable) return;

    // Add Inventory Item
    html.find(".item-create").click(this._onItemCreate.bind(this));

    // Delete Inventory Item
    html.find(".item-delete").click((ev) => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      item.delete();
      li.slideUp(200, () => this.render(false));
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
    html.find(".specialism-add").click(this._onSpecialismAdd.bind(this));
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
    // Initialize a default name.
    const name = `New ${type.capitalize()}`;
    // Prepare the item object.
    const itemData = {
      name: name,
      type: type,
      system: data,
    };
    // Remove the type from the dataset since it's in the itemData.type prop.
    delete itemData.system["type"];

    // Finally, create the item!
    return await Item.create(itemData, { parent: this.actor });
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
    const specialisms = this.actor.system.specialisms;

    // Find the next available specialism slot number
    let nextNum = 1;
    while (specialisms[`specialism${nextNum}`]) {
      nextNum++;
    }

    const newKey = `specialism${nextNum}`;
    const updateData = {
      [`system.specialisms.${newKey}`]: {
        name: "",
        value: 0,
        experienceCheck: false
      }
    };

    await this.actor.update(updateData);
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

    await this.actor.update(updateData);
  }
}
