/**
 * Extend the base Actor document to support Hack100 system
 */
export class Hack100Actor extends Actor {
  /** @override */
  prepareData() {
    super.prepareData();
  }

  /** @override */
  prepareBaseData() {
    super.prepareBaseData();

    // Calculate derived values
    if (this.type === "character" || this.type === "npc") {
      this._prepareCharacterData();
    }
  }

  /**
   * Prepare character-specific data
   */
  _prepareCharacterData() {
    const systemData = this.system;

    // Clean up journal data - ensure arrays are actual arrays not objects
    if (systemData.journal) {
      const journal = systemData.journal;
      ['clues', 'npcs', 'rumors', 'freeEntries'].forEach(arrayKey => {
        if (journal[arrayKey] && !Array.isArray(journal[arrayKey])) {
          // Convert object to array, preserving order by numeric keys
          const obj = journal[arrayKey];
          const arr = [];
          Object.keys(obj).sort((a, b) => parseInt(a) - parseInt(b)).forEach(key => {
            arr.push(obj[key]);
          });
          journal[arrayKey] = arr;
        }
        // Ensure array exists
        if (!journal[arrayKey]) {
          journal[arrayKey] = [];
        }
      });
    }

    // Clean up corrupted specialism data
    if (systemData.specialisms) {
      for (let [key, specialism] of Object.entries(systemData.specialisms)) {
        // Fix corrupted name fields (e.g., comma-filled strings)
        if (specialism.name && typeof specialism.name === "string") {
          // If name is only commas or whitespace, clear it
          if (specialism.name.match(/^[,\s]*$/)) {
            specialism.name = "";
          }
        }
        // Ensure value is a valid number
        if (typeof specialism.value !== "number" || isNaN(specialism.value)) {
          specialism.value = 0;
        }
        // Ensure boolean fields are boolean
        if (typeof specialism.experienceCheck !== "boolean") {
          specialism.experienceCheck = false;
        }
      }
    }

    // Calculate ability bonuses (tens value)
    for (let [key, ability] of Object.entries(systemData.abilities)) {
      ability.bonus = Math.floor(ability.value / 10);
    }

    // Calculate health
    const toughnessBonus = systemData.abilities.toughness.bonus || 0;
    const willpowerBonus = systemData.abilities.willpower.bonus || 0;
    systemData.health.max = (toughnessBonus + willpowerBonus) * 2;

    // Ensure current health doesn't exceed max
    if (systemData.health.value > systemData.health.max) {
      systemData.health.value = systemData.health.max;
    }

    // Ensure temp HP is initialized
    if (typeof systemData.health.temp !== "number") {
      systemData.health.temp = 0;
    }

    // Calculate effective health for token bar display
    // effectiveHealth.value = current HP + temp HP (total effective health pool)
    // effectiveHealth.max = max HP + temp HP (so the bar shows temp HP as extra)
    const tempHP = systemData.health.temp || 0;
    systemData.effectiveHealth = {
      value: systemData.health.value + tempHP,
      max: systemData.health.max + tempHP
    };

    // Calculate movement (base 8, modified by armor)
    let movement = 8;
    for (let item of this.items) {
      if (item.type === "armor" && item.system.equipped) {
        movement -= item.system.movementPenalty || 0;
      }
    }
    systemData.movement = Math.max(movement, 0);
  }

  /**
   * Calculate total armor protection from equipped armor
   * @returns {number} Total armor protection value
   */
  getTotalArmor() {
    let totalProtection = 0;
    for (let item of this.items) {
      if (item.type === "armor" && item.system.equipped) {
        totalProtection += parseInt(item.system.protection) || 0;
      }
    }
    return totalProtection;
  }

  /**
   * Calculate total agility penalty from equipped armor
   * @returns {number} Total agility penalty percentage
   */
  getTotalAgilityPenalty() {
    let totalPenalty = 0;
    for (let item of this.items) {
      if (item.type === "armor" && item.system.equipped) {
        totalPenalty += item.system.agilityPenalty || 0;
      }
    }
    return totalPenalty;
  }

  /**
   * Roll an ability or specialism check
   * @param {string} abilityId - The ability/specialism to roll
   * @param {object} options - Roll options
   */
  async rollAbility(abilityId, options = {}) {
    const systemData = this.system;
    let target = 0;
    let label = "";

    // Check if it's a core ability
    if (systemData.abilities[abilityId]) {
      target = systemData.abilities[abilityId].value;
      label = game.i18n.localize(`hack100.abilities.${abilityId}`);
    }
    // Check if it's a specialism
    else if (systemData.specialisms[abilityId]) {
      target = systemData.specialisms[abilityId].value;
      label = systemData.specialisms[abilityId].name || abilityId;
    } else {
      ui.notifications.warn(`Unknown ability: ${abilityId}`);
      return;
    }

    // Apply agility penalty from equipped armor if rolling agility
    let agilityPenalty = 0;
    if (abilityId === "agility") {
      agilityPenalty = this.getTotalAgilityPenalty();
      if (agilityPenalty > 0) {
        target = Math.max(0, target - agilityPenalty);
      }
    }

    const modifier = options.modifier || 0;
    const luckPoints = this.system.luck?.value || 0;
    // colorScheme is stored directly on system, not in settings
    const colorScheme = this.system.colorScheme || "default";

    const dialogData = {
      title: `${game.i18n.localize("hack100.global.roll")} ${label}`,
      target: target,
      modifier: modifier,
      agilityPenalty: agilityPenalty,
      luckPoints: luckPoints,
      hasLuck: luckPoints > 0,
      colorScheme: colorScheme,
    };

    // Show dialog for modifier input
    const html = await renderTemplate(
      "systems/hack100/templates/roll-dialog.hbs",
      dialogData
    );

    // Determine dialog classes based on color scheme
    // Include "dialog" to preserve Foundry's base dialog styling
    // Always add a theme class to override Foundry's default theming
    const dialogClasses = ["dialog", "hack100-roll-dialog-wrapper", `theme-${colorScheme}`];

    return new Promise((resolve) => {
      const dialog = new Dialog({
        title: dialogData.title,
        content: html,
        buttons: {
          roll: {
            label: game.i18n.localize("hack100.global.roll"),
            callback: async (html) => {
              const form = html[0].querySelector("form");
              const modifier = parseInt(form.modifier.value) || 0;
              const useLuck = form.useLuck?.checked || false;

              // If using luck, consume a luck point
              if (useLuck && this.system.luck?.value > 0) {
                await this.update({ "system.luck.value": this.system.luck.value - 1 });
                ui.notifications.info(game.i18n.localize("hack100.luck.used"));
              }

              // Import the rollTask and rollDamage functions
              const { rollTask, rollDamage } = await import("../hack100.js");
              const result = await rollTask(target, label, modifier, useLuck);

              // Award experience check if successful
              if (result.success) {
                this._awardExperienceCheck(abilityId);
              }

              // If this is a melee or ranged roll and it succeeded, roll damage
              // BUT only if skipDamage option is not set (used by weapon attacks)
              if (
                result.success &&
                (abilityId === "melee" || abilityId === "ranged") &&
                !options.skipDamage
              ) {
                // Use a default weapon damage of 0 if no weapon is equipped
                // The damage will be based on the tens digit of the attack roll
                await rollDamage("0", result.result);
              }

              resolve(result);
            },
          },
          cancel: {
            label: game.i18n.localize("hack100.buttons.cancel"),
            callback: () => resolve(null),
          },
        },
        default: "roll",
        render: (html) => {
          // Remove Foundry's automatic theming classes that override ours
          // "themed" triggers Foundry's default theme styles
          // Foundry may also add "theme-light" or "theme-dark" automatically
          const dialogElement = html.closest(".app.window-app");
          if (dialogElement.length) {
            // Remove Foundry's classes but preserve our theme-{colorScheme} class
            dialogElement.removeClass("themed");
            // If we're using our default theme, remove Foundry's theme-light/dark
            // that might have been auto-added
            if (colorScheme === "default") {
              dialogElement.removeClass("theme-light theme-dark");
            }
          }
        },
      }, {
        classes: dialogClasses,
      }).render(true);
    });
  }

  /**
   * Award an experience check
   * @param {string} abilityId - The ability/specialism that gets the check
   */
  _awardExperienceCheck(abilityId) {
    const systemData = this.system;
    let updateData = {};

    if (systemData.abilities[abilityId]) {
      updateData[`system.abilities.${abilityId}.experienceCheck`] = true;
    } else if (systemData.specialisms[abilityId]) {
      updateData[`system.specialisms.${abilityId}.experienceCheck`] = true;
    }

    if (Object.keys(updateData).length > 0) {
      this.update(updateData);
      ui.notifications.info(
        game.i18n.format("hack100.notifications.experienceAwarded", {
          ability: abilityId,
        })
      );
    }
  }

  /**
   * Get the initiative formula for this actor
   * Initiative = 1d10 + Agility Bonus
   * @override
   */
  _getInitiativeFormula() {
    return "1d10 + @abilities.agility.bonus";
  }

  /**
   * Reset luck points to the starting session value (1)
   */
  async resetLuck() {
    await this.update({ "system.luck.value": 1 });
    ui.notifications.info(game.i18n.localize("hack100.luck.reset"));
  }

  /**
   * Modify luck points
   * @param {number} delta - Amount to add (positive) or remove (negative)
   */
  async modifyLuck(delta) {
    const current = this.system.luck?.value || 0;
    const max = this.system.luck?.max || 3;
    const newValue = Math.max(0, Math.min(max, current + delta));
    await this.update({ "system.luck.value": newValue });
  }

  /**
   * Convert all currency to a single type
   * @param {string} targetType - The currency type to convert to (gold, silver, copper)
   */
  async convertCurrency(targetType) {
    const currency = this.system.currency || { gold: 0, silver: 0, copper: 0 };

    // Calculate total value in copper (base unit)
    const totalCopper = (currency.gold || 0) * 100 + (currency.silver || 0) * 10 + (currency.copper || 0);

    let newCurrency = { gold: 0, silver: 0, copper: 0 };

    switch (targetType) {
      case "gold":
        newCurrency.gold = Math.floor(totalCopper / 100);
        newCurrency.silver = Math.floor((totalCopper % 100) / 10);
        newCurrency.copper = totalCopper % 10;
        break;
      case "silver":
        newCurrency.silver = Math.floor(totalCopper / 10);
        newCurrency.copper = totalCopper % 10;
        break;
      case "copper":
        newCurrency.copper = totalCopper;
        break;
    }

    await this.update({ "system.currency": newCurrency });
    ui.notifications.info(game.i18n.localize("hack100.currency.convertSuccess"));
  }

  /**
   * Transfer currency to another actor
   * @param {string} targetActorId - The ID of the target actor
   * @param {string} currencyType - The type of currency (gold, silver, copper)
   * @param {number} amount - The amount to transfer
   */
  async transferCurrency(targetActorId, currencyType, amount) {
    amount = Math.floor(Math.abs(amount));
    if (amount <= 0) return;

    const targetActor = game.actors.get(targetActorId);
    if (!targetActor) {
      ui.notifications.error(game.i18n.localize("hack100.currency.transferNoTarget"));
      return;
    }

    const currentAmount = this.system.currency?.[currencyType] || 0;
    if (currentAmount < amount) {
      ui.notifications.error(game.i18n.localize("hack100.currency.transferError"));
      return;
    }

    // Deduct from sender
    const senderUpdate = {};
    senderUpdate[`system.currency.${currencyType}`] = currentAmount - amount;
    await this.update(senderUpdate);

    // Add to receiver
    const targetCurrentAmount = targetActor.system.currency?.[currencyType] || 0;
    const targetUpdate = {};
    targetUpdate[`system.currency.${currencyType}`] = targetCurrentAmount + amount;
    await targetActor.update(targetUpdate);

    // Get localized currency name
    const currencyName = game.i18n.localize(`hack100.currency.${currencyType}`);

    // Notify sender
    ui.notifications.info(
      game.i18n.format("hack100.currency.transferSuccess", {
        amount: amount,
        type: currencyName,
        target: targetActor.name
      })
    );

    // Create chat message for the transfer
    const chatContent = `<div class="hack100-currency-transfer">
      <h3><i class="fas fa-coins"></i> ${game.i18n.localize("hack100.currency.transferTitle")}</h3>
      <p><strong>${this.name}</strong> → <strong>${targetActor.name}</strong></p>
      <p class="transfer-amount">${amount} ${currencyName}</p>
    </div>`;

    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: chatContent
    });
  }

  /**
   * Roll for experience improvement
   * @param {string} abilityId - The ability/specialism to improve
   */
  async rollExperience(abilityId) {
    const systemData = this.system;
    let currentValue = 0;
    let hasCheck = false;
    let label = "";

    if (systemData.abilities[abilityId]) {
      currentValue = systemData.abilities[abilityId].value;
      hasCheck = systemData.abilities[abilityId].experienceCheck;
      label = game.i18n.localize(`hack100.abilities.${abilityId}`);
    } else if (systemData.specialisms[abilityId]) {
      currentValue = systemData.specialisms[abilityId].value;
      hasCheck = systemData.specialisms[abilityId].experienceCheck;
      label = systemData.specialisms[abilityId].name || abilityId;
    }

    if (!hasCheck) {
      ui.notifications.warn("No experience check available for this ability!");
      return;
    }

    const roll = new Roll("1d100");
    await roll.evaluate();

    // Build localized strings
    const rollTitle = game.i18n.format("hack100.experience.rollTitle", { ability: label });
    const rollingVs = game.i18n.format("hack100.experience.rollingVs", { value: currentValue });

    if (roll.total > currentValue) {
      // Improvement roll
      const improvementRoll = new Roll("1d5");
      await improvementRoll.evaluate();

      const newValue = currentValue + improvementRoll.total;
      let updateData = {};

      if (systemData.abilities[abilityId]) {
        updateData[`system.abilities.${abilityId}.value`] = newValue;
        updateData[`system.abilities.${abilityId}.experienceCheck`] = false;
      } else if (systemData.specialisms[abilityId]) {
        updateData[`system.specialisms.${abilityId}.value`] = newValue;
        updateData[`system.specialisms.${abilityId}.experienceCheck`] = false;
      }

      await this.update(updateData);

      const improvementTitle = game.i18n.localize("hack100.experience.improvementTitle");
      const improvementSuccess = game.i18n.format("hack100.experience.improvementSuccess", {
        ability: label,
        oldValue: currentValue,
        newValue: newValue
      });

      // Show both dice rolls
      await roll.toMessage({
        flavor: `<h3>${rollTitle}</h3><p>${rollingVs}</p>`,
        speaker: ChatMessage.getSpeaker({ actor: this }),
      });

      await improvementRoll.toMessage({
        flavor: `<h3>${improvementTitle}</h3><p><strong>${improvementSuccess}</strong></p>`,
        speaker: ChatMessage.getSpeaker({ actor: this }),
      });
    } else {
      // Clear experience check anyway
      let updateData = {};
      if (systemData.abilities[abilityId]) {
        updateData[`system.abilities.${abilityId}.experienceCheck`] = false;
      } else if (systemData.specialisms[abilityId]) {
        updateData[`system.specialisms.${abilityId}.experienceCheck`] = false;
      }

      await this.update(updateData);

      const noImprovement = game.i18n.format("hack100.experience.noImprovement", {
        roll: roll.total,
        value: currentValue
      });

      await roll.toMessage({
        flavor: `<h3>${rollTitle}</h3><p>${noImprovement}</p>`,
        speaker: ChatMessage.getSpeaker({ actor: this }),
      });
    }
  }
}
