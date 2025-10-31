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
  async roll() {
    const item = this;
    const actor = this.actor;

    // Only roll for items with roll data
    if (!this.system.hasRoll) return;

    switch (this.type) {
      case "weapon":
        return this._rollWeaponAttack();
      case "specialism":
        return this._rollSpecialism();
      default:
        return;
    }
  }

  /**
   * Roll a weapon attack
   */
  async _rollWeaponAttack() {
    const actor = this.actor;
    if (!actor) return;

    const weaponData = this.system;
    const isRanged = weaponData.weaponType === "ranged";
    const abilityId = isRanged ? "ranged" : "melee";

    // Roll the attack
    const attackResult = await actor.rollAbility(abilityId, {
      modifier: weaponData.attackBonus || 0,
    });

    if (!attackResult || !attackResult.success) return;

    // If attack succeeds, roll damage
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
