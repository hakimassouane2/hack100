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

    // Calculate derived values based on actor type
    if (this.type === "character") {
      this._prepareCharacterData();
    } else if (this.type === "npc") {
      this._prepareNPCData();
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

    // Calculate SP max (3 + highest specialism bonus)
    this._calculateSPMax();
  }

  /**
   * Prepare NPC-specific data
   * NPCs have simpler stats - no derived calculations
   */
  _prepareNPCData() {
    const systemData = this.system;

    // Ensure health values are valid
    if (typeof systemData.health.value !== "number") {
      systemData.health.value = 10;
    }
    if (typeof systemData.health.max !== "number" || systemData.health.max < 1) {
      systemData.health.max = 10;
    }
    // Clamp health to max
    if (systemData.health.value > systemData.health.max) {
      systemData.health.value = systemData.health.max;
    }

    // Ensure rate is valid (0-100)
    if (typeof systemData.rate !== "number") {
      systemData.rate = 50;
    }
    systemData.rate = Math.max(0, Math.min(100, systemData.rate));

    // Ensure movement is valid
    if (typeof systemData.movement !== "number") {
      systemData.movement = 6;
    }

    // Ensure damageReduction is valid
    if (typeof systemData.damageReduction !== "number") {
      systemData.damageReduction = 0;
    }

    // Ensure currency exists
    if (!systemData.currency) {
      systemData.currency = { gold: 0, silver: 0, copper: 0 };
    }

    // Calculate health percentage for display
    const healthMax = systemData.health.max || 1;
    const healthValue = systemData.health.value || 0;
    systemData.healthPercent = Math.max(
      0,
      Math.min(100, Math.round((healthValue / healthMax) * 100))
    );
  }

  /**
   * Calculate maximum Specialism Points
   * sp.max = 3 + highestSpecialismBonus
   * where highestSpecialismBonus = floor(highestSpecialismValue / 10)
   *
   * NOTE: This method only calculates derived values for display.
   * It does NOT modify sp.value to avoid overwriting user edits.
   * The only exception is clamping to valid bounds (0 to max).
   */
  _calculateSPMax() {
    const systemData = this.system;

    // Initialize sp if it doesn't exist
    if (!systemData.sp) {
      systemData.sp = { value: 3, max: 3 };
    }

    // Find highest specialism value
    let highestSpecialismValue = 0;
    if (systemData.specialisms) {
      for (const specialism of Object.values(systemData.specialisms)) {
        if (specialism.value > highestSpecialismValue) {
          highestSpecialismValue = specialism.value;
        }
      }
    }

    const highestSpecialismBonus = Math.floor(highestSpecialismValue / 10);
    const newMax = 3 + highestSpecialismBonus;

    systemData.sp.max = newMax;

    // Only clamp sp.value to valid bounds - don't auto-adjust otherwise
    // This prevents overwriting user's manual edits
    if (typeof systemData.sp.value !== 'number' || isNaN(systemData.sp.value)) {
      systemData.sp.value = newMax; // Default to max if invalid
    } else if (systemData.sp.value > systemData.sp.max) {
      systemData.sp.value = systemData.sp.max;
    } else if (systemData.sp.value < 0) {
      systemData.sp.value = 0;
    }
  }

  /**
   * Calculate total armor protection from equipped armor
   * For NPCs, also includes their damageReduction stat
   * @returns {number} Total armor protection value
   */
  getTotalArmor() {
    let totalProtection = 0;

    // For NPCs, start with their damage reduction stat
    if (this.type === "npc") {
      totalProtection += this.system.damageReduction || 0;
    }

    // Add protection from equipped armor
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
   * Roll the NPC's rate (Taux)
   * Uses the same roll mechanics as abilities
   */
  async rollRate() {
    if (this.type !== "npc") return;

    const target = this.system.rate || 50;
    const label = game.i18n.localize("hack100.npc.rate");

    // Show dialog for modifier input
    const dialogData = {
      title: `${game.i18n.localize("hack100.global.roll")} ${label}`,
      target: target,
      modifier: 0,
      agilityPenalty: 0,
      luckPoints: 0,
      hasLuck: false,
      colorScheme: "default",
      isSpecialism: false,
      spCurrent: 0,
      spMax: 0,
      spOptions: [],
    };

    const html = await renderTemplate(
      "systems/hack100/templates/roll-dialog.hbs",
      dialogData
    );

    const dialogClasses = ["dialog", "hack100-roll-dialog-wrapper", "theme-default"];

    return new Promise((resolve) => {
      const dialog = new Dialog({
        title: dialogData.title,
        content: html,
        buttons: {
          roll: {
            label: game.i18n.localize("hack100.global.roll"),
            callback: async (html) => {
              const form = html[0].querySelector("form");
              const difficultyModifier = parseInt(form.modifier.value) || 0;

              // Import the rollTask function
              const { rollTask } = await import("../hack100.js");
              const result = await rollTask(target, label, difficultyModifier, false);

              resolve(result);
            },
          },
          cancel: {
            label: game.i18n.localize("hack100.buttons.cancel"),
            callback: () => resolve(null),
          },
        },
        default: "roll",
      }, {
        classes: dialogClasses,
      }).render(true);
    });
  }

  /**
   * Roll the NPC's damage formula
   * Rolls the formula stored in system.damageFormula and posts to chat
   */
  async rollDamageFormula() {
    if (this.type !== "npc") return;

    const formula = this.system.damageFormula || "1d6";
    const label = game.i18n.localize("hack100.npc.damageFormula");

    // Validate the formula
    if (!Roll.validate(formula)) {
      ui.notifications.error(`Invalid dice formula: ${formula}`);
      return;
    }

    // Create and evaluate the roll
    const roll = new Roll(formula);
    await roll.evaluate();

    // Build chat message content
    const chatContent = `
      <div class="hack100-damage npc-damage">
        <h3><i class="fas fa-burst"></i> ${this.name} - ${label}</h3>
        <div class="damage-result">
          <div class="damage-formula">${formula}</div>
          <div class="damage-total">${roll.total}</div>
        </div>
        <div class="damage-breakdown">${roll.formula} = ${roll.result}</div>
      </div>
    `;

    // Create chat message with dice roll
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: `${this.name} - ${label}`,
      content: chatContent,
    });

    return roll;
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
    let isSpecialism = false;

    // Check if it's a core ability
    if (systemData.abilities[abilityId]) {
      target = systemData.abilities[abilityId].value;
      label = game.i18n.localize(`hack100.abilities.${abilityId}`);
    }
    // Check if it's a specialism
    else if (systemData.specialisms[abilityId]) {
      target = systemData.specialisms[abilityId].value;
      label = systemData.specialisms[abilityId].name || abilityId;
      isSpecialism = true;

      // Block specialism rolls if no SP available
      const spCurrent = this.system.sp?.value || 0;
      if (spCurrent <= 0) {
        ui.notifications.warn(game.i18n.localize("hack100.sp.noSP"));
        return;
      }
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

    // SP data for specialism rolls
    const spCurrent = this.system.sp?.value || 0;
    const spMax = this.system.sp?.max || 3;
    // Generate options array [1, 2, ...spCurrent] (only if SP available)
    const spOptions = spCurrent > 0 ? Array.from({ length: spCurrent }, (_, i) => i + 1) : [];

    const dialogData = {
      title: `${game.i18n.localize("hack100.global.roll")} ${label}`,
      target: target,
      modifier: modifier,
      agilityPenalty: agilityPenalty,
      luckPoints: luckPoints,
      hasLuck: luckPoints > 0,
      colorScheme: colorScheme,
      isSpecialism: isSpecialism && spCurrent > 0,
      spCurrent: spCurrent,
      spMax: spMax,
      spOptions: spOptions,
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
              const difficultyModifier = parseInt(form.modifier.value) || 0;
              const useLuck = form.useLuck?.checked || false;
              // Clamp SP spend to available SP (in case user manually typed a higher value)
              const currentSP = this.system.sp?.value || 0;
              const spSpend = Math.min(Math.max(0, parseInt(form.spSpend?.value) || 0), currentSP);

              // If using luck, consume a luck point
              if (useLuck && this.system.luck?.value > 0) {
                await this.update({ "system.luck.value": this.system.luck.value - 1 });
                ui.notifications.info(game.i18n.localize("hack100.luck.used"));
              }

              // If spending SP, consume SP
              if (spSpend > 0 && this.system.sp?.value >= spSpend) {
                await this.update({ "system.sp.value": this.system.sp.value - spSpend });
                ui.notifications.info(
                  game.i18n.format("hack100.sp.spent", { amount: spSpend })
                );
              }

              // Import the rollTask and rollDamage functions
              const { rollTask, rollDamage } = await import("../hack100.js");
              const result = await rollTask(target, label, difficultyModifier, useLuck);

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
   * Reset (clear) an experience check without rolling
   * @param {string} abilityId - The ability/specialism to clear
   */
  async resetExperienceCheck(abilityId) {
    const systemData = this.system;
    let updateData = {};
    let label = "";

    if (systemData.abilities[abilityId]) {
      updateData[`system.abilities.${abilityId}.experienceCheck`] = false;
      label = game.i18n.localize(`hack100.abilities.${abilityId}`);
    } else if (systemData.specialisms[abilityId]) {
      updateData[`system.specialisms.${abilityId}.experienceCheck`] = false;
      label = systemData.specialisms[abilityId].name || abilityId;
    }

    if (Object.keys(updateData).length > 0) {
      await this.update(updateData);
      ui.notifications.info(
        game.i18n.format("hack100.notifications.experienceReset", {
          ability: label,
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

  /**
   * Long Rest - show dialog for safe/unsafe rest choice
   */
  async longRest() {
    const colorScheme = this.system.colorScheme || "default";

    const content = `
      <form class="hack100-rest-dialog theme-${colorScheme}">
        <p>${game.i18n.localize("hack100.rest.longRestPrompt")}</p>
        <div class="rest-options">
          <div class="rest-option safe-rest selected" data-rest-type="safe">
            <h4><i class="fas fa-house"></i> ${game.i18n.localize("hack100.rest.safeRest")}</h4>
            <p class="rest-description">${game.i18n.localize("hack100.rest.safeRestDesc")}</p>
          </div>
          <div class="rest-option unsafe-rest" data-rest-type="unsafe">
            <h4><i class="fas fa-campground"></i> ${game.i18n.localize("hack100.rest.unsafeRest")}</h4>
            <p class="rest-description">${game.i18n.localize("hack100.rest.unsafeRestDesc")}</p>
          </div>
        </div>
        <input type="hidden" name="restType" value="safe" />
      </form>
    `;

    const dialogClasses = ["dialog", "hack100-roll-dialog-wrapper", `theme-${colorScheme}`];

    return new Promise((resolve) => {
      const dialog = new Dialog({
        title: game.i18n.localize("hack100.rest.longRestTitle"),
        content: content,
        buttons: {
          confirm: {
            icon: '<i class="fas fa-check"></i>',
            label: game.i18n.localize("hack100.buttons.confirm"),
            callback: async (html) => {
              const restType = html.find('input[name="restType"]').val();
              await this._performLongRest(restType === "safe");
              resolve(true);
            },
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: game.i18n.localize("hack100.buttons.cancel"),
            callback: () => resolve(null),
          },
        },
        default: "confirm",
        render: (html) => {
          // Add click handlers to rest options for selection
          html.find('.rest-option').on('click', function() {
            html.find('.rest-option').removeClass('selected');
            $(this).addClass('selected');
            html.find('input[name="restType"]').val($(this).data('rest-type'));
          });
        },
      }, {
        classes: dialogClasses,
      });
      dialog.render(true);
    });
  }

  /**
   * Perform the actual long rest recovery
   * @param {boolean} isSafe - Whether it's a safe rest (full recovery) or unsafe (half recovery)
   */
  async _performLongRest(isSafe) {
    const currentHP = this.system.health?.value || 0;
    const maxHP = this.system.health?.max || 0;
    const currentSP = this.system.sp?.value || 0;
    const maxSP = this.system.sp?.max || 3;

    let newHP, newSP;
    let restType;

    if (isSafe) {
      // Safe rest: full recovery
      newHP = maxHP;
      newSP = maxSP;
      restType = game.i18n.localize("hack100.rest.safeRest");
    } else {
      // Unsafe rest: recover half of max (added to current, capped at max)
      const hpRecovery = Math.floor(maxHP / 2);
      const spRecovery = Math.floor(maxSP / 2);
      newHP = Math.min(currentHP + hpRecovery, maxHP);
      newSP = Math.min(currentSP + spRecovery, maxSP);
      restType = game.i18n.localize("hack100.rest.unsafeRest");
    }

    await this.update({
      "system.health.value": newHP,
      "system.sp.value": newSP,
      "system.shortRestUsed": false
    });

    // Create chat message
    const resultText = isSafe
      ? game.i18n.localize("hack100.rest.fullyRestored")
      : game.i18n.format("hack100.rest.halfRestored", { hp: newHP, maxHp: maxHP, sp: newSP, maxSp: maxSP });

    const chatContent = `
      <div class="hack100-rest-message">
        <h3><i class="fas fa-bed"></i> ${game.i18n.localize("hack100.rest.longRestTitle")} (${restType})</h3>
        <p>${game.i18n.format("hack100.rest.longRestMessage", { name: this.name })}</p>
        <p class="rest-result">${resultText}</p>
      </div>
    `;

    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: chatContent
    });

    ui.notifications.info(game.i18n.localize("hack100.rest.longRestComplete"));
  }

  /**
   * Short Rest - roll 1d10 for HP and 1d5 for SP recovery (once per day)
   */
  async shortRest() {
    // Check if short rest already used
    if (this.system.shortRestUsed) {
      ui.notifications.warn(game.i18n.localize("hack100.rest.shortRestUsed"));
      return;
    }

    // Roll 1d10 for HP recovery
    const hpRoll = new Roll("1d10");
    await hpRoll.evaluate();
    const hpRecoveryRoll = hpRoll.total;

    // Roll 1d5 for SP recovery
    const spRoll = new Roll("1d5");
    await spRoll.evaluate();
    const spRecoveryRoll = spRoll.total;

    // Calculate new HP and SP values
    const currentHP = this.system.health?.value || 0;
    const maxHP = this.system.health?.max || 0;
    const newHP = Math.min(currentHP + hpRecoveryRoll, maxHP);
    const hpRecovered = newHP - currentHP;

    const currentSP = this.system.sp?.value || 0;
    const maxSP = this.system.sp?.max || 3;
    const newSP = Math.min(currentSP + spRecoveryRoll, maxSP);
    const spRecovered = newSP - currentSP;

    // Update actor
    await this.update({
      "system.health.value": newHP,
      "system.sp.value": newSP,
      "system.shortRestUsed": true
    });

    // Create chat message showing the rolls and recovery
    const chatContent = `
      <div class="hack100-rest-message">
        <h3><i class="fas fa-campground"></i> ${game.i18n.localize("hack100.rest.shortRestTitle")}</h3>
        <p>${game.i18n.format("hack100.rest.shortRestMessage", { name: this.name })}</p>
        <p class="rest-result">
          ${game.i18n.format("hack100.rest.hpRecoveredRoll", { roll: hpRecoveryRoll, amount: hpRecovered, current: newHP, max: maxHP })}<br>
          ${game.i18n.format("hack100.rest.spRecoveredRoll", { roll: spRecoveryRoll, amount: spRecovered, current: newSP, max: maxSP })}
        </p>
      </div>
    `;

    // Show HP roll
    await hpRoll.toMessage({
      flavor: `<strong>${game.i18n.localize("hack100.rest.hpRoll")}</strong>`,
      speaker: ChatMessage.getSpeaker({ actor: this })
    });

    // Show SP roll
    await spRoll.toMessage({
      flavor: `<strong>${game.i18n.localize("hack100.rest.spRoll")}</strong>`,
      speaker: ChatMessage.getSpeaker({ actor: this })
    });

    // Show summary
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: chatContent
    });

    ui.notifications.info(
      game.i18n.format("hack100.rest.shortRestComplete", { hpRecovery: hpRecovered, spRecovery: spRecovered })
    );
  }
}
