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

  // Configure Combat initiative
  CONFIG.Combat.initiative = {
    formula: "1d10 + @abilities.agility.bonus",
    decimals: 2,
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

  // Get targeted tokens
  const targets = Array.from(game.user.targets);
  const hasTargets = targets.length > 0;

  // Build apply damage button if there are targets
  let applyDamageButton = "";
  if (hasTargets) {
    const targetIds = targets.map((t) => t.id).join(",");
    applyDamageButton = `
      <button class="apply-damage" data-damage="${totalDamage}" data-targets="${targetIds}">
        ${game.i18n.localize("hack100.global.applyDamage")}
      </button>
    `;
  }

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
      ${applyDamageButton}
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
 * Handle clicking apply damage buttons in chat messages
 */
Hooks.on("renderChatMessage", (message, html, data) => {
  html.find(".apply-damage").click(async (event) => {
    event.preventDefault();
    const button = event.currentTarget;
    const damage = parseInt(button.dataset.damage);
    const targetIds = button.dataset.targets.split(",");

    // Apply damage to each targeted token
    for (const targetId of targetIds) {
      const token = canvas.tokens.get(targetId);
      if (!token) continue;

      const actor = token.actor;
      if (!actor) continue;

      // Get total armor protection
      const armorProtection = actor.getTotalArmor ? actor.getTotalArmor() : 0;

      // Calculate damage after armor reduction
      const reducedDamage = Math.max(0, damage - armorProtection);

      // Calculate new health
      const currentHealth = actor.system.health.value;
      const newHealth = Math.max(0, currentHealth - reducedDamage);

      // Update actor health
      await actor.update({ "system.health.value": newHealth });

      // Show notification with armor info
      if (armorProtection > 0) {
        ui.notifications.info(
          game.i18n.format("hack100.notifications.damageAppliedWithArmor", {
            damage: damage,
            armor: armorProtection,
            finalDamage: reducedDamage,
            name: actor.name,
            health: newHealth,
          })
        );
      } else {
        ui.notifications.info(
          game.i18n.format("hack100.notifications.damageApplied", {
            damage: damage,
            name: actor.name,
            health: newHealth,
          })
        );
      }
    }

    // Disable button after use
    button.disabled = true;
    button.textContent = game.i18n.localize("hack100.global.damageApplied");
  });
});
