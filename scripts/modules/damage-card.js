/**
 * Damage chat card with its own targets.
 *
 * The damage roll lands in chat with the list of targets taken from the
 * user's targets at roll time. From the card, the attacker (or the GM) can:
 *   - replace the targets not yet hit with their current targets,
 *   - apply the damage to one target (armor and temp HP included),
 *   - undo it, giving back exactly the HP and temp HP it removed.
 *
 * The state lives in the message flags (flags.hack100.damage) and the list is
 * drawn from it on every render. Every change goes through the GM (socketlib),
 * since the attacker usually owns neither the target nor someone else's card.
 */

const FLAG_SCOPE = "hack100";
const FLAG_KEY = "damage";

/**
 * Describe a token as a damage card target
 * @param {Token} token
 * @returns {{uuid: string, name: string, img: string, applied: null}}
 */
function toTarget(token) {
  return {
    uuid: token.document.uuid,
    name: token.document.name,
    img: token.document.texture?.src ?? token.actor?.img,
    applied: null,
  };
}

/**
 * Flags of a new damage card, targeting the user's current targets
 * @param {number} amount - Damage before armor
 * @returns {object}
 */
export function damageCardFlags(amount) {
  const targets = Array.from(game.user.targets).map(toTarget);
  return { [FLAG_SCOPE]: { [FLAG_KEY]: { amount, targets } } };
}

/* -------------------------------------------- */
/*  GM side (socketlib)                         */
/* -------------------------------------------- */

/**
 * Read a damage card and one of its targets
 */
function getCardTarget(messageId, index) {
  const message = game.messages.get(messageId);
  const card = message?.getFlag(FLAG_SCOPE, FLAG_KEY);
  if (!card) return {};
  const targets = foundry.utils.deepClone(card.targets ?? []);
  const target = targets[index];
  const token = target ? fromUuidSync(target.uuid) : null;
  return { message, card, targets, target, actor: token?.actor };
}

/**
 * Apply the card's damage to one of its targets
 * @returns {object} Result for the notifications
 */
async function applyCardDamage(messageId, index) {
  const { message, card, targets, target, actor } = getCardTarget(messageId, index);
  if (!target || target.applied) return { success: false };
  if (!actor) return { success: false, error: "Actor not found" };

  const armor = actor.getTotalArmor ? actor.getTotalArmor() : 0;
  const finalDamage = Math.max(0, card.amount - armor);

  // Temp HP absorbs the damage first, then regular HP
  const oldHP = actor.system.health.value;
  const oldTemp = actor.system.health.temp || 0;
  const tempLost = Math.min(oldTemp, finalDamage);
  const hpLost = Math.min(oldHP, finalDamage - tempLost);
  const newHP = oldHP - hpLost;

  await actor.update(
    { "system.health.value": newHP, "system.health.temp": oldTemp - tempLost },
    { hack100DamageHandled: true }
  );

  targets[index].applied = { damage: finalDamage, armor, hpLost, tempLost };
  await message.setFlag(FLAG_SCOPE, FLAG_KEY, { ...card, targets });

  return { success: true, name: actor.name, damage: card.amount, armor, finalDamage, newHP };
}

/**
 * Give back to a target what the card removed from it
 */
async function undoCardDamage(messageId, index) {
  const { message, card, targets, target, actor } = getCardTarget(messageId, index);
  if (!target?.applied) return { success: false };

  if (actor) {
    const { hpLost, tempLost } = target.applied;
    await actor.update(
      {
        "system.health.value": actor.system.health.value + hpLost,
        "system.health.temp": (actor.system.health.temp || 0) + tempLost,
      },
      { hack100DamageHandled: true }
    );
  }

  targets[index].applied = null;
  await message.setFlag(FLAG_SCOPE, FLAG_KEY, { ...card, targets });
  return { success: true, name: target.name };
}

/**
 * Replace the targets not hit yet with new ones (targets already hit stay)
 * @param {string} messageId
 * @param {object[]} newTargets - Targets built with toTarget()
 */
async function setCardTargets(messageId, newTargets) {
  const message = game.messages.get(messageId);
  const card = message?.getFlag(FLAG_SCOPE, FLAG_KEY);
  if (!card) return;

  const kept = (card.targets ?? []).filter((target) => target.applied);
  const added = newTargets.filter((target) => !kept.some((k) => k.uuid === target.uuid));
  await message.setFlag(FLAG_SCOPE, FLAG_KEY, { ...card, targets: [...kept, ...added] });
}

/**
 * Register the GM-side functions with socketlib
 * @param {object} socket - The socketlib system socket
 */
export function registerDamageCardSockets(socket) {
  socket.register("applyCardDamage", applyCardDamage);
  socket.register("undoCardDamage", undoCardDamage);
  socket.register("setCardTargets", setCardTargets);
}

/* -------------------------------------------- */
/*  Card rendering                              */
/* -------------------------------------------- */

/**
 * Run a GM-side card function, with a clear warning when no GM is there
 */
async function executeAsGM(name, ...args) {
  if (!game.hack100?.socket) {
    ui.notifications.error(game.i18n.localize("hack100.damageCard.notReady"));
    return null;
  }
  try {
    return await game.hack100.socket.executeAsGM(name, ...args);
  } catch (error) {
    console.error(`Hack100 | ${name} failed`, error);
    ui.notifications.error(game.i18n.localize("hack100.damageCard.noGM"));
    return null;
  }
}

/**
 * Notify the result of an applied damage (HP left shown to the GM only)
 */
function notifyApplied(result) {
  if (!result?.success) return;
  let text;
  if (!game.user.isGM) {
    text = game.i18n.format("hack100.notifications.damageAppliedPlayer", {
      damage: result.damage,
      name: result.name,
    });
  } else if (result.armor > 0) {
    text = game.i18n.format("hack100.notifications.damageAppliedWithArmor", {
      damage: result.damage,
      armor: result.armor,
      finalDamage: result.finalDamage,
      name: result.name,
      health: result.newHP,
    });
  } else {
    text = game.i18n.format("hack100.notifications.damageApplied", {
      damage: result.damage,
      name: result.name,
      health: result.newHP,
    });
  }
  ui.notifications.info(text);
}

/**
 * HTML of the targets block
 */
function targetsHTML(card, canAct) {
  const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
  const targets = card.targets ?? [];

  const rows = targets
    .map((target, index) => {
      const applied = target.applied;
      const status = applied
        ? `<span class="target-status applied">${t("hack100.damageCard.dealt", { damage: applied.damage })}</span>`
        : "";
      let button = "";
      if (canAct) {
        button = applied
          ? `<button type="button" class="damage-card-undo" data-index="${index}" title="${t("hack100.damageCard.undoHint")}"><i class="fas fa-rotate-left"></i> ${t("hack100.damageCard.undo")}</button>`
          : `<button type="button" class="damage-card-apply" data-index="${index}" title="${t("hack100.damageCard.applyHint")}"><i class="fas fa-heart-crack"></i> ${t("hack100.damageCard.apply")}</button>`;
      }
      return `
        <li class="damage-card-target${applied ? " is-applied" : ""}">
          <img src="${target.img}" alt=""/>
          <a class="target-name" data-uuid="${target.uuid}" title="${t("hack100.damageCard.panHint")}">${target.name}</a>
          ${status}
          ${button}
        </li>`;
    })
    .join("");

  const empty = targets.length
    ? ""
    : `<p class="damage-card-empty">${t("hack100.damageCard.noTarget")}</p>`;
  const retarget = canAct
    ? `<button type="button" class="damage-card-retarget" title="${t("hack100.damageCard.retargetHint")}"><i class="fas fa-crosshairs"></i> ${t("hack100.damageCard.retarget")}</button>`
    : "";

  return `
    <div class="damage-card-targets">
      <h4>${t("hack100.damageCard.targets")}</h4>
      ${rows ? `<ul>${rows}</ul>` : ""}
      ${empty}
      ${retarget}
    </div>`;
}

/**
 * Fill a rendered damage card with its targets and wire its buttons
 * @param {ChatMessage} message
 * @param {HTMLElement} html
 */
export function renderDamageCard(message, html) {
  const card = message.getFlag(FLAG_SCOPE, FLAG_KEY);
  const container = html.querySelector(".hack100-damage");
  if (!card || !container) return;

  const canAct = game.user.isGM || message.isAuthor;
  container.querySelector(".damage-card-targets")?.remove();
  container.insertAdjacentHTML("beforeend", targetsHTML(card, canAct));

  const onClick = (selector, handler) =>
    container.querySelectorAll(selector).forEach((element) =>
      element.addEventListener("click", async (event) => {
        event.preventDefault();
        const button = event.currentTarget;
        if (button.disabled) return;
        button.disabled = true;
        try {
          await handler(button);
        } finally {
          button.disabled = false;
        }
      })
    );

  onClick(".damage-card-apply", async (button) => {
    notifyApplied(await executeAsGM("applyCardDamage", message.id, Number(button.dataset.index)));
  });

  onClick(".damage-card-undo", async (button) => {
    const result = await executeAsGM("undoCardDamage", message.id, Number(button.dataset.index));
    if (result?.success) {
      ui.notifications.info(game.i18n.format("hack100.damageCard.undone", { name: result.name }));
    }
  });

  onClick(".damage-card-retarget", async () => {
    const targets = Array.from(game.user.targets).map(toTarget);
    if (!targets.length) {
      ui.notifications.warn(game.i18n.localize("hack100.damageCard.noUserTarget"));
      return;
    }
    await executeAsGM("setCardTargets", message.id, targets);
  });

  // Clicking a name pans to the token, as in the combat tracker
  container.querySelectorAll(".target-name").forEach((link) =>
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const token = fromUuidSync(link.dataset.uuid)?.object;
      if (token) canvas.animatePan({ x: token.center.x, y: token.center.y });
    })
  );
}
