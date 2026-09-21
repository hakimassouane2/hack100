/**
 * Movement Speed Ruler for Hack100 system
 * Measures the token drag ruler in squares, whatever the scene's grid units,
 * and colors it based on token movement speed:
 * - Green: Within normal movement (up to actor's movement stat in squares)
 * - Yellow: Dash movement (between 1x and 2x movement)
 * - Red: Beyond dash range (more than 2x movement)
 *
 * Compatible with Foundry VTT v13
 */

// Movement speed colors (similar to dnd5e)
const SPEED_COLORS = {
  normal: 0x00ff00,   // Green - normal movement
  double: 0xffff00,   // Yellow - dash (double movement)
  triple: 0xff0000    // Red - beyond dash range
};

/**
 * Custom TokenRuler class for Hack100 system
 * Extends the base TokenRuler to color segments based on movement speed
 */
export class Hack100TokenRuler extends foundry.canvas.placeables.tokens.TokenRuler {

  /**
   * Show distances in squares (1 grid space = 1 square) rather than scene units
   * @override
   */
  _getWaypointLabelContext(waypoint, state) {
    const context = super._getWaypointLabelContext(waypoint, state);
    if (!context) return context;

    const units = game.i18n.localize("hack100.character.squares");
    const toSquares = (distance) => distance / (canvas.grid.distance || 1);
    const format = (distance) => toSquares(distance).toNearest(0.01).toLocaleString(game.i18n.lang);

    context.units = units;
    context.distance.total = format(waypoint.measurement.distance);
    if (waypoint.index >= 2) {
      context.distance.delta = toSquares(waypoint.measurement.backward.distance).toNearest(0.01).signedString();
    }

    const cost = waypoint.measurement.cost;
    context.cost.units = units;
    context.cost.total = Number.isFinite(cost) ? format(cost) : "∞";
    if (waypoint.index >= 2) {
      const deltaCost = waypoint.cost;
      context.cost.delta = Number.isFinite(deltaCost)
        ? toSquares(deltaCost).toNearest(0.01).signedString()
        : "∞";
    }
    return context;
  }

  /**
   * Get the style for a ruler segment based on movement speed
   * @param {object} waypoint - The waypoint data
   * @returns {object} Style object with color, width, etc.
   */
  _getSegmentStyle(waypoint) {
    const style = super._getSegmentStyle(waypoint);
    return this.#getSpeedBasedStyle(waypoint, style);
  }

  /**
   * Get the style for grid highlighting based on movement speed
   * @param {object} waypoint - The waypoint data
   * @returns {object} Style object
   */
  _getGridHighlightStyle(waypoint) {
    const style = super._getGridHighlightStyle(waypoint);
    return this.#getSpeedBasedStyle(waypoint, style);
  }

  /**
   * Modify style based on movement speed
   * @param {object} waypoint - The waypoint with measurement data
   * @param {object} style - The base style to modify
   * @returns {object} Modified style with speed-based color
   */
  #getSpeedBasedStyle(waypoint, style) {
    // Get the token's actor
    const actor = this.token?.actor;
    if (!actor) return style;

    // Get movement speed in squares (default 8)
    const movementSquares = actor.system?.movement ?? 8;

    // Convert to the scene's grid units to match Foundry's measurement
    const movementDistance = movementSquares * (canvas.grid.distance || 1);

    // Get the cumulative distance/cost from the waypoint
    // In Foundry v13, waypoint.measurement.cost contains the movement cost
    const cost = waypoint?.measurement?.cost ?? waypoint?.distance ?? 0;

    // Calculate which speed tier we're in
    // Subtract a small amount to handle floating point issues at boundaries
    const increment = (cost - 0.1) / movementDistance;

    // Determine color based on movement increment
    let color;
    if (increment <= 1) {
      color = SPEED_COLORS.normal;  // Green - within normal movement
    } else if (increment <= 2) {
      color = SPEED_COLORS.double;  // Yellow - dash range
    } else {
      color = SPEED_COLORS.triple;  // Red - beyond dash
    }

    return { ...style, color };
  }
}

/**
 * Initialize the ruler color system for Foundry v13
 * Called from the main hack100.js init hook
 */
export function initRulerColors() {
  console.log("Hack100 | Ruler color system will be registered in init hook");
}
