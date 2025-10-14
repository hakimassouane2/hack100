# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Foundry VTT game system implementation for Hack100, a d100-based role-playing game system. The system uses Foundry VTT's ES module architecture and is built with vanilla JavaScript (no build process required).

## Development Workflow

**Testing changes**: This system runs inside Foundry VTT. To test:
1. Ensure Foundry VTT is installed and the system is in the Data/systems directory
2. Launch Foundry VTT
3. Create or load a world using the Hack100 system
4. Reload the page (F5) after making JavaScript changes
5. Use browser DevTools Console to check for errors

**Important**: There is no build process, lint command, or test suite. Changes are reflected immediately upon page reload in Foundry VTT.

## Core Architecture

### Data Model (template.json)
Defines the schema for all Actors and Items in the system:
- **Actor types**: `character`, `npc`
- **Item types**: `item`, `weapon`, `armor`, `specialism`
- Uses Foundry's template system to share common properties via the `base` template

### Document Classes
- **Hack100Actor** ([scripts/modules/actor.js](scripts/modules/actor.js)): Extends Foundry's Actor class
  - `prepareData()` and `prepareBaseData()`: Calculate derived values (ability bonuses, health max, movement)
  - `rollAbility()`: Handles d100 rolls for abilities and specialisms, shows dialog for difficulty modifiers
  - Experience system: `_awardExperienceCheck()` marks successful rolls, `rollExperience()` handles improvement rolls

- **Hack100Item** ([scripts/modules/item.js](scripts/modules/item.js)): Extends Foundry's Item class
  - `roll()`: Delegates to weapon attack or specialism rolls
  - Weapon attacks automatically roll damage on success using the tens digit from attack roll

### Sheet Classes
- **Hack100ActorSheet** ([sheets/actor-sheet.js](sheets/actor-sheet.js)): Renders and handles actor sheets
  - Dynamic template loading based on actor type: `actor-character.hbs` or `actor-npc.hbs`
  - `_prepareItems()`: Organizes items into categories (gear, weapons, armor, specialisms)
  - Event handlers for rolls, item CRUD, experience checks

- **Hack100ItemSheet** ([sheets/item-sheet.js](sheets/item-sheet.js)): Renders item sheets
  - Dynamic template per item type: `item/item-{type}-sheet.hbs`

### Main Module (scripts/hack100.js)
Entry point registered in system.json as an ES module:
- Registers document classes with Foundry's CONFIG
- Registers sheet classes for actors and items
- Defines Handlebars helpers (concat, toLowerCase, capitalize, eq, checked)
- Exports core dice rolling functions: `rollTask()` for d100 checks, `rollDamage()` for weapon damage

### Game Mechanics

**D100 Roll System**:
- Roll d100, compare to target percentage (typically 20-100%)
- 1-10: Critical Success
- 91-100: Critical Failure
- Success awards an experience check mark

**Damage System**:
- Damage = tens digit of attack roll + weapon damage modifier
- Example: Roll 67 on attack → 6 + weapon damage

**Experience System**:
- Successful ability/specialism rolls award experience checks
- Roll d100 vs current value: if roll > value, improve by d5
- Experience checks consumed after improvement roll attempt

**Derived Statistics**:
- Health Max = (Toughness Bonus + Willpower Bonus) × 2
- Movement = 8 - sum of equipped armor movement penalties
- Ability Bonus = floor(ability value / 10)

## File Organization

```
hack100/
├── scripts/
│   ├── hack100.js              # Entry point, dice rolling functions
│   └── modules/
│       ├── actor.js            # Hack100Actor document class
│       └── item.js             # Hack100Item document class
├── sheets/
│   ├── actor-sheet.js          # Hack100ActorSheet application
│   └── item-sheet.js           # Hack100ItemSheet application
├── templates/
│   ├── actor-character.hbs     # Character sheet template
│   ├── actor-npc.hbs           # NPC sheet template
│   ├── roll-dialog.hbs         # Modifier dialog
│   └── item/
│       ├── item-weapon-sheet.hbs
│       └── item-armor-sheet.hbs
├── styles/
│   └── hack100.css             # System styles
├── lang/
│   ├── en.json                 # English localization
│   └── fr.json                 # French localization
├── system.json                 # System manifest
└── template.json               # Data model schema
```

## Key Technical Notes

- **Foundry Version Compatibility**: Minimum v10, verified v11, maximum v13 (see system.json)
- **ES Modules**: Uses `import`/`export`, not CommonJS. Main module is `scripts/hack100.js`
- **Data Access**: Use `actor.system` or `item.system` to access document data (not `.data.data`)
- **Async Rolls**: Foundry VTT rolls are async, always `await roll.roll({ async: true })`
- **Localization**: All user-facing text should use `game.i18n.localize()` with keys from lang/ files
- **Chat Messages**: Create with `ChatMessage.create()`, use HTML for formatting
- **Dialogs**: Use Foundry's `Dialog` class for user input (see actor.js `rollAbility()` for example)

## Common Modifications

**Adding new ability**: Update template.json Actor.templates.base.abilities, add to lang files, no code changes needed

**Changing roll mechanics**: Modify `rollTask()` in scripts/hack100.js and update chat message HTML

**Adding new item type**: Add to template.json Item.types, create corresponding template in templates/item/, update ItemSheet.getData() if custom logic needed

**Modifying character sheet layout**: Edit templates/actor-character.hbs, update CSS in styles/hack100.css
