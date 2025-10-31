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
  await roll.roll({ async: true });

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

  const chatData = {
    user: game.user.id,
    content: `
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
    `,
  };

  await ChatMessage.create(chatData);
  return { result, success, criticalSuccess, criticalFailure };
}

/**
 * Roll damage
 * @param {string} weaponDamage - Weapon damage modifier
 * @param {number} attackRoll - The attack roll (to get tens digit)
 */
export async function rollDamage(weaponDamage, attackRoll) {
  const tensDigit = Math.floor(attackRoll / 10);
  const roll = new Roll(`${tensDigit} + ${weaponDamage}`);
  await roll.roll({ async: true });

  const chatData = {
    user: game.user.id,
    content: `
      <div class="hack100-damage">
        <h3>${game.i18n.localize("hack100.global.damageRoll")}</h3>
        <div class="damage-result">
          <strong>${roll.total}</strong> ${game.i18n.localize(
      "hack100.global.damage"
    )}
        </div>
        <div class="damage-breakdown">
            ${game.i18n.localize(
              "hack100.global.tensDie"
            )}: ${tensDigit} + ${game.i18n.localize(
      "hack100.global.weapon"
    )}: ${weaponDamage}
        </div>
      </div>
    `,
  };

  await ChatMessage.create(chatData);
  return roll.total;
}

/* -------------------------------------------- */
/*  Ready Hook                                  */
/* -------------------------------------------- */

Hooks.once("ready", async function () {
  console.log(`Hack100 | System Ready`);
});
