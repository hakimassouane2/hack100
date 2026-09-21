/**
 * Experience checks granted by the GM from the chat.
 *
 * A failed ability or specialism roll of a character carries in its flags the
 * actor and the ability rolled (flags.hack100.xp). The GM, and only the GM,
 * sees a button on that message to grant the experience check: it is not
 * automatic any more, only failures that matter in the story should count.
 */

const FLAG_SCOPE = "hack100";
const FLAG_KEY = "xp";

/**
 * Flags to put on a roll message so the GM can grant an experience check
 * @param {Actor} actor - The character who rolled
 * @param {string} abilityId - The ability or specialism rolled
 * @returns {object}
 */
export function xpCardFlags(actor, abilityId) {
  return { [FLAG_SCOPE]: { [FLAG_KEY]: { actorUuid: actor.uuid, abilityId, granted: false } } };
}

/**
 * Add the GM's "grant an experience check" button to a failed roll message
 * @param {ChatMessage} message
 * @param {HTMLElement} html
 */
export function renderXpCard(message, html) {
  const xp = message.getFlag(FLAG_SCOPE, FLAG_KEY);
  const container = html.querySelector(".hack100-roll");
  if (!xp || !container || !game.user.isGM) return;

  const actor = fromUuidSync(xp.actorUuid);
  if (!actor) return;

  const label = xp.granted
    ? `<i class="fas fa-check"></i> ${game.i18n.localize("hack100.xpGrant.granted")}`
    : `<i class="fas fa-star"></i> ${game.i18n.localize("hack100.xpGrant.grant")}`;
  container.insertAdjacentHTML(
    "beforeend",
    `<button type="button" class="xp-grant${xp.granted ? " is-granted" : ""}" title="${game.i18n.localize(
      xp.granted ? "hack100.xpGrant.revokeHint" : "hack100.xpGrant.grantHint"
    )}">${label}</button>`
  );

  // Click again to take the check back (a misclick, or a roll that did not matter)
  container.querySelector(".xp-grant").addEventListener("click", async (event) => {
    event.preventDefault();
    const button = event.currentTarget;
    if (button.disabled) return;
    button.disabled = true;

    const granted = !xp.granted;
    const path = actor.system.abilities?.[xp.abilityId] ? "abilities" : "specialisms";
    if (actor.system[path]?.[xp.abilityId]) {
      await actor.update({ [`system.${path}.${xp.abilityId}.experienceCheck`]: granted });
    }
    await message.setFlag(FLAG_SCOPE, FLAG_KEY, { ...xp, granted });
  });
}
