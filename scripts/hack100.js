/**
 * Hack100 System for Foundry VTT
 */

// Import modules
import { Hack100ActorSheet } from "../sheets/actor-sheet.js";
import { Hack100ItemSheet } from "../sheets/item-sheet.js";
import { Hack100Actor } from "./modules/actor.js";
import { Hack100Item } from "./modules/item.js";

/* -------------------------------------------- */
/*  Foundry VTT Initialization                  */
/* -------------------------------------------- */

Hooks.once("init", async function () {
  console.log(`Hack100 | Initializing Hack100 System`);

  // Define custom Entity classes
  CONFIG.Actor.documentClass = Hack100Actor;
  CONFIG.Item.documentClass = Hack100Item;

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
});

/* -------------------------------------------- */
/*  Dice Rolling Functions                      */
/* -------------------------------------------- */

/**
 * Roll a d100 task check
 * @param {number} target - Target percentage
 * @param {string} label - Label for the roll
 * @param {number} modifier - Difficulty modifier
 */
export async function rollTask(target, label, modifier = 0) {
  const modifiedTarget = target + modifier;
  const roll = new Roll("1d100");
  await roll.evaluate();

  const result = roll.total;
  const success = result <= modifiedTarget;
  const criticalSuccess = result >= 1 && result <= 10;
  const criticalFailure = result >= 91 && result <= 100;

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
 * @param {number} attackRoll - The attack roll (to get units digit)
 */
export async function rollDamage(weaponDamage, attackRoll) {
  const unitsDigit = attackRoll % 10; // Get the ones place (units digit)
  const weaponDamageMod = parseInt(weaponDamage) || 0;
  const totalDamage = unitsDigit + weaponDamageMod;

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
          )}: ${unitsDigit} + ${game.i18n.localize(
    "hack100.global.weapon"
  )}: ${weaponDamageMod}
      </div>
    </div>
  `;

  await ChatMessage.create({
    content: content,
    speaker: ChatMessage.getSpeaker(),
  });

  return totalDamage;
}

/* -------------------------------------------- */
/*  Ready Hook                                  */
/* -------------------------------------------- */

Hooks.once("ready", async function () {
  console.log(`Hack100 | System Ready`);
});
