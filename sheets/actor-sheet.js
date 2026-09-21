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
  _getHeaderButtons() {
    const buttons = super._getHeaderButtons();
    if (this.actor.type === "character" && this.isEditable) {
      buttons.unshift({
        label: game.i18n.localize("hack100.settings.title"),
        class: "hack100-settings",
        icon: "fas fa-cog",
        onclick: () => this._onOpenSettings(),
      });
    }
    return buttons;
  }

  /**
   * Open the sheet settings dialog (color scheme)
   */
  async _onOpenSettings() {
    const current = this.actor.system.colorScheme || "default";
    const options = ["default", "dark", "light"]
      .map(
        (scheme) =>
          `<option value="${scheme}" ${scheme === current ? "selected" : ""}>${game.i18n.localize(
            `hack100.settings.colorSchemes.${scheme}`
          )}</option>`
      )
      .join("");

    const content = `
      <form>
        <div class="form-group">
          <label>${game.i18n.localize("hack100.settings.colorScheme")}</label>
          <select name="colorScheme">${options}</select>
        </div>
        <p class="hint">${game.i18n.localize("hack100.settings.colorSchemeHint")}</p>
      </form>
    `;

    new Dialog({
      title: `${game.i18n.localize("hack100.settings.title")} : ${this.actor.name}`,
      content: content,
      buttons: {
        save: {
          icon: '<i class="fas fa-check"></i>',
          label: game.i18n.localize("hack100.buttons.confirm"),
          callback: async (html) => {
            const colorScheme = html[0].querySelector("select[name='colorScheme']").value;
            await this.actor.update({ "system.colorScheme": colorScheme });
            this._applyColorScheme();
          },
        },
        cancel: {
          label: game.i18n.localize("hack100.buttons.cancel"),
        },
      },
      default: "save",
    }).render(true);
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
    context.system.healthPercent = Math.max(
      0,
      Math.min(100, Math.round((healthValue / healthMax) * 100))
    );

    // Calculate SP percentage for gradient display
    const spMax = actorData.system.sp?.max || 1;
    const spValue = actorData.system.sp?.value || 0;
    context.system.spPercent = Math.max(
      0,
      Math.min(100, Math.round((spValue / spMax) * 100))
    );

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

      Object.entries(collapsedSections).forEach(
        ([sectionName, isCollapsed]) => {
          if (isCollapsed) {
            const toggle = element.querySelector(
              `.section-toggle[data-section="${sectionName}"]`
            );
            if (toggle) {
              const section = toggle.closest(".items-section");
              if (section) {
                section.classList.add("collapsed");
              }
            }
          }
        }
      );
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
    element.classList.remove(
      "color-scheme-default",
      "color-scheme-dark",
      "color-scheme-light"
    );

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
    if (
      fieldName &&
      (fieldName.includes("abilities") ||
        fieldName.includes("specialisms") ||
        fieldName === "name" ||
        fieldName.includes("background"))
    ) {
      event.preventDefault();
      const formData = this._getSubmitData();
      await this.actor.update(formData);
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
    html
      .find(".equipped-checkbox input[type='checkbox']")
      .change(async (ev) => {
        const checkbox = ev.currentTarget;
        const li = $(checkbox).closest(".item");
        const item = this.actor.items.get(li.data("itemId"));
        if (item) {
          await item.update({ "system.equipped": checkbox.checked });
        }
      });

    // Active Effect management
    html
      .find(".effect-control")
      .click((ev) => onManageActiveEffect(ev, this.actor));

    // Rollable abilities.
    html.find(".rollable").click(this._onRoll.bind(this));

    // NPC Rate roll
    html.find(".rate-roll").click(this._onRateRoll.bind(this));

    // NPC Damage formula roll
    html.find(".damage-formula-roll").click(this._onDamageFormulaRoll.bind(this));

    // Experience rolls
    html.find(".experience-roll").click(this._onExperienceRoll.bind(this));

    // XP reset (clear experience check)
    html.find(".xp-reset").click(this._onXpReset.bind(this));

    // Specialism management
    const addButton = html.find(".specialism-add");
    addButton.click(this._onSpecialismAdd.bind(this));
    html.find(".specialism-delete").click(this._onSpecialismDelete.bind(this));

    // Currency convert and transfer
    html.find(".currency-convert").click(this._onCurrencyConvert.bind(this));
    html.find(".currency-transfer").click(this._onCurrencyTransfer.bind(this));

    // Luck reset button
    html.find(".luck-reset").click(this._onLuckReset.bind(this));

    // Luck pips click handlers (left click = increment, right click = decrement)
    html.find(".luck-pips").on("click", this._onLuckIncrement.bind(this));
    html.find(".luck-pips").on("contextmenu", this._onLuckDecrement.bind(this));

    // Rest buttons
    html.find(".short-rest").click(this._onShortRest.bind(this));
    html.find(".long-rest").click(this._onLongRest.bind(this));

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

    if (!type) {
      return;
    }

    // Grab any data associated with this control.
    const data = duplicate(header.dataset);
    // Initialize a default name using localization.
    // Capitalize the first letter of type
    const capitalizedType = type.charAt(0).toUpperCase() + type.slice(1);
    const name = game.i18n.localize(`hack100.items.new${capitalizedType}`);
    // Prepare the item object.
    const itemData = {
      name: name,
      type: type,
      system: data,
    };
    // Remove the type from the dataset since it's in the itemData.type prop.
    delete itemData.system["type"];

    // Create the item without triggering re-render
    const item = await Item.create(itemData, {
      parent: this.actor,
      renderSheet: false,
    });

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
   * Handle XP reset (clear experience check without rolling)
   */
  async _onXpReset(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const abilityId = element.dataset.ability;

    if (abilityId) {
      return this.actor.resetExperienceCheck(abilityId);
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
        name: game.i18n.localize("hack100.character.newSpecialism"),
        value: 10,
        experienceCheck: false,
      },
    };

    try {
      await this.actor.update(updateData);
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
        content: `<p>${game.i18n.format("hack100.character.confirmDeleteSpecialism", { name: specialism.name })}</p>`,
      });
      if (!confirm) return;
    }

    // Remove the specialism by setting it to null, then clean up
    const updateData = {
      [`system.specialisms.-=${specialismKey}`]: null,
    };

    await this.actor.update(updateData);
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
      data: item.toObject(),
    };

    // Set data transfer
    event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
  }

  /**
   * Handle currency conversion dialog
   */
  async _onCurrencyConvert(event) {
    event.preventDefault();

    const content = `
      <form class="currency-convert-form">
        <p>${game.i18n.localize("hack100.currency.convertTitle")}</p>
        <div class="form-group">
          <button type="button" class="convert-option" data-target="gold">
            <i class="fas fa-coins" style="color: #d4af37;"></i>
            ${game.i18n.localize("hack100.currency.convertToGold")}
          </button>
        </div>
        <div class="form-group">
          <button type="button" class="convert-option" data-target="silver">
            <i class="fas fa-coins" style="color: #a8a8a8;"></i>
            ${game.i18n.localize("hack100.currency.convertToSilver")}
          </button>
        </div>
        <div class="form-group">
          <button type="button" class="convert-option" data-target="copper">
            <i class="fas fa-coins" style="color: #b87333;"></i>
            ${game.i18n.localize("hack100.currency.convertToCopper")}
          </button>
        </div>
      </form>
    `;

    const dialog = new Dialog({
      title: game.i18n.localize("hack100.currency.convertTitle"),
      content: content,
      buttons: {
        cancel: {
          label: game.i18n.localize("hack100.buttons.cancel"),
        },
      },
      render: (html) => {
        html.find(".convert-option").click(async (ev) => {
          const target = ev.currentTarget.dataset.target;
          await this.actor.convertCurrency(target);
          dialog.close();
        });
      },
    });
    dialog.render(true);
  }

  /**
   * Handle luck reset button
   */
  async _onLuckReset(event) {
    event.preventDefault();
    await this.actor.resetLuck();
  }

  /**
   * Handle luck increment (left click)
   */
  async _onLuckIncrement(event) {
    event.preventDefault();
    await this.actor.modifyLuck(1);
  }

  /**
   * Handle luck decrement (right click)
   */
  async _onLuckDecrement(event) {
    event.preventDefault();
    await this.actor.modifyLuck(-1);
  }

  /**
   * Handle currency transfer dialog
   */
  async _onCurrencyTransfer(event) {
    event.preventDefault();

    // Get list of other actors (characters) that can receive money
    const actors = game.actors.filter(
      (a) =>
        a.id !== this.actor.id &&
        (a.type === "character" || a.type === "npc") &&
        a.hasPlayerOwner
    );

    if (actors.length === 0) {
      ui.notifications.warn(
        game.i18n.localize("hack100.currency.transferNoTarget")
      );
      return;
    }

    const actorOptions = actors
      .map((a) => `<option value="${a.id}">${a.name}</option>`)
      .join("");

    const content = `
      <form class="currency-transfer-form">
        <div class="form-group">
          <label>${game.i18n.localize("hack100.currency.transferTo")}</label>
          <select name="targetActor">${actorOptions}</select>
        </div>
        <div class="form-group">
          <label>${game.i18n.localize("hack100.currency.transferType")}</label>
          <select name="currencyType">
            <option value="gold">${game.i18n.localize(
              "hack100.currency.gold"
            )}</option>
            <option value="silver">${game.i18n.localize(
              "hack100.currency.silver"
            )}</option>
            <option value="copper">${game.i18n.localize(
              "hack100.currency.copper"
            )}</option>
          </select>
        </div>
        <div class="form-group">
          <label>${game.i18n.localize(
            "hack100.currency.transferAmount"
          )}</label>
          <input type="number" name="amount" value="1" min="1"/>
        </div>
      </form>
    `;

    new Dialog({
      title: game.i18n.localize("hack100.currency.transferTitle"),
      content: content,
      buttons: {
        transfer: {
          icon: '<i class="fas fa-paper-plane"></i>',
          label: game.i18n.localize("hack100.currency.transferSend"),
          callback: async (html) => {
            const form = html[0].querySelector("form");
            const targetActorId = form.targetActor.value;
            const currencyType = form.currencyType.value;
            const amount = parseInt(form.amount.value) || 0;
            await this.actor.transferCurrency(
              targetActorId,
              currencyType,
              amount
            );
          },
        },
        cancel: {
          label: game.i18n.localize("hack100.buttons.cancel"),
        },
      },
      default: "transfer",
    }).render(true);
  }

  /**
   * Handle short rest button
   */
  async _onShortRest(event) {
    event.preventDefault();
    await this.actor.shortRest();
  }

  /**
   * Handle long rest button
   */
  async _onLongRest(event) {
    event.preventDefault();
    await this.actor.longRest();
  }

  /**
   * Handle NPC rate roll
   */
  async _onRateRoll(event) {
    event.preventDefault();
    if (this.actor.type === "npc") {
      return this.actor.rollRate();
    }
  }

  /**
   * Handle NPC damage formula roll
   */
  async _onDamageFormulaRoll(event) {
    event.preventDefault();
    if (this.actor.type === "npc") {
      return this.actor.rollDamageFormula();
    }
  }
}
