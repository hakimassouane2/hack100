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

    const modifier = options.modifier || 0;
    const dialogData = {
      title: `${game.i18n.localize("hack100.global.roll")} ${label}`,
      target: target,
      modifier: modifier,
    };

    // Show dialog for modifier input
    const html = await renderTemplate(
      "systems/hack100/templates/roll-dialog.hbs",
      dialogData
    );

    return new Promise((resolve) => {
      new Dialog({
        title: dialogData.title,
        content: html,
        buttons: {
          roll: {
            label: game.i18n.localize("hack100.global.roll"),
            callback: async (html) => {
              const form = html[0].querySelector("form");
              const modifier = parseInt(form.modifier.value) || 0;

              // Import the rollTask and rollDamage functions
              const { rollTask, rollDamage } = await import("../hack100.js");
              const result = await rollTask(target, label, modifier);

              // Award experience check if successful
              if (result.success) {
                this._awardExperienceCheck(abilityId);
              }

              // If this is a melee or ranged roll and it succeeded, roll damage
              if (result.success && (abilityId === "melee" || abilityId === "ranged")) {
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
      ui.notifications.info(`Experience check awarded for ${abilityId}!`);
    }
  }

  /**
   * Roll for experience improvement
   * @param {string} abilityId - The ability/specialism to improve
   */
  async rollExperience(abilityId) {
    const systemData = this.system;
    let currentValue = 0;
    let hasCheck = false;

    if (systemData.abilities[abilityId]) {
      currentValue = systemData.abilities[abilityId].value;
      hasCheck = systemData.abilities[abilityId].experienceCheck;
    } else if (systemData.specialisms[abilityId]) {
      currentValue = systemData.specialisms[abilityId].value;
      hasCheck = systemData.specialisms[abilityId].experienceCheck;
    }

    if (!hasCheck) {
      ui.notifications.warn("No experience check available for this ability!");
      return;
    }

    const roll = new Roll("1d100");
    await roll.roll({ async: true });

    if (roll.total > currentValue) {
      // Improvement roll
      const improvementRoll = new Roll("1d5");
      await improvementRoll.roll({ async: true });

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

      const chatData = {
        user: game.user.id,
        content: `
          <div class="hack100-experience">
            <h3>Experience Roll: ${abilityId}</h3>
            <p><strong>Success!</strong> ${abilityId} improved from ${currentValue}% to ${newValue}%</p>
          </div>
        `,
      };

      ChatMessage.create(chatData);
    } else {
      // Clear experience check anyway
      let updateData = {};
      if (systemData.abilities[abilityId]) {
        updateData[`system.abilities.${abilityId}.experienceCheck`] = false;
      } else if (systemData.specialisms[abilityId]) {
        updateData[`system.specialisms.${abilityId}.experienceCheck`] = false;
      }

      await this.update(updateData);

      const chatData = {
        user: game.user.id,
        content: `
          <div class="hack100-experience">
            <h3>Experience Roll: ${abilityId}</h3>
            <p>No improvement - rolled ${roll.total} vs ${currentValue}%</p>
          </div>
        `,
      };

      ChatMessage.create(chatData);
    }
  }
}
