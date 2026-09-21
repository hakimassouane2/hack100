/**
 * Hack100 System for Foundry VTT
 */

// Import modules
import { Hack100ActorSheet } from "../sheets/actor-sheet.js";
import { Hack100ItemSheet } from "../sheets/item-sheet.js";
import { Hack100Actor } from "./modules/actor.js";
import { Hack100Item } from "./modules/item.js";
import { Hack100Token } from "./modules/token.js";
import { Hack100TokenRuler } from "./modules/ruler.js";
import { damageCardFlags, registerDamageCardSockets, renderDamageCard } from "./modules/damage-card.js";

/* -------------------------------------------- */
/*  Foundry VTT Initialization                  */
/* -------------------------------------------- */

Hooks.once("init", async function () {
  console.log(`Hack100 | Initializing Hack100 System`);

  // Define custom Entity classes
  CONFIG.Actor.documentClass = Hack100Actor;
  CONFIG.Item.documentClass = Hack100Item;
  CONFIG.Token.objectClass = Hack100Token;
  CONFIG.Token.rulerClass = Hack100TokenRuler;

  // Patch TokenDocument.getBarAttribute to include temp HP
  const originalGetBarAttribute = TokenDocument.prototype.getBarAttribute;
  TokenDocument.prototype.getBarAttribute = function (barName, options = {}) {
    const data = originalGetBarAttribute.call(this, barName, options);
    if (!data || data.attribute !== "health") return data;

    const actor = this.actor;
    if (!actor) return data;

    const temp = actor.system.health?.temp || 0;
    if (temp > 0) {
      return {
        ...data,
        value: data.value + temp,
        max: data.max + temp
      };
    }
    return data;
  };

  // Friendly tokens in green rather than Foundry's default turquoise
  CONFIG.Canvas.dispositionColors.FRIENDLY = 0x3fbf3f;

  // Configure Combat initiative - default formula (overridden per-actor in Combatant)
  CONFIG.Combat.initiative = {
    formula: "1d10",
    decimals: 2,
  };

  // Override Combatant to use actor-specific initiative formulas
  const originalGetInitiativeRoll = Combatant.prototype.getInitiativeRoll;
  Combatant.prototype.getInitiativeRoll = function(formula) {
    const actor = this.actor;
    if (actor) {
      // Use actor's custom initiative formula
      if (actor.type === "npc") {
        formula = "1d10 + @rateBonus";
      } else {
        formula = "1d10 + @abilities.agility.bonus";
      }
    }
    return originalGetInitiativeRoll.call(this, formula);
  };

  // Register sheet application classes
  Actors.unregisterSheet("core", ActorSheet);
  Actors.registerSheet("hack100", Hack100ActorSheet, { makeDefault: true });
  Items.unregisterSheet("core", ItemSheet);
  Items.registerSheet("hack100", Hack100ItemSheet, { makeDefault: true });

  // Register Handlebars helpers
  Handlebars.registerHelper("concat", function () {
    var str = "";
    for (var arg in arguments) {
      if (typeof arguments[arg] != "object") {
        str += arguments[arg];
      }
    }
    return str;
  });

  Handlebars.registerHelper("toLowerCase", function (str) {
    return str.toLowerCase();
  });

  Handlebars.registerHelper("capitalize", function (str) {
    if (typeof str !== "string") return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
  });

  Handlebars.registerHelper("eq", function (a, b) {
    return a === b;
  });

  Handlebars.registerHelper("checked", function (value) {
    return value ? "checked" : "";
  });

  // Helper for creating arrays (used for luck pips)
  Handlebars.registerHelper("array", function (...args) {
    // Remove the Handlebars options object from the end
    args.pop();
    return args;
  });

  // Helper for less than or equal comparison
  Handlebars.registerHelper("lte", function (a, b) {
    return a <= b;
  });
});

/* -------------------------------------------- */
/*  Dice Rolling Functions                      */
/* -------------------------------------------- */

/**
 * Roll a d100 task check
 * @param {number} target - Target percentage
 * @param {string} label - Label for the roll
 * @param {number} modifier - Difficulty modifier
 * @param {boolean} withAdvantage - Whether to roll with advantage (luck)
 */
export async function rollTask(target, label, modifier = 0, withAdvantage = false) {
  const modifiedTarget = target + modifier;

  let roll, result, advantageInfo = "";

  if (withAdvantage) {
    // Roll 2d100 and take the better result (lower is better in d100 systems)
    // Use a single roll with 2d100 so Dice So Nice shows both dice
    roll = new Roll("2d100");
    await roll.evaluate();

    const result1 = roll.dice[0].results[0].result;
    const result2 = roll.dice[0].results[1].result;

    // Take the lower roll (better for success)
    result = Math.min(result1, result2);

    // Format: show both rolls with the kept one highlighted
    const roll1Class = result1 <= result2 ? "luck-kept" : "luck-discarded";
    const roll2Class = result2 < result1 ? "luck-kept" : "luck-discarded";
    advantageInfo = `<div class="advantage-info"><i class="fas fa-clover"></i> ${game.i18n.localize("hack100.luck.rolled")}: <span class="${roll1Class}">${result1}</span> / <span class="${roll2Class}">${result2}</span> — ${game.i18n.localize("hack100.luck.kept")}: <strong>${result}</strong></div>`;
  } else {
    roll = new Roll("1d100");
    await roll.evaluate();
    result = roll.total;
  }

  const success = result <= modifiedTarget;
  const criticalSuccess = result >= 1 && result <= 10;
  // Critical failure: always on 100, or when rolling strictly above the target (minimum 91)
  const critFailThreshold = Math.max(91, modifiedTarget + 1);
  const criticalFailure = result === 100 || (result >= critFailThreshold && result <= 100);

  let resultText = "";
  if (criticalSuccess) {
    resultText = game.i18n.localize("hack100.global.criticalSuccess");
  } else if (criticalFailure) {
    resultText = game.i18n.localize("hack100.global.criticalFailure");
  } else if (success) {
    resultText = game.i18n.localize("hack100.global.success");
  } else {
    resultText = game.i18n.localize("hack100.global.failure");
  }

  const flavor = `
    <div class="hack100-roll">
      <h3>${label}</h3>
      ${advantageInfo}
      <div class="roll-result">
        <strong>${result}</strong> vs ${game.i18n.localize(
    "hack100.rollDialog.target"
  )}: ${modifiedTarget}
      </div>
      <div class="result-text ${
        criticalSuccess
          ? "critical"
          : criticalFailure
          ? "fumble"
          : success
          ? "success"
          : "failure"
      }">
        ${resultText}
      </div>
    </div>
  `;

  // Show the roll with Dice So Nice animation
  const message = await roll.toMessage(
    {
      flavor: flavor,
      speaker: ChatMessage.getSpeaker(),
      flags: {
        "core.canPopout": false,
      },
    },
    {
      rollMode: game.settings.get("core", "rollMode"),
      create: true,
    }
  );

  // Wait for Dice So Nice animation to complete if it's enabled
  if (game.dice3d) {
    await game.dice3d.waitFor3DAnimationByMessageID(message.id);
  }

  return { result, success, criticalSuccess, criticalFailure };
}

/**
 * Roll damage
 * @param {string} weaponDamage - Weapon damage modifier
 * @param {number} attackRoll - The attack roll (to get tens digit)
 * @param {string} [modifierLabel] - Label of the damage modifier (defaults to "Weapon")
 */
export async function rollDamage(weaponDamage, attackRoll, modifierLabel) {
  // Tens place of the roll, where a 0 counts as 10 (e.g. 29 -> 2, 07 -> 10)
  const tensDigit = Math.floor(attackRoll / 10) % 10 || 10;
  const weaponDamageMod = parseInt(weaponDamage) || 0;
  const totalDamage = tensDigit + weaponDamageMod;

  const content = `
    <div class="hack100-damage">
      <h3>${game.i18n.localize("hack100.global.damageRoll")}</h3>
      <div class="damage-result">
        <strong>${totalDamage}</strong> ${game.i18n.localize(
    "hack100.global.damage"
  )}
      </div>
      <div class="damage-breakdown">
          ${game.i18n.localize(
            "hack100.global.tensDie"
          )}: ${tensDigit} +${
    modifierLabel ?? game.i18n.localize("hack100.global.weapon")
  }: ${weaponDamageMod}
      </div>
    </div>
  `;

  // Targets, apply and undo are handled by the card itself (damage-card.js)
  await ChatMessage.create({
    content: content,
    speaker: ChatMessage.getSpeaker(),
    flags: damageCardFlags(totalDamage),
  });

  return totalDamage;
}

/* -------------------------------------------- */
/*  Ready Hook                                  */
/* -------------------------------------------- */

Hooks.once("ready", async function () {
  console.log(`Hack100 | System Ready`);
  if (game.user.isGM) await removeObsoleteActorData();
});

/**
 * Obsolete system fields, per actor type, removed from stored actor data
 */
const OBSOLETE_ACTOR_FIELDS = {
  character: ["journal"],
  npc: ["journal", "damageFormula", "currency"],
};

/**
 * Migrate or remove obsolete fields from the stored data of world actors
 */
async function removeObsoleteActorData() {
  const updates = [];
  for (const actor of game.actors) {
    const source = actor._source.system ?? {};
    const update = {};
    // The single "background" text became two fields: keep its content in the first one
    if (actor.type === "character" && source.background) {
      if (!source.greatBecause && !source.societyProblem) {
        update["system.greatBecause"] = source.background;
      }
      update["system.-=background"] = null;
    }
    for (const key of OBSOLETE_ACTOR_FIELDS[actor.type] ?? []) {
      if (key in source) update[`system.-=${key}`] = null;
    }
    if (Object.keys(update).length) updates.push({ _id: actor.id, ...update });
  }
  if (!updates.length) return;
  await Actor.updateDocuments(updates);
  console.log(`Hack100 | Removed obsolete data from ${updates.length} actor(s)`);
}

/* -------------------------------------------- */
/*  Pre-Update Actor Hook for Temp HP           */
/* -------------------------------------------- */

/**
 * Intercept HP changes to handle temp HP depletion
 * When HP is manually reduced, temp HP should be consumed first
 */
Hooks.on("preUpdateActor", (actor, changes, options, userId) => {
  // Only process if health value is being changed
  if (typeof changes.system?.health?.value !== "number") return;

  // Never let current HP exceed max HP (e.g. holding the up arrow in the input)
  const maxHP = changes.system.health.max ?? actor.system.health.max;
  if (typeof maxHP === "number" && changes.system.health.value > maxHP) {
    changes.system.health.value = maxHP;
  }

  // Damage cards already split the damage between temp HP and HP
  if (options.hack100DamageHandled) return;

  const currentHP = actor.system.health.value;
  const currentTempHP = actor.system.health.temp || 0;
  const newHP = changes.system.health.value;

  // Only process if HP is being reduced (damage)
  if (newHP >= currentHP) return;

  // If there's no temp HP, let the change proceed normally
  if (currentTempHP <= 0) return;

  // Calculate the damage being dealt
  const damage = currentHP - newHP;

  // Apply damage to temp HP first
  if (damage <= currentTempHP) {
    // Temp HP absorbs all the damage
    changes.system.health.value = currentHP; // Keep HP the same
    changes.system.health = changes.system.health || {};
    changes.system.health.temp = currentTempHP - damage;
  } else {
    // Temp HP is depleted, remaining damage goes to HP
    const remainingDamage = damage - currentTempHP;
    changes.system.health.value = currentHP - remainingDamage;
    changes.system.health = changes.system.health || {};
    changes.system.health.temp = 0;
  }
});

/* -------------------------------------------- */
/*  Actor Rename Hooks                          */
/* -------------------------------------------- */

/**
 * When an actor is renamed from its sheet, keep its token names in sync
 * (prototype token, linked tokens on scenes, and the token of a synthetic actor)
 */
Hooks.on("preUpdateActor", (actor, changes, options) => {
  if (typeof changes.name !== "string" || changes.name === actor.name) return;
  options.hack100RenamedFrom = actor.name;
  if (!actor.isToken && actor.prototypeToken?.name === actor.name) {
    foundry.utils.setProperty(changes, "prototypeToken.name", changes.name);
  }
});

Hooks.on("updateActor", async (actor, changes, options, userId) => {
  const oldName = options.hack100RenamedFrom;
  if (!oldName || userId !== game.user.id) return;

  // Unlinked token: rename the token itself
  if (actor.isToken) {
    if (actor.token.name === oldName) await actor.token.update({ name: actor.name });
    return;
  }

  // Linked tokens placed on scenes
  for (const scene of game.scenes) {
    const updates = scene.tokens
      .filter((t) => t.actorLink && t.actorId === actor.id && t.name === oldName)
      .map((t) => ({ _id: t.id, name: actor.name }));
    if (updates.length && scene.canUserModify(game.user, "update")) {
      await scene.updateEmbeddedDocuments("Token", updates);
    }
  }
});

/* -------------------------------------------- */
/*  Token HUD Hook for Temp HP Display          */
/* -------------------------------------------- */

/**
 * Modify the Token HUD to display current HP + temp HP
 */
Hooks.on("renderTokenHUD", (hud, html) => {
  const actor = hud.object?.actor;
  if (!actor) return;

  const temp = actor.system.health?.temp || 0;
  if (temp <= 0) return;

  const currentHP = actor.system.health?.value || 0;
  const effectiveHP = currentHP + temp;

  // In Foundry v13, find all inputs in the HUD and update bar1
  const inputs = html.find("input");
  inputs.each(function () {
    const input = $(this);
    const name = input.attr("name") || "";
    if (name.includes("bar1")) {
      input.val(effectiveHP);
    }
  });

  // Also try to find any span/div showing the value
  html.find(".bar1 .value, .bar1-value, [data-bar='bar1']").each(function () {
    $(this).text(effectiveHP);
  });
});

/* -------------------------------------------- */
/*  Socketlib Registration                      */
/* -------------------------------------------- */

Hooks.once("socketlib.ready", () => {
  console.log(`Hack100 | Registering socketlib functions`);

  // Register socket namespace under game.hack100
  game.hack100 = game.hack100 || {};
  game.hack100.socket = socketlib.registerSystem("hack100");

  // Damage card actions run on the GM's client
  registerDamageCardSockets(game.hack100.socket);

  console.log(`Hack100 | Socketlib registered successfully`);
});

/* -------------------------------------------- */
/*  Hotbar Macros                               */
/* -------------------------------------------- */

/**
 * Create a Macro from an Item drop.
 * Get an existing item macro if one exists, otherwise create a new one.
 * @param {Object} data     The dropped data
 * @param {number} slot     The hotbar slot to use
 * @returns {Promise}
 */
async function createHack100Macro(data, slot) {
  if (data.type !== "Item") return;

  // Get the Item from the UUID
  const item = await fromUuid(data.uuid);
  if (!item)
    return ui.notifications.warn(
      "You can only create macro buttons for owned Items"
    );

  // Only create macros for weapons
  if (item.type !== "weapon") {
    return ui.notifications.warn(
      "You can only create macro buttons for weapons"
    );
  }

  // Create the macro command
  const command = `// Roll weapon attack: ${item.name}
const item = await fromUuid("${data.uuid}");
if (item) {
  item.roll();
} else {
  ui.notifications.warn("Weapon not found. Make sure the item still exists.");
}`;

  // Create or update the macro
  let macro = game.macros.find(
    (m) => m.name === item.name && m.command === command
  );
  if (!macro) {
    macro = await Macro.create({
      name: item.name,
      type: "script",
      img: item.img,
      command: command,
      flags: { "hack100.itemMacro": true },
    });
  }

  if (macro) {
    game.user.assignHotbarMacro(macro, slot);
  }
  return false;
}

/**
 * Hook hotbar drops to create macros
 */
Hooks.on("hotbarDrop", (bar, data, slot) => {
  createHack100Macro(data, slot);
  return false; // Prevent default handling
});

/* -------------------------------------------- */
/*  Chat Message Hooks                          */
/* -------------------------------------------- */

/**
 * Draw the targets of damage cards and wire their buttons
 */
Hooks.on("renderChatMessageHTML", (message, html) => {
  renderDamageCard(message, html);
});
