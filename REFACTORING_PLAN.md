# Love Status Extension - Refactoring Plan

## Current Status

The extension currently has:

- Global score system (not per-character)
- Hardcoded rewards in settings
- No creator mode
- No export/import functionality
- Images stored as file paths (not base64)

## Target Architecture

### 1. Data Structure Changes

```javascript
extension_settings["love-status"] = {
    // Global settings
    enabled: true,
    widgetPosition: { x: null, y: null },
    injectionPrompt: "...",
    creatorMode: false,
    
    // Per-Character data
    characters: {
        "character_id_123": {
            currentScore: 62,
            startScore: 50,
            maxScore: 100,
            minScore: 0,
            scoreHistory: [],
            unlockedRewards: ["reward_1"],
            rewardPackId: "pack_default"
        }
    },
    
    // Reward Packs (Creator creates these)
    rewardPacks: {
        "pack_default": {
            id: "pack_default",
            name: "Default Pack",
            rewards: [
                {
                    id: "reward_1",
                    threshold: 25,
                    title: "First Smile",
                    type: "image",
                    image_base64: "data:image/jpeg;base64,..."
                }
            ]
        }
    }
}
```

### 2. New Features

#### Creator Mode

- Toggle in settings panel
- Reward Pack Manager UI
- Add/Edit/Delete rewards
- Image upload with auto-resize (max 500KB, max 800x800px)
- Assign pack to current character

#### Export/Import

- Export reward pack as JSON file
- Import reward pack from JSON file
- Format: `{ format: "love-status-reward-pack", version: "1.0", pack: {...} }`

#### Image Handling

- Upload image → Canvas API resize → Base64 encode
- Max file size: 500KB
- Max dimensions: 800x800px
- Quality reduction if needed

### 3. Implementation Steps

1. ✅ Plan architecture
2. ⏳ Refactor index.js data structure
3. ⏳ Add Creator Mode UI to ui.html
4. ⏳ Implement image resize utility
5. ⏳ Add Export/Import functions
6. ⏳ Update CSS for Creator Mode
7. ⏳ Test everything

## Files to Modify

- `index.js` - Complete refactor for per-character + reward packs
- `ui.html` - Add Creator Mode section
- `style.css` - Add Creator Mode styles

## Breaking Changes

- Existing users will need to migrate their data
- Old reward structure will be converted to new pack format
- Score will be reset (or migrated per-character)
