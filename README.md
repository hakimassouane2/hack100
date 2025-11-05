# Hack100 for Foundry VTT

A simple, flexible d100 gaming system implementation for Foundry Virtual Tabletop.

## Overview

Hack100 is a percentile-based role-playing game system that uses d100 rolls for task resolution. This implementation provides full support for character management, combat, experience tracking, and character progression within Foundry VTT.

## Features

### Core Mechanics
- **D100 Roll System**: Roll under your ability percentage for success
  - 01-10: Critical Success
  - 91-100: Critical Failure
  - Automatic difficulty modifiers via dialog prompts
- **Experience System**: Earn experience checks on successful rolls and improve abilities over time
- **Dynamic Damage**: Weapon damage calculated using the tens digit of attack rolls plus weapon modifiers

### Character Management
- **10 Core Abilities**: Strength, Agility, Stealth, Toughness, Perception, Reasoning, Influence, Willpower, Melee, Ranged
- **Derived Statistics**:
  - Health calculated from Toughness and Willpower bonuses
  - Movement affected by equipped armor
  - Automatic ability bonus calculations
- **Custom Specialisms**: Create specialized skills with higher success rates
- **Journal System**: Track quick notes, clues, NPCs, rumors, and free-form entries

### Item Types
- **Weapons**: Melee and ranged weapons with damage modifiers and attack bonuses
- **Armor**: Protection with agility and movement penalties
- **General Items**: Equipment with weight, price, and location tracking
- **Specialisms**: Custom skills that function as rollable abilities

### Character Types
- **Player Characters**: Full character sheets with backgrounds, biography, and customizable color schemes
- **NPCs**: Streamlined sheets with base ability values and description fields

## Installation

### Method 1: Manifest URL (Recommended)
1. Open Foundry VTT
2. Go to "Add-on Modules" or "Game Systems"
3. Click "Install System"
4. Paste this manifest URL:
   ```
   https://raw.githubusercontent.com/hakimassouane2/hack100/refs/heads/staging/system.json
   ```
5. Click "Install"

### Method 2: Manual Installation
1. Download the latest release from the [GitHub repository](https://github.com/hakimassouane2/hack100)
2. Extract the zip file to your Foundry VTT `Data/systems` folder
3. Rename the extracted folder to `hack100`
4. Restart Foundry VTT

## Usage

### Creating a Character
1. Create a new Actor and select "Character" type
2. Set ability values (typically 20-100%)
3. Add items, weapons, and armor from the Items sidebar
4. Equip armor and weapons as needed
5. Create custom specialisms for specialized skills

### Making Rolls
- **Ability Rolls**: Click on any ability name to roll d100
- **Specialism Rolls**: Click on a specialism in your character sheet
- **Weapon Attacks**: Click the attack icon next to equipped weapons
  - On success, damage is automatically rolled using the attack roll's tens digit
- **Experience Rolls**: Click the experience check icon to attempt ability improvement

### Roll Modifiers
When making ability or specialism rolls, a dialog appears allowing you to:
- Select difficulty (Very Easy +40, Easy +20, Normal 0, Difficult -20, Very Difficult -40)
- Apply custom modifiers
- Add situational bonuses or penalties

### Experience and Advancement
1. Successful ability/specialism rolls award an experience check (✓)
2. Click the experience check icon to roll for improvement
3. Roll d100: if the result is greater than your current ability value, improve by d5
4. Experience checks are consumed after the improvement attempt

## Compatibility

- **Minimum Foundry VTT Version**: 10
- **Verified Version**: 13
- **Maximum Version**: 13

## Localization

Currently available in:
- English (en)
- French (fr)

## Support and Contributions

- **Issues**: Report bugs on the [GitHub Issues page](https://github.com/hakimassouane2/hack100/issues)
- **Repository**: [github.com/hakimassouane2/hack100](https://github.com/hakimassouane2/hack100)

## Credits

**Author**: Hakim Assouane
**Contact**: hakimassouane@hotmail.com

## Version History

### 1.0.1
- Added missing translations
- Bug fixes and stability improvements

### 1.0.0
- Initial release
- Full character and NPC sheet implementation
- D100 roll system with experience tracking
- Weapon, armor, and item management
- Journal system for tracking campaign information
- English and French localization

## License

This system is provided as-is for use with Foundry Virtual Tabletop.
