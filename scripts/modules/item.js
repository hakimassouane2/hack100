/**
 * Extend the base Item document to support Hack100 system
 */
export class Hack100Item extends Item {
  /** @override */
  prepareData() {
    super.prepareData();
  }

  /** @override */
  prepareBaseData() {
    super.prepareBaseData();
  }

  /**
   * Handle clickable rolls
   */
  async roll(options = {}) {
    const item = this;
    const actor = this.actor;

    // Only roll for items with roll data
    if (!this.system.hasRoll) return;

    switch (this.type) {
      case "weapon":
        return this._rollWeaponAttack(options);
      case "specialism":
        return this._rollSpecialism();
      default:
        return;
    }
  }

  /**
   * Use an item: post it to chat, and spend one if it is a consumable
   * @returns {Promise<ChatMessage|void>}
   */
  async use() {
    const actor = this.actor;
    const consumable = this.type === "item" && this.system.consumable;
    const quantity = this.system.quantity ?? 0;

    if (consumable && quantity <= 0) {
      ui.notifications.warn(game.i18n.format("hack100.items.noneLeft", { item: this.name }));
      return;
    }
    if (consumable) await this.update({ "system.quantity": quantity - 1 });

    const title = actor
      ? game.i18n.format("hack100.items.used", { actor: actor.name, item: this.name })
      : this.name;
    const remaining = consumable
      ? `<p class="item-remaining">${game.i18n.format("hack100.items.remaining", { quantity: quantity - 1 })}</p>`
      : "";
    const description = this.system.description
      ? `<div class="item-description">${this.system.description}</div>`
      : "";

    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `
        <div class="hack100-item-use">
          <h3><img src="${this.img}" width="24" height="24"/> ${title}</h3>
          ${description}
          ${remaining}
        </div>
      `,
    });
  }

  /**
   * Roll a weapon attack
   * @param {object} options
   * @param {boolean} options.skipDialog - Roll right away, without the modifier dialog
   */
  async _rollWeaponAttack({ skipDialog = false } = {}) {
    const actor = this.actor;
    if (!actor) return;

    const weaponData = this.system;
    const isRanged = weaponData.weaponType === "ranged";
    const abilityId = isRanged ? "ranged" : "melee";

    // Roll the attack - skip automatic damage since we'll roll it with weapon damage
    const attackResult = await actor.rollAbility(abilityId, {
      modifier: weaponData.attackBonus || 0,
      skipDamage: true, // Don't auto-roll damage for weapon attacks
      skipDialog,
    });

    if (!attackResult || !attackResult.success) return;

    // If attack succeeds, roll damage with weapon damage modifier
    const { rollDamage } = await import("../hack100.js");
    const damage = await rollDamage(weaponData.damage, attackResult.result);

    return { attack: attackResult, damage };
  }

  /**
   * Roll a specialism check
   */
  async _rollSpecialism() {
    const actor = this.actor;
    if (!actor) return;

    const specialismData = this.system;
    const target = specialismData.value;
    const label = this.name;

    const { rollTask } = await import("../hack100.js");
    return await rollTask(target, label, 0);
  }
}
