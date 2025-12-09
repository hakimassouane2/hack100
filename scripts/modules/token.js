/**
 * Custom Token class for Hack100 system
 * Extends the base Token to render temp HP as a light blue overlay on the health bar
 * and provides movement speed data for the ruler color system
 */
export class Hack100Token extends Token {
  /**
   * Get the movement speed of this token's actor in grid units (squares)
   * @returns {number} Movement speed in squares
   */
  getMovementSpeed() {
    const actor = this.document?.actor || this.actor;
    if (!actor) return 8; // Default movement
    return actor.system?.movement ?? 8;
  }
  /**
   * Override getBarAttribute to include temp HP in the displayed value
   * This makes the HP display show current + temp HP
   * @param {string} barName - The name of the bar (bar1 or bar2)
   * @returns {object|null} - The bar attribute data
   */
  getBarAttribute(barName) {
    const data = super.getBarAttribute(barName);
    if (!data || data.attribute !== "health") return data;

    // Get temp HP from the actor
    const actor = this.document.actor;
    if (!actor) return data;

    const temp = actor.system.health?.temp || 0;

    // Modify the value to include temp HP for display purposes
    if (temp > 0) {
      return {
        ...data,
        value: data.value + temp,
        max: data.max + temp,
      };
    }

    return data;
  }

  /**
   * Override _drawBar to add custom temp HP visualization
   * @param {number} number - The bar number (0 or 1)
   * @param {PIXI.Graphics} bar - The bar graphics container
   * @param {object} data - The bar data
   * @returns {boolean}
   */
  _drawBar(number, bar, data) {
    // Only customize if this is the health bar
    if (data.attribute === "health") {
      return this._drawHPBar(number, bar, data);
    }
    return super._drawBar(number, bar, data);
  }

  /**
   * Draw the HP bar with temp HP overlay
   * Temp HP appears as a light blue bar on top of the regular HP
   * @param {number} number - The bar number
   * @param {PIXI.Graphics} bar - The bar graphics container
   * @param {object} data - The bar data
   * @returns {boolean}
   */
  _drawHPBar(number, bar, data) {
    const actor = this.document.actor;
    if (!actor) return super._drawBar(number, bar, data);

    // Get HP values
    const hp = actor.system.health;
    const current = hp.value;
    const max = hp.max;
    const temp = hp.temp || 0;

    // If no max, fall back to default
    if (max === 0) return super._drawBar(number, bar, data);

    // Calculate bar dimensions - match Foundry's default sizing
    const { width, height } = this.getSize();
    const barHeight = Math.max(canvas.dimensions.size / 12, 8);
    const barWidth = width;
    const posY = number === 0 ? height - barHeight : 0;

    // Define colors
    const colors = {
      background: 0x000000,
      border: 0x000000,
      hp: this._getHPColor(current, max),
      temp: 0x66ccff, // Light blue for temp HP
    };

    // Calculate HP percentage based on max HP only (not including temp)
    const hpPct = Math.clamp(current / max, 0, 1);

    // Calculate temp HP percentage relative to max HP
    // This way temp HP is shown as additional health on top
    const tempPct = Math.clamp(temp / max, 0, 1);

    // Slim border for cleaner look
    const borderSize = 0.75;
    const borderRadius = 2;

    // Clear and redraw
    bar.clear();

    // Draw background (dark, semi-transparent)
    bar
      .beginFill(colors.background, 0.6)
      .lineStyle(borderSize, colors.border, 1.0)
      .drawRoundedRect(0, posY, barWidth, barHeight, borderRadius);

    // Calculate inner dimensions
    const innerX = borderSize;
    const innerY = posY + borderSize;
    const innerWidth = barWidth - 2 * borderSize;
    const innerHeight = barHeight - 2 * borderSize;

    // Draw main HP bar (the base health) - always based on current/max
    const hpWidth = Math.max(0, hpPct * innerWidth);
    if (current > 0) {
      bar
        .beginFill(colors.hp, 1.0)
        .lineStyle(0)
        .drawRoundedRect(
          innerX,
          innerY,
          hpWidth,
          innerHeight,
          Math.max(0, borderRadius - 1)
        );
    }

    // Draw temp HP bar on TOP of the HP bar (light blue overlay)
    // Temp HP is drawn with a small margin inside the HP bar
    if (temp > 0) {
      // Temp HP width is proportional to max HP, capped at the HP bar width
      const tempWidth = Math.min(Math.max(0, tempPct * innerWidth), hpWidth);
      // Add margins - larger vertical margin for a thinner bar
      const tempMarginX = Math.max(1, Math.floor(innerHeight * 0.15));
      const tempMarginY = Math.max(2, Math.floor(innerHeight * 0.25));
      bar
        .beginFill(colors.temp, 1.0)
        .lineStyle(0)
        .drawRoundedRect(
          innerX + tempMarginX,
          innerY + tempMarginY,
          Math.max(0, tempWidth - 2 * tempMarginX),
          innerHeight - 2 * tempMarginY,
          Math.max(0, borderRadius - 1)
        );
    }

    // Set position
    bar.position.set(0, 0);

    return true;
  }

  /**
   * Get HP bar color based on current HP percentage
   * @param {number} current - Current HP
   * @param {number} max - Maximum HP
   * @returns {number} - Color as hex
   */
  _getHPColor(current, max) {
    const pct = Math.clamp(current / max, 0, 1);

    // Color gradient: Red -> Orange -> Yellow -> Green
    if (pct <= 0.25) {
      return 0xff0000; // Red - critical
    } else if (pct <= 0.5) {
      return 0xff8000; // Orange - injured
    } else if (pct <= 0.75) {
      return 0xffff00; // Yellow - wounded
    } else {
      return 0x00ff00; // Green - healthy
    }
  }
}
