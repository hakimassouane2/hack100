/**
 * Movement Speed Ruler Coloring for Hack100 system
 * Colors the token drag ruler based on token movement speed:
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

    // Convert to feet (1 square = 5 ft) to match Foundry's measurement
    const movementFeet = movementSquares * 5;

    // Get the cumulative distance/cost from the waypoint
    // In Foundry v13, waypoint.measurement.cost contains the movement cost
    const cost = waypoint?.measurement?.cost ?? waypoint?.distance ?? 0;

    // Calculate which speed tier we're in
    // Subtract a small amount to handle floating point issues at boundaries
    const increment = (cost - 0.1) / movementFeet;

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
