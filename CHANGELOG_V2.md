# Love Status Extension - Version 2.0 Changes

## Summary of Changes

### 1. Thai Language UI (User-Facing)
All user-visible text changed to Thai:
- Bottom sheet: "สถานะความรัก" (Love Status)
- Rewards: "ของรางวัล" (Rewards)
- Notifications: "ปลดล็อค: {title}!" (Unlocked: {title}!)
- Score display: "{score} / {max}"
- Last change: "ล่าสุด: +3" (Last: +3)

### 2. Media Path Instead of Base64
- Images stored as files in `media/` folder
- Settings store path: `"pack_default/reward_1.png"`
- Display via: `${extensionFolderPath}/media/{path}`
- Upload saves to `media/{packId}/{filename}`
- No more base64 bloat in settings

### 3. Adjustable Max Score
- Per-character `maxScore` setting (default: 100)
- Creator can set any value: 100, 500, 1000, etc.
- UI input in Creator Mode settings

### 4. Threshold as Percentage
- Rewards use percentage: `thresholdPercent: 25` (means 25% of maxScore)
- Calculated dynamically: `actualThreshold = maxScore * (thresholdPercent / 100)`
- Example: If maxScore=500 and thresholdPercent=50, unlock at score 250
- Backwards compatible: old `threshold` values auto-converted to percent

## Data Structure Changes

```javascript
// Character data
{
    currentScore: 62,
    maxScore: 100,  // NEW: adjustable
    minScore: 0,
    startScore: 50,
    // ...
}

// Reward structure
{
    id: "r1",
    thresholdPercent: 25,  // NEW: percentage instead of fixed value
    title: "รอยยิ้มแรก",   // Thai
    type: "image",
    imagePath: "pack_default/reward_1.png",  // NEW: path instead of base64
    text: ""
}
```

## File Changes

1. **index.js** - Complete rewrite with:
   - Thai UI strings
   - Media path handling
   - Adjustable maxScore
   - Threshold percentage calculations
   - File upload to media folder

2. **ui.html** - Updated with:
   - Thai labels
   - Max Score input field
   - Threshold as % in reward editor

3. **style.css** - Minor updates if needed

## Migration Notes

Existing users will need data migration:
- Old `threshold` → `thresholdPercent` (divide by maxScore * 100)
- Old `image_base64` → `imagePath` (save to media folder)
- Add `maxScore: 100` to existing character data
