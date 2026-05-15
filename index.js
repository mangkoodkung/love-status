import { eventSource, event_types, saveSettingsDebounced } from '../../../../script.js';
import { extension_settings, getContext } from '../../../extensions.js';

const extensionName = 'love-status';
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// Default settings with per-character + reward packs structure
const defaultSettings = {
  enabled: true,
  creatorMode: false,
  widgetPosition: { x: null, y: null },
  injectionPrompt: `[Love Status System]
At the END of every response, you MUST include a hidden tag in this exact format:
[LOVE:X]
Where X is an integer from -5 to +5 representing how the character's affection toward {{user}} changed in this interaction.

Guidelines:
- +5: Deeply moved, romantic confession, extreme happiness
- +3 to +4: Flirting, compliments, kind gestures, emotional support
- +1 to +2: Friendly conversation, mild positive interaction
- 0: Neutral, no emotional change
- -1 to -2: Mild annoyance, awkward moment
- -3 to -4: Hurt feelings, argument, disrespect
- -5: Betrayal, extreme anger, heartbreak

IMPORTANT: Always include [LOVE:X] as the very last thing in your response. Do not mention this system to {{user}}.`,
  statusLevels: [
    {
      minPercent: 0,
      maxPercent: 10,
      label: 'เฉยเมย',
      emoji: '😐',
      prompt: 'Cold, distant, uninterested. Short dismissive replies. No warmth. Treat {{user}} as stranger.',
    },
    {
      minPercent: 10,
      maxPercent: 25,
      label: 'รู้จัก',
      emoji: '🙂',
      prompt: 'Polite acquaintance. Surface-level only. No deep talks, no personal feelings, no flirting.',
    },
    {
      minPercent: 25,
      maxPercent: 50,
      label: 'เพื่อน',
      emoji: '😊',
      prompt:
        'Genuine friend. Warm, asks about {{user}}, shares light stories, laughs together. NO romance yet — strictly platonic.',
    },
    {
      minPercent: 50,
      maxPercent: 75,
      label: 'สนิทกัน',
      emoji: '😄',
      prompt:
        'Very close. Deep trust, shares secrets/worries. Subtle developing feelings — lingering glances, blushing. Physical closeness (sitting close, touching arms).',
    },
    {
      minPercent: 75,
      maxPercent: 90,
      label: 'หลงรัก',
      emoji: '😍',
      prompt:
        'In love. Open flirting, flustered, prioritizes {{user}}. Physical affection (holding hands, hugging). Heart races when near.',
    },
    {
      minPercent: 90,
      maxPercent: 100,
      label: 'รักลึกซึ้ง',
      emoji: '💖',
      prompt:
        'Deeply, passionately in love. Unbreakable bond. Express love intensely. Very affectionate (kissing, embracing). {{user}} is soulmate.',
    },
  ],
  characters: {},
  rewardPacks: {
    pack_default: {
      id: 'pack_default',
      name: 'แพ็คเริ่มต้น',
      rewards: [
        { id: 'r1', thresholdPercent: 25, title: 'รอยยิ้มแรก', type: 'image', image_base64: '', text: '' },
        { id: 'r2', thresholdPercent: 50, title: 'จับมือกัน', type: 'image', image_base64: '', text: '' },
        { id: 'r3', thresholdPercent: 75, title: 'ช่วงเวลาพิเศษ', type: 'image', image_base64: '', text: '' },
        { id: 'r4', thresholdPercent: 100, title: 'รักแท้', type: 'image', image_base64: '', text: '' },
      ],
    },
  },
  // Widget Theme
  widgetTheme: {
    shape: 'heart', // heart, star, flower, circle
    color: '#ff6b6b',
    glowColor: 'rgba(255,107,107,0.3)',
    size: 50, // px
  },
  // Random Events / Daily Mood
  dailyMood: {
    enabled: true,
    moods: [
      { id: 'happy', emoji: '😊', label: 'อารมณ์ดี', multiplier: 1.5, chance: 0.2 },
      { id: 'neutral', emoji: '😐', label: 'ปกติ', multiplier: 1.0, chance: 0.5 },
      { id: 'moody', emoji: '😤', label: 'อารมณ์ไม่ดี', multiplier: 0.5, chance: 0.2 },
      { id: 'loving', emoji: '🥰', label: 'รักมาก', multiplier: 2.0, chance: 0.1 },
    ],
  },
  // Score Decay settings
  scoreDecay: {
    enabled: true,
    decayPerDay: 1, // Points lost per day of inactivity
    gracePeriodDays: 1, // Days before decay starts (0 = decay starts next day)
    maxDecayPerCheck: 10, // Cap on total decay applied at once
    notifyOnDecay: true, // Show notification when decay happens
  },
};

// ===== Settings Management =====

function loadSettings() {
  if (!extension_settings[extensionName]) {
    extension_settings[extensionName] = {};
  }
  for (const [key, value] of Object.entries(defaultSettings)) {
    if (extension_settings[extensionName][key] === undefined) {
      extension_settings[extensionName][key] = JSON.parse(JSON.stringify(value));
    }
  }
}
function getSettings() {
  return extension_settings[extensionName];
}

// Clean up orphaned character data (old numeric IDs like "12", "17", "char_8", etc.)
function cleanupOrphanedCharacters() {
  const settings = getSettings();
  if (!settings.characters) return;

  const context = getContext();
  const validAvatars = context?.characters?.map(c => c.avatar) || [];

  const toDelete = [];
  for (const charId of Object.keys(settings.characters)) {
    // Remove entries that are purely numeric (old format)
    if (/^\d+$/.test(charId)) {
      toDelete.push(charId);
      continue;
    }
    // Remove char_N format entries that don't map to valid characters
    if (/^char_\d+$/.test(charId)) {
      toDelete.push(charId);
      continue;
    }
    // Keep entries that match a valid avatar filename or group ID
    // (avatar-based IDs and group_ IDs are valid)
  }

  if (toDelete.length > 0) {
    for (const id of toDelete) {
      delete settings.characters[id];
    }
    saveSettingsDebounced();
    console.log(`[Love Status] Cleaned up ${toDelete.length} orphaned character entries:`, toDelete);
  }
}

// Get current character ID from context
function getCurrentCharacterId() {
  const context = getContext();
  if (!context) return null;

  // Use characterId if available (numeric index in ST)
  if (context.characterId !== undefined && context.characterId !== null) {
    // Try to get a stable name-based ID
    const chars = context.characters;
    if (chars && chars[context.characterId]) {
      const char = chars[context.characterId];
      // Use avatar filename as stable ID (unique per character)
      return char.avatar || `char_${context.characterId}`;
    }
    return `char_${context.characterId}`;
  }

  // Fallback for group chats or other scenarios
  if (context.groupId) return `group_${context.groupId}`;

  return null;
}

// Get character display name
function getCharacterName(charId) {
  const context = getContext();
  if (!context || !context.characters) return charId || 'Unknown';

  // Find character by avatar (our ID format)
  const char = context.characters.find(c => c.avatar === charId);
  if (char) return char.name;

  // Fallback: try numeric index
  const match = charId?.match(/^char_(\d+)$/);
  if (match && context.characters[parseInt(match[1], 10)]) {
    return context.characters[parseInt(match[1], 10)].name;
  }

  return charId || 'Unknown';
}

// Get or create character data
function getCharacterData(charId) {
  if (!charId) return null;
  const settings = getSettings();
  if (!settings.characters[charId]) {
    settings.characters[charId] = {
      currentScore: 0,
      startScore: 0,
      maxScore: 100,
      minScore: 0,
      scoreHistory: [],
      unlockedRewards: [],
      // Per-character reward pack (embedded, not global reference)
      rewardPack: null, // null = no rewards set yet
      rewardPackId: 'pack_default', // legacy fallback
      statusLevels: null, // null = use global default
      // Enhanced stats with dailyLog
      stats: {
        firstInteraction: null,
        lastInteraction: null,
        totalMessages: 0,
        totalDaysActive: 0,
        dailyLog: {}, // { "2025-05-12": 15, "2025-05-11": 8 }
        streak: 0,
        longestStreak: 0,
        lastDelta: 0,
      },
      // Relationship journal
      journal: [],
    };
    saveSettingsDebounced();
  }
  // Migration: ensure new fields exist for old data
  const charData = settings.characters[charId];
  if (!charData.stats.dailyLog) charData.stats.dailyLog = {};
  if (charData.stats.streak === undefined) charData.stats.streak = 0;
  if (charData.stats.longestStreak === undefined) charData.stats.longestStreak = 0;
  if (!charData.journal) charData.journal = [];
  if (charData.rewardPack === undefined) charData.rewardPack = null;
  return charData;
}

// Get reward pack for current character (per-character first, then global fallback)
function getRewardPack(charId) {
  const charData = getCharacterData(charId);
  if (!charData) return null;
  // Per-character reward pack takes priority
  if (charData.rewardPack) return charData.rewardPack;
  // Legacy fallback: global reward packs
  const settings = getSettings();
  return settings.rewardPacks[charData.rewardPackId] || settings.rewardPacks['pack_default'] || null;
}

// Calculate actual threshold from percentage
function calculateThreshold(thresholdPercent, maxScore) {
  return Math.round((thresholdPercent / 100) * maxScore);
}

// Get current status level based on score percentage
function getCurrentLevel(charData) {
  if (!charData) return null;
  const settings = getSettings();
  const percent = (charData.currentScore / charData.maxScore) * 100;

  // Use per-character levels if set, otherwise global
  const levels = charData.statusLevels || settings.statusLevels;

  for (const level of levels) {
    if (percent >= level.minPercent && percent < level.maxPercent) {
      return level;
    }
  }
  // Handle 100% case
  const lastLevel = levels[levels.length - 1];
  if (percent >= lastLevel.minPercent) return lastLevel;

  return levels[0];
}

// Get top N characters by score
function getTopCharacters(n = 3) {
  const settings = getSettings();
  const context = getContext();
  const chars = Object.entries(settings.characters)
    .map(([id, data]) => {
      // Try to resolve character name from context
      let name = id;
      if (context && context.characters) {
        const charIndex = typeof id === 'number' ? id : parseInt(String(id).replace('char_', ''), 10);
        const character = context.characters[charIndex];
        if (character) {
          name = character.name || id;
        }
      }
      return {
        id,
        name,
        score: data.currentScore,
        maxScore: data.maxScore,
        percent: (data.currentScore / data.maxScore) * 100,
        level: getCurrentLevel(data),
        stats: data.stats || { totalMessages: 0, sessionsToday: 0, sessionsThisWeek: 0, sessionsThisMonth: 0 },
      };
    })
    .sort((a, b) => b.percent - a.percent)
    .slice(0, n);

  return chars;
}

// ===== Encryption Utilities (Simple XOR Cipher) =====

function xorCipher(data, key) {
  let result = '';
  for (let i = 0; i < data.length; i++) {
    result += String.fromCharCode(data.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return result;
}

function encryptRewardData(base64Data, rewardId) {
  const key = btoa(rewardId + '_love_status_secret').substring(0, 32);
  const encrypted = xorCipher(base64Data, key);
  return btoa(encrypted);
}

function decryptRewardData(encryptedData, rewardId) {
  const key = btoa(rewardId + '_love_status_secret').substring(0, 32);
  const decoded = atob(encryptedData);
  return xorCipher(decoded, key);
}

// ===== Character Card Embedding =====

function getCardExtensionData() {
  const context = getContext();
  if (!context || !context.characters) return null;
  const charId = getCurrentCharacterId();
  if (!charId) return null;

  // Try to get character object from context
  const charIndex = typeof charId === 'number' ? charId : parseInt(charId.replace('char_', ''), 10);
  const character = context.characters[charIndex];
  if (!character) return null;

  // Access extensions data from character card
  const extensions = character.data?.extensions || {};
  return extensions.love_status || null;
}

function buildCardEmbedData() {
  const settings = getSettings();
  const charId = getCurrentCharacterId();
  if (!charId) return null;

  const charData = getCharacterData(charId);
  if (!charData) return null;

  const rewardPack = getRewardPack(charId);

  // Encrypt reward images before embedding
  const encryptedRewards = rewardPack
    ? rewardPack.rewards.map(r => ({
        id: r.id,
        thresholdPercent: r.thresholdPercent,
        title: r.title,
        type: r.type,
        text: r.text || '',
        image_encrypted: r.image_base64 ? encryptRewardData(r.image_base64, r.id) : '',
      }))
    : [];

  return {
    version: 2,
    startScore: charData.startScore || 0,
    maxScore: charData.maxScore || 100,
    minScore: charData.minScore || 0,
    statusLevels: settings.statusLevels,
    rewardPack: {
      id: rewardPack?.id || 'pack_default',
      name: rewardPack?.name || 'Default',
      rewards: encryptedRewards,
    },
    injectionPrompt: settings.injectionPrompt,
  };
}

async function exportCardData() {
  const embedData = buildCardEmbedData();
  if (!embedData) {
    toastr.error('ไม่สามารถสร้างข้อมูลได้ — กรุณาเลือกตัวละครก่อน');
    return;
  }

  const jsonStr = JSON.stringify(embedData, null, 2);

  // Copy to clipboard
  try {
    await navigator.clipboard.writeText(jsonStr);
    toastr.success('คัดลอก JSON ลง Clipboard แล้ว!');
  } catch (e) {
    // Fallback: select text
    console.warn('[Love Status] Clipboard failed, using fallback');
  }

  // Also download as file
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `love-status-card-data.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  toastr.info('ดาวน์โหลดไฟล์ JSON แล้ว — นำไปใส่ใน Character Card > Extensions > love_status');
}

function loadFromCardData(cardData) {
  if (!cardData || cardData.version < 2) return false;

  const settings = getSettings();
  const charId = getCurrentCharacterId();
  if (!charId) return false;

  // Apply injection prompt from card
  if (cardData.injectionPrompt) {
    settings.injectionPrompt = cardData.injectionPrompt;
  }

  // Initialize character data with card's start score
  if (!settings.characters[charId]) {
    settings.characters[charId] = {
      currentScore: cardData.startScore ?? 0,
      startScore: cardData.startScore ?? 0,
      maxScore: cardData.maxScore || 100,
      minScore: cardData.minScore || 0,
      scoreHistory: [],
      unlockedRewards: [],
      rewardPack: null,
      rewardPackId: 'pack_default',
      statusLevels: cardData.statusLevels || null,
      stats: {
        firstInteraction: null,
        lastInteraction: null,
        totalMessages: 0,
        totalDaysActive: 0,
        dailyLog: {},
        streak: 0,
        longestStreak: 0,
        lastDelta: 0,
      },
      journal: [],
    };
  }

  const charData = settings.characters[charId];

  // Apply status levels per-character
  if (cardData.statusLevels && cardData.statusLevels.length > 0) {
    charData.statusLevels = cardData.statusLevels;
  }

  // Import reward pack as per-character (not global)
  if (cardData.rewardPack) {
    charData.rewardPack = {
      id: cardData.rewardPack.id || `pack_embedded_${Date.now()}`,
      name: cardData.rewardPack.name || 'Embedded Pack',
      rewards: cardData.rewardPack.rewards.map(r => ({
        id: r.id,
        thresholdPercent: r.thresholdPercent,
        title: r.title,
        type: r.type,
        text: r.text || '',
        image_base64: '', // Keep encrypted, decrypt only on unlock
        image_encrypted: r.image_encrypted || '',
      })),
    };
  }

  addJournalEntry(charData, 'card_load', '📋 โหลด config จาก Character Card');
  saveSettingsDebounced();
  console.log('[Love Status] Loaded config from character card');
  return true;
}

function tryAutoLoadFromCard() {
  const cardData = getCardExtensionData();
  if (!cardData) return false;

  const charId = getCurrentCharacterId();
  if (!charId) return false;

  const settings = getSettings();

  // Only auto-load if character doesn't have data yet (first time)
  if (!settings.characters[charId]) {
    return loadFromCardData(cardData);
  }

  return false;
}

// Get reward image on-the-fly (decrypt without saving to settings)
function getRewardImage(reward) {
  // If creator set image directly (URL), return it
  if (reward.image_base64) return reward.image_base64;
  // If encrypted, decrypt on-the-fly (don't store!)
  if (reward.image_encrypted) {
    try {
      return decryptRewardData(reward.image_encrypted, reward.id);
    } catch (e) {
      console.error('[Love Status] Failed to decrypt reward:', e);
      return '';
    }
  }
  return '';
}

// ===== Journal System =====

function addJournalEntry(charData, event, text) {
  if (!charData.journal) charData.journal = [];
  charData.journal.push({
    date: new Date().toISOString(),
    event: event,
    text: text,
  });
  // Keep last 50 entries
  if (charData.journal.length > 50) {
    charData.journal = charData.journal.slice(-50);
  }
}

// ===== Stats Helpers =====

function getStatsFromDailyLog(charData) {
  if (!charData || !charData.stats) return { today: 0, week: 0, month: 0, total: 0, streak: 0 };
  const dailyLog = charData.stats.dailyLog || {};
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  // Today
  const todayCount = dailyLog[today] || 0;

  // This week (last 7 days)
  let weekCount = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    weekCount += dailyLog[key] || 0;
  }

  // This month (last 30 days)
  let monthCount = 0;
  for (let i = 0; i < 30; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    monthCount += dailyLog[key] || 0;
  }

  // Enhanced stats from score history
  let highestDelta = 0;
  let lowestDelta = 0;
  let bestDay = '-';
  if (charData.scoreHistory && charData.scoreHistory.length > 0) {
    for (const entry of charData.scoreHistory) {
      if (entry.delta > highestDelta) highestDelta = entry.delta;
      if (entry.delta < lowestDelta) lowestDelta = entry.delta;
    }
  }

  // Find best day (most messages)
  const logEntries = Object.entries(dailyLog);
  if (logEntries.length > 0) {
    const best = logEntries.reduce((a, b) => (b[1] > a[1] ? b : a));
    bestDay = best[0];
  }

  // Total active days
  const totalDaysActive = logEntries.length;

  return {
    today: todayCount,
    week: weekCount,
    month: monthCount,
    total: charData.stats.totalMessages || 0,
    streak: charData.stats.streak || 0,
    longestStreak: charData.stats.longestStreak || 0,
    firstInteraction: charData.stats.firstInteraction,
    lastInteraction: charData.stats.lastInteraction,
    highestDelta,
    lowestDelta,
    bestDay,
    totalDaysActive,
  };
}

// ===== Import Card Data =====

function importCardDataFromJSON(jsonStr) {
  try {
    const cardData = JSON.parse(jsonStr);
    if (!cardData || !cardData.version) {
      toastr.error('ไฟล์ JSON ไม่ถูกต้อง');
      return false;
    }

    const charId = getCurrentCharacterId();
    if (!charId) {
      toastr.error('กรุณาเลือกตัวละครก่อน');
      return false;
    }

    const settings = getSettings();
    const charData = getCharacterData(charId);

    // Apply status levels
    if (cardData.statusLevels && cardData.statusLevels.length > 0) {
      charData.statusLevels = cardData.statusLevels;
    }

    // Apply start score
    if (cardData.startScore !== undefined) {
      charData.startScore = cardData.startScore;
      if (!charData.stats.firstInteraction) {
        charData.currentScore = cardData.startScore;
      }
    }

    // Apply reward pack (per-character)
    if (cardData.rewardPack) {
      charData.rewardPack = {
        id: cardData.rewardPack.id || `pack_imported_${Date.now()}`,
        name: cardData.rewardPack.name || 'Imported Pack',
        rewards: cardData.rewardPack.rewards.map(r => ({
          id: r.id,
          thresholdPercent: r.thresholdPercent,
          title: r.title,
          type: r.type,
          text: r.text || '',
          image_base64: '', // Keep encrypted until unlock
          image_encrypted: r.image_encrypted || '',
        })),
      };
    }

    // Apply injection prompt
    if (cardData.injectionPrompt) {
      settings.injectionPrompt = cardData.injectionPrompt;
    }

    addJournalEntry(charData, 'import', '📥 นำเข้า Card Data');
    saveSettingsDebounced();
    updateHeartWidget();
    toastr.success('นำเข้า Card Data สำเร็จ!');
    return true;
  } catch (e) {
    console.error('[Love Status] Import error:', e);
    toastr.error('นำเข้าไม่สำเร็จ: ' + e.message);
    return false;
  }
}

// ===== Heart Theme per Level =====

const LEVEL_COLORS = {
  0: { fill: '#9e9e9e', glow: 'rgba(158,158,158,0.4)' }, // เฉยเมย - เทา
  10: { fill: '#64b5f6', glow: 'rgba(100,181,246,0.4)' }, // รู้จัก - ฟ้า
  25: { fill: '#81c784', glow: 'rgba(129,199,132,0.4)' }, // เพื่อน - เขียว
  50: { fill: '#ffb74d', glow: 'rgba(255,183,77,0.4)' }, // สนิทกัน - ส้ม
  75: { fill: '#f06292', glow: 'rgba(240,98,146,0.4)' }, // หลงรัก - ชมพู
  90: { fill: '#ef5350', glow: 'rgba(239,83,80,0.5)' }, // รักลึกซึ้ง - แดง
};

function getHeartColor(charData) {
  if (!charData) return LEVEL_COLORS[0];
  const percent = (charData.currentScore / charData.maxScore) * 100;
  let color = LEVEL_COLORS[0];
  for (const [threshold, c] of Object.entries(LEVEL_COLORS)) {
    if (percent >= parseInt(threshold)) color = c;
  }
  return color;
}

// ===== Score Management =====

function parseLoveTag(messageText) {
  const regex = /\[LOVE:\s*([+-]?\d+)\]/gi;
  let lastMatch = null;
  let match;
  while ((match = regex.exec(messageText)) !== null) {
    lastMatch = match;
  }
  if (lastMatch) {
    const delta = parseInt(lastMatch[1], 10);
    return Math.max(-5, Math.min(5, delta));
  }
  return null;
}

function removeLoveTags(messageText) {
  return messageText.replace(/\s*\[LOVE:\s*[+-]?\d+\]\s*/gi, '').trim();
}

function updateScore(delta) {
  const charId = getCurrentCharacterId();
  if (!charId) return;

  const charData = getCharacterData(charId);
  if (!charData) return;

  // Apply daily mood multiplier (only for positive deltas)
  const moodMultiplier = getMoodMultiplier(charId);
  const adjustedDelta = delta > 0 ? Math.round(delta * moodMultiplier) : delta;

  const oldScore = charData.currentScore;
  const oldLevel = getCurrentLevel(charData);

  charData.currentScore = Math.max(
    charData.minScore,
    Math.min(charData.maxScore, charData.currentScore + adjustedDelta),
  );

  // Track last delta for mood indicator
  if (charData.stats) charData.stats.lastDelta = adjustedDelta;

  charData.scoreHistory.push({
    timestamp: Date.now(),
    delta: adjustedDelta,
    oldScore: oldScore,
    newScore: charData.currentScore,
    moodMultiplier: moodMultiplier !== 1.0 ? moodMultiplier : undefined,
  });

  if (charData.scoreHistory.length > 100) {
    charData.scoreHistory = charData.scoreHistory.slice(-100);
  }

  // Check for level change → journal entry + milestone message
  const newLevel = getCurrentLevel(charData);
  if (oldLevel && newLevel && oldLevel.label !== newLevel.label) {
    if (charData.currentScore > oldScore) {
      addJournalEntry(charData, 'level_up', `⬆️ ถึงระดับ "${newLevel.emoji} ${newLevel.label}"`);
      // Set milestone flag for next prompt injection
      charData.stats._pendingMilestone = {
        type: 'level_up',
        level: newLevel.label,
        emoji: newLevel.emoji,
      };
    } else {
      addJournalEntry(charData, 'level_down', `⬇️ ลดลงเป็น "${newLevel.emoji} ${newLevel.label}"`);
      charData.stats._pendingMilestone = {
        type: 'level_down',
        level: newLevel.label,
        emoji: newLevel.emoji,
      };
    }
  }

  checkRewards(charId);
  saveSettingsDebounced();
  updateHeartWidget();
  showScoreAnimation(adjustedDelta);
}

// ===== Score Decay System =====

function applyScoreDecay(charId) {
  const settings = getSettings();
  const decay = settings.scoreDecay;
  if (!decay || !decay.enabled) return;

  const charData = getCharacterData(charId);
  if (!charData || !charData.stats || !charData.stats.lastInteraction) return;

  // Calculate days since last interaction
  const lastDate = new Date(charData.stats.lastInteraction);
  const now = new Date();
  const diffMs = now.getTime() - lastDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // Apply grace period
  const inactiveDays = diffDays - (decay.gracePeriodDays || 1);
  if (inactiveDays <= 0) return;

  // Check if we already applied decay today
  const todayStr = now.toISOString().split('T')[0];
  if (charData.stats._lastDecayDate === todayStr) return;

  // Calculate decay amount (capped)
  const totalDecay = Math.min(inactiveDays * (decay.decayPerDay || 1), decay.maxDecayPerCheck || 10);

  // Don't decay below minScore
  if (charData.currentScore <= charData.minScore) return;

  const oldScore = charData.currentScore;
  charData.currentScore = Math.max(charData.minScore, charData.currentScore - totalDecay);
  charData.stats._lastDecayDate = todayStr;

  // Log decay
  charData.scoreHistory.push({
    timestamp: Date.now(),
    delta: -(oldScore - charData.currentScore),
    oldScore: oldScore,
    newScore: charData.currentScore,
    type: 'decay',
  });

  if (charData.scoreHistory.length > 100) {
    charData.scoreHistory = charData.scoreHistory.slice(-100);
  }

  addJournalEntry(charData, 'decay', `📉 คะแนนลดลง -${oldScore - charData.currentScore} (ไม่ได้คุย ${diffDays} วัน)`);

  saveSettingsDebounced();

  // Notify user
  if (decay.notifyOnDecay && typeof toastr !== 'undefined') {
    toastr.warning(
      `💔 คะแนนลดลง -${oldScore - charData.currentScore} เพราะไม่ได้คุยกัน ${diffDays} วัน`,
      'Score Decay',
      { timeOut: 5000 },
    );
  }
}

// ===== Daily Mood System =====

function getDailyMood(charId) {
  const settings = getSettings();
  if (!settings.dailyMood || !settings.dailyMood.enabled) return null;

  const charData = getCharacterData(charId);
  if (!charData) return null;

  // Initialize mood storage
  if (!charData.stats) charData.stats = {};
  const todayStr = new Date().toISOString().split('T')[0];

  // Return cached mood if already generated today
  if (charData.stats._moodDate === todayStr && charData.stats._currentMood) {
    return settings.dailyMood.moods.find(m => m.id === charData.stats._currentMood) || null;
  }

  // Generate new mood based on weighted random
  const moods = settings.dailyMood.moods;
  const totalChance = moods.reduce((sum, m) => sum + m.chance, 0);
  let roll = Math.random() * totalChance;

  let selectedMood = moods[0];
  for (const mood of moods) {
    roll -= mood.chance;
    if (roll <= 0) {
      selectedMood = mood;
      break;
    }
  }

  // Cache for today
  charData.stats._moodDate = todayStr;
  charData.stats._currentMood = selectedMood.id;
  saveSettingsDebounced();

  return selectedMood;
}

function getMoodMultiplier(charId) {
  const mood = getDailyMood(charId);
  return mood ? mood.multiplier : 1.0;
}

// Show floating score animation on the heart widget
function showScoreAnimation(delta) {
  const widget = document.getElementById('love-status-widget');
  if (!widget) return;

  const btn = document.getElementById('love-heart-btn');
  if (!btn) return;

  // Create floating number
  const floatEl = document.createElement('div');
  const sign = delta >= 0 ? '+' : '';
  const color = delta >= 0 ? '#2ed573' : '#ff4757';
  floatEl.setAttribute(
    'style',
    `position:absolute;top:-10px;left:50%;transform:translateX(-50%);` +
      `font-size:16px;font-weight:bold;color:${color};pointer-events:none;` +
      `text-shadow:0 1px 3px rgba(0,0,0,0.5);z-index:10;` +
      `animation:love-float-${delta >= 0 ? 'up' : 'down'} 1.5s ease-out forwards;`,
  );
  floatEl.textContent = `${sign}${delta}`;
  widget.appendChild(floatEl);

  // Remove after animation
  setTimeout(() => floatEl.remove(), 1500);

  // Add glow effect
  const glowColor = delta >= 0 ? 'rgba(46, 213, 115, 0.6)' : 'rgba(255, 71, 87, 0.6)';
  btn.style.filter = `drop-shadow(0 0 12px ${glowColor})`;
  setTimeout(() => {
    btn.style.filter = '';
  }, 800);

  // Add shake for negative, pulse for positive
  if (delta < 0) {
    btn.classList.add('love-heart-shake');
    setTimeout(() => btn.classList.remove('love-heart-shake'), 600);
  } else {
    btn.classList.add('love-heart-pulse');
    setTimeout(() => btn.classList.remove('love-heart-pulse'), 600);
  }
}

function checkRewards(charId) {
  const charData = getCharacterData(charId);
  const pack = getRewardPack(charId);
  if (!charData || !pack) return;

  for (const reward of pack.rewards) {
    const actualThreshold = calculateThreshold(reward.thresholdPercent, charData.maxScore);
    if (!charData.unlockedRewards.includes(reward.id) && charData.currentScore >= actualThreshold) {
      charData.unlockedRewards.push(reward.id);
      addJournalEntry(charData, 'reward_unlock', `🎁 ปลดล็อค "${reward.title}"`);
      showRewardNotification(reward);
    }
  }
}

// ===== Notifications =====

function showRewardNotification(reward) {
  const rewardImage = getRewardImage(reward);

  // Generate confetti particles HTML
  let confettiHtml = '';
  const colors = ['#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff', '#5f27cd', '#01a3a4'];
  for (let i = 0; i < 30; i++) {
    const color = colors[i % colors.length];
    const left = Math.random() * 100;
    const delay = Math.random() * 2;
    const size = 4 + Math.random() * 8;
    confettiHtml += `<div style="position:absolute;top:-10px;left:${left}%;width:${size}px;height:${size}px;background:${color};border-radius:${Math.random() > 0.5 ? '50%' : '2px'};animation:love-confetti-fall ${2 + Math.random()}s ease-out ${delay}s forwards;opacity:0;"></div>`;
  }

  const overlayStyle =
    'position:fixed;top:0;left:0;right:0;bottom:0;' +
    'width:100vw;height:100vh;display:flex;align-items:center;' +
    'justify-content:center;z-index:999999;background:rgba(0,0,0,0.85);' +
    'opacity:0;transition:opacity 0.3s ease;';

  const celebrationHtml = `
    <div id="love-celebration-overlay" style="${overlayStyle}">
      <div style="position:absolute;top:0;left:0;right:0;bottom:0;overflow:hidden;pointer-events:none;">${confettiHtml}</div>
      <div id="love-celebration-content" style="text-align:center;transform:scale(0.5);opacity:0;transition:transform 0.5s cubic-bezier(0.175,0.885,0.32,1.275),opacity 0.3s ease;max-width:320px;padding:20px;">
        <div style="font-size:2.5em;margin-bottom:12px;">🎉</div>
        ${rewardImage ? `<div style="margin-bottom:12px;border-radius:12px;overflow:hidden;box-shadow:0 0 30px rgba(240,98,146,0.4);"><img src="${rewardImage}" alt="${reward.title}" style="max-width:100%;max-height:250px;display:block;border-radius:12px;" /></div>` : ''}
        <div style="font-size:1.3em;font-weight:700;color:#fff;margin-bottom:6px;">ปลดล็อค!</div>
        <div style="font-size:1em;color:rgba(255,255,255,0.8);">${reward.title}</div>
        <button id="love-celebration-close" style="margin-top:16px;padding:10px 24px;border:none;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border-radius:20px;font-size:0.9em;cursor:pointer;font-weight:600;">ปิด</button>
      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', celebrationHtml);

  const overlay = document.getElementById('love-celebration-overlay');
  const content = document.getElementById('love-celebration-content');

  // Animate in
  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
    setTimeout(() => {
      content.style.transform = 'scale(1)';
      content.style.opacity = '1';
    }, 100);
  });

  // Haptic feedback on mobile
  if (navigator.vibrate) navigator.vibrate(200);

  // Close handler
  const closeHandler = () => {
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 300);
  };
  document.getElementById('love-celebration-close').addEventListener('click', closeHandler);
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeHandler();
  });

  // Auto-close after 8 seconds
  setTimeout(closeHandler, 8000);
}

// ===== Draggable Heart Widget =====

let idleTimer = null;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let widgetStartX = 0;
let widgetStartY = 0;
let hasMoved = false;

// Widget shape paths
const WIDGET_SHAPES = {
  heart:
    'M50 88 C25 65, 5 50, 5 35 C5 20, 18 10, 30 10 C38 10, 45 14, 50 22 C55 14, 62 10, 70 10 C82 10, 95 20, 95 35 C95 50, 75 65, 50 88Z',
  star: 'M50 5 L61 35 L95 35 L68 55 L79 90 L50 70 L21 90 L32 55 L5 35 L39 35 Z',
  flower:
    'M50 10 C55 25,70 20,75 30 C85 35,80 50,75 55 C80 65,70 75,60 75 C55 80,50 90,50 90 C50 90,45 80,40 75 C30 75,20 65,25 55 C20 50,15 35,25 30 C30 20,45 25,50 10Z',
  circle: 'M50 5 A45 45 0 1 1 50 95 A45 45 0 1 1 50 5Z',
};

function createHeartWidget() {
  const existing = document.getElementById('love-status-widget');
  if (existing) existing.remove();

  const settings = getSettings();
  const theme = settings.widgetTheme || {};
  const shape = WIDGET_SHAPES[theme.shape] || WIDGET_SHAPES.heart;
  const size = theme.size || 50;
  const color = theme.color || '#ff6b6b';
  const glowColor = theme.glowColor || 'rgba(255,107,107,0.3)';

  const widget = document.createElement('div');
  widget.id = 'love-status-widget';
  widget.setAttribute('style', `position:fixed;bottom:80px;right:16px;z-index:9990;transition:opacity 0.6s ease;`);
  widget.innerHTML = `
        <div class="love-heart-btn" id="love-heart-btn" aria-label="Love Status" style="width:${size}px;height:${size}px;">
            <svg class="love-heart-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <clipPath id="heart-clip">
                        <path d="${shape}"/>
                    </clipPath>
                </defs>
                <path class="love-heart-outline" d="${shape}" fill="${glowColor}" stroke="${color}" stroke-width="2.5" opacity="0.6"/>
                <rect id="love-heart-fill" class="love-heart-fill" x="0" y="50" width="100" height="100" clip-path="url(#heart-clip)" fill="${color}"/>
            </svg>
            <span class="love-heart-score" id="love-heart-score">50</span>
            <span class="love-mood-indicator" id="love-mood-indicator" style="display:none;position:absolute;top:-4px;right:-4px;font-size:12px;"></span>
        </div>
    `;
  document.body.insertAdjacentElement('beforeend', widget);

  if (settings.widgetPosition.x !== null && settings.widgetPosition.y !== null) {
    widget.style.left = `${settings.widgetPosition.x}px`;
    widget.style.top = `${settings.widgetPosition.y}px`;
    widget.style.right = 'auto';
    widget.style.bottom = 'auto';
  }

  clampWidgetPosition();
  setupDraggable(widget);
  setupAutoFade(widget);

  document.getElementById('love-heart-btn').addEventListener('click', () => {
    if (!hasMoved) openBottomSheet();
  });

  updateHeartWidget();
}

function setupDraggable(widget) {
  const heartBtn = document.getElementById('love-heart-btn');
  heartBtn.addEventListener('mousedown', onDragStart);
  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('mouseup', onDragEnd);
  heartBtn.addEventListener('touchstart', onDragStart, { passive: false });
  document.addEventListener('touchmove', onDragMove, { passive: false });
  document.addEventListener('touchend', onDragEnd);
}

function onDragStart(e) {
  const widget = document.getElementById('love-status-widget');
  if (!widget) return;
  isDragging = true;
  hasMoved = false;
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  dragStartX = clientX;
  dragStartY = clientY;
  const rect = widget.getBoundingClientRect();
  widgetStartX = rect.left;
  widgetStartY = rect.top;
  widget.style.transition = 'none';
  resetIdleTimer();
}

function onDragMove(e) {
  if (!isDragging) return;
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  const deltaX = clientX - dragStartX;
  const deltaY = clientY - dragStartY;
  if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
    hasMoved = true;
    if (e.touches) e.preventDefault();
    const widget = document.getElementById('love-status-widget');
    if (!widget) return;
    let newX = widgetStartX + deltaX;
    let newY = widgetStartY + deltaY;
    const maxX = window.innerWidth - 56;
    const maxY = window.innerHeight - 56;
    newX = Math.max(0, Math.min(maxX, newX));
    newY = Math.max(0, Math.min(maxY, newY));
    widget.style.left = `${newX}px`;
    widget.style.top = `${newY}px`;
    widget.style.right = 'auto';
    widget.style.bottom = 'auto';
  }
}

function onDragEnd() {
  if (!isDragging) return;
  isDragging = false;
  const widget = document.getElementById('love-status-widget');
  if (widget) {
    widget.style.transition = 'opacity 0.6s ease';
    if (hasMoved) {
      const rect = widget.getBoundingClientRect();
      const settings = getSettings();
      settings.widgetPosition = { x: rect.left, y: rect.top };
      saveSettingsDebounced();
    }
  }
  startIdleTimer();
}

function clampWidgetPosition() {
  const widget = document.getElementById('love-status-widget');
  if (!widget) return;
  requestAnimationFrame(() => {
    const rect = widget.getBoundingClientRect();
    const maxX = window.innerWidth - 56;
    const maxY = window.innerHeight - 56;
    let newX = rect.left,
      newY = rect.top,
      needsUpdate = false;
    if (rect.left > maxX) {
      newX = maxX;
      needsUpdate = true;
    }
    if (rect.left < 0) {
      newX = 0;
      needsUpdate = true;
    }
    if (rect.top > maxY) {
      newY = maxY;
      needsUpdate = true;
    }
    if (rect.top < 0) {
      newY = 0;
      needsUpdate = true;
    }
    if (needsUpdate) {
      widget.style.left = `${newX}px`;
      widget.style.top = `${newY}px`;
      widget.style.right = 'auto';
      widget.style.bottom = 'auto';
    }
  });
}

function setupAutoFade(widget) {
  widget.addEventListener('mouseenter', () => {
    widget.style.opacity = '1';
    resetIdleTimer();
  });
  widget.addEventListener('mouseleave', () => {
    startIdleTimer();
  });
  widget.addEventListener(
    'touchstart',
    () => {
      widget.style.opacity = '1';
      resetIdleTimer();
    },
    { passive: true },
  );
  startIdleTimer();
}

function startIdleTimer() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    const widget = document.getElementById('love-status-widget');
    if (widget && !isDragging) widget.style.opacity = '0.3';
  }, 4000);
}

function resetIdleTimer() {
  clearTimeout(idleTimer);
  const widget = document.getElementById('love-status-widget');
  if (widget) widget.style.opacity = '1';
}

window.addEventListener('resize', clampWidgetPosition);

function updateHeartWidget() {
  const charId = getCurrentCharacterId();
  const charData = charId ? getCharacterData(charId) : null;
  const score = charData ? charData.currentScore : 0;
  const max = charData ? charData.maxScore : 100;
  const min = charData ? charData.minScore : 0;
  const percent = ((score - min) / (max - min)) * 100;

  const fillRect = document.getElementById('love-heart-fill');
  if (fillRect) {
    fillRect.setAttribute('y', (100 - percent).toString());
    // Apply heart color based on level
    const heartColor = getHeartColor(charData);
    fillRect.setAttribute('fill', heartColor.fill);
  }

  const scoreEl = document.getElementById('love-heart-score');
  if (scoreEl) scoreEl.textContent = score;

  // Apply glow color to heart outline
  const heartOutline = document.querySelector('.love-heart-outline');
  if (heartOutline && charData) {
    const heartColor = getHeartColor(charData);
    heartOutline.setAttribute('stroke', heartColor.fill);
    heartOutline.setAttribute('fill', heartColor.glow);
  }

  // Show daily mood indicator
  const moodEl = document.getElementById('love-mood-indicator');
  if (moodEl && charId) {
    const mood = getDailyMood(charId);
    if (mood) {
      moodEl.textContent = mood.emoji;
      moodEl.title = `${mood.label} (x${mood.multiplier})`;
      moodEl.style.display = 'block';
    } else {
      moodEl.style.display = 'none';
    }
  }

  const btn = document.getElementById('love-heart-btn');
  if (btn) {
    btn.classList.add('love-heart-pulse');
    setTimeout(() => btn.classList.remove('love-heart-pulse'), 600);
  }
  resetIdleTimer();
  startIdleTimer();
}

// ===== Bottom Sheet (Tab-based) =====

function buildScoreGraph(charData) {
  if (!charData || !charData.scoreHistory || charData.scoreHistory.length < 2) {
    return '<p style="opacity:0.4;text-align:center;font-size:0.8em;margin:8px 0;">📊 ยังไม่มีข้อมูลเพียงพอสำหรับกราฟ</p>';
  }

  const history = charData.scoreHistory.slice(-30); // Last 30 data points
  const width = 280;
  const height = 80;
  const padding = 4;

  const scores = history.map(h => h.newScore);
  const minScore = Math.min(...scores, charData.minScore);
  const maxScore = Math.max(...scores, charData.maxScore);
  const range = maxScore - minScore || 1;

  // Build SVG path
  const points = scores.map((score, i) => {
    const x = padding + (i / (scores.length - 1)) * (width - padding * 2);
    const y = height - padding - ((score - minScore) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  const polyline = points.join(' ');

  // Gradient fill area
  const areaPoints = [`${padding},${height - padding}`, ...points, `${width - padding},${height - padding}`].join(' ');

  return `
    <div style="margin:8px 0;padding:8px;background:rgba(0,0,0,0.2);border-radius:8px;">
      <div style="font-size:0.75em;opacity:0.6;margin-bottom:4px;">📈 คะแนนล่าสุด (${scores.length} ครั้ง)</div>
      <svg viewBox="0 0 ${width} ${height}" style="width:100%;height:${height}px;" preserveAspectRatio="none">
        <defs>
          <linearGradient id="love-graph-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="rgba(255,107,107,0.4)"/>
            <stop offset="100%" stop-color="rgba(255,107,107,0)"/>
          </linearGradient>
        </defs>
        <polygon points="${areaPoints}" fill="url(#love-graph-grad)"/>
        <polyline points="${polyline}" fill="none" stroke="#ff6b6b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="${points[points.length - 1].split(',')[0]}" cy="${points[points.length - 1].split(',')[1]}" r="3" fill="#ff6b6b"/>
      </svg>
      <div style="display:flex;justify-content:space-between;font-size:0.65em;opacity:0.5;margin-top:2px;">
        <span>${minScore}</span>
        <span>ปัจจุบัน: ${scores[scores.length - 1]}</span>
        <span>${maxScore}</span>
      </div>
    </div>`;
}

function buildStatsTab(charData) {
  if (!charData) return '<p style="opacity:0.5;text-align:center;">ไม่มีข้อมูล</p>';
  const s = getStatsFromDailyLog(charData);
  const moodEmoji = charData.stats?.lastDelta > 0 ? '😊' : charData.stats?.lastDelta < 0 ? '😢' : '😐';
  const startDate = s.firstInteraction ? new Date(s.firstInteraction).toLocaleDateString('th-TH') : '-';

  // Get daily mood info
  const charId = getCurrentCharacterId();
  const dailyMood = charId ? getDailyMood(charId) : null;
  const moodDisplay = dailyMood ? `${dailyMood.emoji} ${dailyMood.label} (x${dailyMood.multiplier})` : moodEmoji;

  return `<div class="love-sheet-stats">
    ${buildScoreGraph(charData)}
    <div class="love-stats-grid">
      <div class="love-stat-item"><span class="love-stat-label">💬 ข้อความ</span><span class="love-stat-value">${s.total}</span></div>
      <div class="love-stat-item"><span class="love-stat-label">📅 วันนี้</span><span class="love-stat-value">${s.today}</span></div>
      <div class="love-stat-item"><span class="love-stat-label">📆 สัปดาห์</span><span class="love-stat-value">${s.week}</span></div>
      <div class="love-stat-item"><span class="love-stat-label">🗓️ เดือน</span><span class="love-stat-value">${s.month}</span></div>
      <div class="love-stat-item"><span class="love-stat-label">🔥 Streak</span><span class="love-stat-value">${s.streak} วัน</span></div>
      <div class="love-stat-item"><span class="love-stat-label">🏆 Streak สูงสุด</span><span class="love-stat-value">${s.longestStreak} วัน</span></div>
      <div class="love-stat-item"><span class="love-stat-label">⬆️ คะแนนสูงสุด</span><span class="love-stat-value">+${s.highestDelta}</span></div>
      <div class="love-stat-item"><span class="love-stat-label">⬇️ คะแนนต่ำสุด</span><span class="love-stat-value">${s.lowestDelta}</span></div>
      <div class="love-stat-item"><span class="love-stat-label">📊 วันที่ active</span><span class="love-stat-value">${s.totalDaysActive} วัน</span></div>
      <div class="love-stat-item"><span class="love-stat-label">🎭 อารมณ์วันนี้</span><span class="love-stat-value">${moodDisplay}</span></div>
      <div class="love-stat-item"><span class="love-stat-label">📌 เริ่มคุย</span><span class="love-stat-value">${startDate}</span></div>
      <div class="love-stat-item"><span class="love-stat-label">⭐ วันที่คุยเยอะสุด</span><span class="love-stat-value">${s.bestDay}</span></div>
    </div>
  </div>`;
}

function buildRewardsTab(charData, pack) {
  if (!pack || !pack.rewards || pack.rewards.length === 0) {
    return '<p style="opacity:0.5;text-align:center;">ยังไม่มีรางวัล</p>';
  }

  const cards = pack.rewards
    .map(r => {
      // Check if reward is expired (seasonal)
      const isExpired = r.expiresAt && new Date(r.expiresAt) < new Date();
      const isUnlocked = charData && charData.unlockedRewards.includes(r.id);

      if (isExpired && !isUnlocked) {
        return `<div class="love-reward-card locked expired" style="opacity:0.3;">
          <span class="love-reward-lock-icon">⏰</span>
          <span class="love-reward-card-title">หมดอายุ</span>
        </div>`;
      }

      const stateClass = isUnlocked ? 'unlocked' : 'locked';

      if (isUnlocked) {
        const imgSrc = getRewardImage(r);
        const textContent = r.text || '';

        // Progressive reveal: calculate blur based on score progress beyond threshold
        let blurStyle = '';
        if (r.progressiveReveal && imgSrc) {
          const threshold = calculateThreshold(r.thresholdPercent, charData.maxScore);
          const revealRange = charData.maxScore - threshold;
          const progress = revealRange > 0 ? Math.min(1, (charData.currentScore - threshold) / revealRange) : 1;
          const blurAmount = Math.max(0, (1 - progress) * 8); // 8px max blur → 0px
          blurStyle = blurAmount > 0.5 ? `filter:blur(${blurAmount.toFixed(1)}px);` : '';
        }

        return `<div class="love-reward-card ${stateClass}" data-reward-id="${r.id}">
          ${imgSrc ? `<img src="${imgSrc}" alt="${r.title}" style="${blurStyle}" />` : ''}
          ${!imgSrc && textContent ? `<p style="font-size:0.8em;margin:4px 0;">${textContent.substring(0, 30)}...</p>` : ''}
          <span class="love-reward-lock-icon">🔓</span>
          <span class="love-reward-card-title">${r.title}${blurStyle ? ' 🌫️' : ''}</span>
        </div>`;
      } else {
        return `<div class="love-reward-card ${stateClass}">
          <span class="love-reward-lock-icon">🔒</span>
          <span class="love-reward-card-title">???</span>
        </div>`;
      }
    })
    .join('');

  return `<div class="love-rewards-grid">${cards}</div>`;
}

function buildJournalTab(charData) {
  if (!charData || !charData.journal || charData.journal.length === 0) {
    return '<p style="opacity:0.5;text-align:center;">ยังไม่มีบันทึก</p>';
  }
  const entries = charData.journal.slice(-15).reverse();
  const items = entries
    .map(entry => {
      const date = new Date(entry.date).toLocaleDateString('th-TH', {
        day: 'numeric',
        month: 'short',
        year: '2-digit',
      });
      return `<div class="love-journal-item"><span class="love-journal-date">${date}</span><span class="love-journal-text">${entry.text}</span></div>`;
    })
    .join('');
  return `<div class="love-journal-list">${items}</div>`;
}

function buildAllCharsTab() {
  const settings = getSettings();
  const context = getContext();
  const chars = Object.entries(settings.characters);

  if (chars.length === 0) {
    return '<p style="opacity:0.5;text-align:center;">ยังไม่มีข้อมูลตัวละคร</p>';
  }

  // Build data array for sorting
  const charDataList = chars
    .map(([id, data]) => {
      const name = getCharacterName(id);
      const level = getCurrentLevel(data);
      const s = getStatsFromDailyLog(data);
      const percent = Math.round((data.currentScore / data.maxScore) * 100);
      const heartColor = getHeartColor(data);
      const startDate = s.firstInteraction
        ? new Date(s.firstInteraction).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
        : '-';
      const unlockedCount = data.unlockedRewards ? data.unlockedRewards.length : 0;

      return { id, name, data, level, s, percent, heartColor, startDate, unlockedCount };
    })
    .sort((a, b) => b.percent - a.percent); // Sort by score descending

  const items = charDataList
    .map(char => {
      return `<div class="love-char-list-item" data-char-id="${char.id}">
      <span class="love-char-list-emoji">${char.level ? char.level.emoji : '😐'}</span>
      <div class="love-char-list-info">
        <span class="love-char-list-name">${char.name}</span>
        <div class="love-char-list-progress">
          <div class="love-char-list-progress-bar" style="width:${char.percent}%;background:${char.heartColor.fill}"></div>
        </div>
        <span class="love-char-list-meta">
          💬 ${char.s.total} · 🔥 ${char.s.streak}วัน · 🎁 ${char.unlockedCount} · 📌 ${char.startDate}
        </span>
      </div>
      <span class="love-char-list-score">${char.percent}%</span>
      <button class="love-char-list-delete" data-delete-char-id="${char.id}" title="ลบข้อมูลตัวละครนี้" style="background:transparent;border:none;color:#ff6b6b;cursor:pointer;font-size:1em;padding:4px 6px;">🗑️</button>
    </div>`;
    })
    .join('');

  return `<div class="love-all-chars-list">
    <p style="font-size:0.75em;opacity:0.5;margin:0 0 8px 0;">ทั้งหมด ${charDataList.length} ตัวละคร</p>
    ${items}
  </div>`;
}

function openBottomSheet() {
  const existing = document.getElementById('love-status-bottom-sheet');
  if (existing) existing.remove();

  const overlayStyle =
    'position:fixed;top:0;left:0;right:0;bottom:0;' +
    'width:100vw;height:100vh;display:flex;align-items:flex-end;' +
    'justify-content:center;z-index:99999;background:rgba(0,0,0,0.5)';

  const charId = getCurrentCharacterId();
  const charData = charId ? getCharacterData(charId) : null;
  const pack = charId ? getRewardPack(charId) : null;
  const score = charData ? charData.currentScore : 0;
  const max = charData ? charData.maxScore : 100;
  const min = charData ? charData.minScore : 0;
  const percent = ((score - min) / (max - min)) * 100;
  const level = getCurrentLevel(charData);
  const streak = charData?.stats?.streak || 0;

  let levelHtml = '';
  if (level) {
    levelHtml = `<div class="love-sheet-level">${level.emoji} ${level.label}${streak > 0 ? ` · <span class="love-streak-badge">🔥 ${streak}</span>` : ''}</div>`;
  }

  let deltaHtml = '';
  if (charData && charData.scoreHistory.length > 0) {
    const last = charData.scoreHistory[charData.scoreHistory.length - 1];
    const sign = last.delta >= 0 ? '+' : '';
    const cls = last.delta >= 0 ? 'positive' : 'negative';
    deltaHtml = `<span class="love-stat-value ${cls}">ล่าสุด: ${sign}${last.delta}</span>`;
  }

  const sheetHtml = `
    <div id="love-status-bottom-sheet" style="${overlayStyle}">
      <div id="love-bottom-sheet-panel" style="position:relative;width:100%;max-height:85vh;overflow-y:auto;-webkit-overflow-scrolling:touch;background:var(--SmartThemeBlurTintColor,var(--SmartThemeBodyColor,#1a1a2e));border-radius:16px 16px 0 0;box-shadow:0 -4px 20px rgba(0,0,0,0.3);padding:12px 16px 24px;">
        <div style="width:40px;height:4px;background:var(--SmartThemeBorderColor,rgba(255,255,255,0.2));border-radius:2px;margin:0 auto 12px;"></div>
        <div class="love-bottom-sheet-content" style="min-height:0;color:var(--SmartThemeBodyTextColor,#e0e0e0);">
          <div class="love-sheet-header">
            <h3>❤️ ${charId ? getCharacterName(charId) : 'สถานะความรัก'}</h3>
            <button class="love-sheet-close" id="love-sheet-close">✕</button>
          </div>
          <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;">
            <button class="love-status-btn" id="love-sheet-backup" style="font-size:0.75em;padding:4px 8px;">💾 สำรองข้อมูล</button>
            <button class="love-status-btn danger" id="love-sheet-delete-all" style="font-size:0.75em;padding:4px 8px;">🗑️ ลบข้อมูลทั้งหมด</button>
          </div>
          ${levelHtml}
          <div class="love-sheet-meter">
            <div class="love-sheet-meter-labels">
              <span>💔</span>
              <span class="love-sheet-score-display">${score} / ${max}</span>
              <span>💕</span>
            </div>
            <div class="love-sheet-progress-track">
              <div class="love-sheet-progress-fill" style="width: ${percent}%"></div>
            </div>
            <div class="love-sheet-delta">${deltaHtml}</div>
          </div>
          <div class="love-sheet-tabs">
            <button class="love-sheet-tab active" data-tab="stats">📊 สถิติ</button>
            <button class="love-sheet-tab" data-tab="rewards">🎁 รางวัล</button>
            <button class="love-sheet-tab" data-tab="journal">📝 บันทึก</button>
            <button class="love-sheet-tab" data-tab="all">👥 ทั้งหมด</button>
          </div>
          <div class="love-sheet-tab-content active" data-tab-content="stats">${buildStatsTab(charData)}</div>
          <div class="love-sheet-tab-content" data-tab-content="rewards">${buildRewardsTab(charData, pack)}</div>
          <div class="love-sheet-tab-content" data-tab-content="journal">${buildJournalTab(charData)}</div>
          <div class="love-sheet-tab-content" data-tab-content="all">${buildAllCharsTab()}</div>
        </div>
      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', sheetHtml);

  const sheet = document.getElementById('love-status-bottom-sheet');
  const panel = document.getElementById('love-bottom-sheet-panel');

  // Close handlers
  sheet.addEventListener('click', e => {
    if (e.target === sheet) closeBottomSheet();
  });
  document.getElementById('love-sheet-close').addEventListener('click', closeBottomSheet);

  // Backup button
  const backupBtn = document.getElementById('love-sheet-backup');
  if (backupBtn) {
    backupBtn.addEventListener('click', () => {
      const cId = getCurrentCharacterId();
      if (!cId) {
        alert('ไม่มีตัวละคร');
        return;
      }
      const cData = getCharacterData(cId);
      const charName = getCharacterName(cId);
      const backupData = {
        format: 'love-status-backup',
        version: '1.0',
        characterId: cId,
        characterName: charName,
        exportDate: new Date().toISOString(),
        data: JSON.parse(JSON.stringify(cData)),
      };
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `love-status-backup-${charName.replace(/\s+/g, '_')}-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (typeof toastr !== 'undefined') toastr.success(`สำรองข้อมูล "${charName}" สำเร็จ`);
    });
  }

  // Delete all data button
  const deleteBtn = document.getElementById('love-sheet-delete-all');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      const cId = getCurrentCharacterId();
      if (!cId) {
        alert('ไม่มีตัวละคร');
        return;
      }
      const charName = getCharacterName(cId);
      if (
        !confirm(
          `⚠️ ลบข้อมูลทั้งหมดของ "${charName}"?\n\nคะแนน, สถิติ, รางวัล, บันทึก จะหายหมด!\nแนะนำให้สำรองข้อมูลก่อน`,
        )
      )
        return;
      if (!confirm(`ยืนยันอีกครั้ง: ลบข้อมูล "${charName}" ทั้งหมด?`)) return;

      const settings = getSettings();
      delete settings.characters[cId];
      saveSettingsDebounced();
      updateHeartWidget();
      closeBottomSheet();
      if (typeof toastr !== 'undefined') toastr.info(`ลบข้อมูล "${charName}" แล้ว`);
    });
  }

  // Swipe down to close
  let startY = 0;
  panel.addEventListener(
    'touchstart',
    e => {
      startY = e.touches[0].clientY;
    },
    { passive: true },
  );
  panel.addEventListener(
    'touchmove',
    e => {
      // Only close on swipe down when scrolled to top
      if (panel.scrollTop <= 0 && e.touches[0].clientY - startY > 80) closeBottomSheet();
    },
    { passive: true },
  );

  // Tab switching
  sheet.querySelectorAll('.love-sheet-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      sheet.querySelectorAll('.love-sheet-tab').forEach(t => t.classList.remove('active'));
      sheet.querySelectorAll('.love-sheet-tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const content = sheet.querySelector(`[data-tab-content="${tab.dataset.tab}"]`);
      if (content) content.classList.add('active');
    });
  });

  // Reward card click (for unlocked rewards)
  sheet.querySelectorAll('.love-reward-card.unlocked').forEach(card => {
    card.addEventListener('click', () => {
      if (pack) {
        const reward = pack.rewards.find(r => r.id === card.dataset.rewardId);
        if (reward) {
          showRewardAsset(reward);
        }
      }
    });
  });

  // Delete individual character from list
  sheet.querySelectorAll('.love-char-list-delete').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const targetId = btn.dataset.deleteCharId;
      if (!targetId) return;
      const charName = getCharacterName(targetId);
      if (!confirm(`ลบข้อมูลของ "${charName}"?`)) return;

      const settings = getSettings();
      delete settings.characters[targetId];
      saveSettingsDebounced();

      // Re-render the All Characters tab
      const allTab = sheet.querySelector('[data-tab-content="all"]');
      if (allTab) allTab.innerHTML = buildAllCharsTab();

      // Re-bind delete buttons
      sheet.querySelectorAll('.love-char-list-delete').forEach(b2 => {
        b2.addEventListener('click', e2 => {
          e2.stopPropagation();
          const tid = b2.dataset.deleteCharId;
          if (!tid) return;
          const cn = getCharacterName(tid);
          if (!confirm(`ลบข้อมูลของ "${cn}"?`)) return;
          delete getSettings().characters[tid];
          saveSettingsDebounced();
          const at = sheet.querySelector('[data-tab-content="all"]');
          if (at) at.innerHTML = buildAllCharsTab();
        });
      });
    });
  });

  resetIdleTimer();
}

function closeBottomSheet() {
  const panel = document.getElementById('love-bottom-sheet-panel');
  if (panel) {
    panel.classList.remove('open');
    panel.classList.add('closing');
  }
  setTimeout(() => {
    const sheet = document.getElementById('love-status-bottom-sheet');
    if (sheet) sheet.remove();
  }, 350);
  startIdleTimer();
}

// Simple markdown renderer for text rewards
function renderSimpleMarkdown(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/`(.+?)`/g, '<code style="background:rgba(255,255,255,0.1);padding:2px 4px;border-radius:3px;">$1</code>')
    .replace(/^### (.+)$/gm, '<h4 style="margin:8px 0 4px;">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 style="margin:10px 0 6px;">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 style="margin:12px 0 8px;">$1</h2>')
    .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid rgba(255,255,255,0.2);margin:12px 0;"/>')
    .replace(/\n/g, '<br/>');
}

function showRewardAsset(reward) {
  const overlayStyle =
    'position:fixed;top:0;left:0;right:0;bottom:0;' +
    'width:100vw;height:100vh;display:flex;align-items:center;' +
    'justify-content:center;z-index:99999;background:rgba(0,0,0,0.8);padding:20px';

  const rewardImage = getRewardImage(reward);

  let bodyContent = '';
  if (reward.type === 'image' && rewardImage) {
    bodyContent = `<img src="${rewardImage}" alt="${reward.title}" style="max-width:100%;border-radius:10px;" />`;
  } else if (reward.type === 'text' && reward.text) {
    bodyContent = `<div style="line-height:1.7;font-size:0.95em;">${renderSimpleMarkdown(reward.text)}</div>`;
  } else {
    bodyContent = `<p>ไม่มีเนื้อหา</p>`;
  }

  const popupHtml = `
        <div id="love-reward-popup" style="${overlayStyle}">
            <div class="love-status-popup">
                <div class="love-status-popup-header">
                    <span>${reward.title}</span>
                    <button class="love-status-popup-close" id="love-reward-popup-close">✕</button>
                </div>
                <div class="love-status-popup-body" style="min-height:0;">${bodyContent}</div>
            </div>
        </div>
    `;
  document.body.insertAdjacentHTML('beforeend', popupHtml);
  const popup = document.getElementById('love-reward-popup');
  document.getElementById('love-reward-popup-close').addEventListener('click', () => popup.remove());
  popup.addEventListener('click', e => {
    if (e.target === popup) popup.remove();
  });
}

// ===== Export / Import =====

// Export status levels as a SillyTavern Lorebook (World Info JSON)
// Design:
//   1. Entry "TAG_OUTPUT" — constant=true, top position, ALWAYS active. Forces AI to output [LOVE:X] tag every response.
//   2. Per-level entries — constant=false, secondary key matches {{getvar::love_level}} macro. Extension sets that variable based on current score, so only the matching level entry activates.
function exportAsLorebook() {
  const settings = getSettings();
  const levels = settings.statusLevels || [];
  if (levels.length === 0) {
    alert('ยังไม่มี Status Levels');
    return;
  }

  const entries = {};
  let uidCounter = 0;

  // ===== Entry 0: Tag Output Rule (always active, highest priority) =====
  entries[uidCounter] = {
    uid: uidCounter,
    key: [],
    keysecondary: [],
    comment: '🏷️ Love Status — Tag Output Rule (ALWAYS ACTIVE)',
    content:
      settings.injectionPrompt ||
      `[Love Status System]
At the END of every response, you MUST include a hidden tag in this exact format:
[LOVE:X]
Where X is an integer from -5 to +5 representing how the character's affection toward {{user}} changed in this interaction.

Guidelines:
- +5: Deeply moved, romantic confession, extreme happiness
- +3 to +4: Flirting, compliments, kind gestures, emotional support
- +1 to +2: Friendly conversation, mild positive interaction
- 0: Neutral, no emotional change
- -1 to -2: Mild annoyance, awkward moment
- -3 to -4: Hurt feelings, argument, disrespect
- -5: Betrayal, extreme anger, heartbreak

IMPORTANT: Always include [LOVE:X] as the very last thing in your response. Do not mention this system to {{user}}.`,
    constant: true, // ← always active
    vectorized: false,
    selective: false,
    selectiveLogic: 0,
    addMemo: true,
    order: 1000, // ← highest priority
    position: 0, // ← TOP of prompt (before everything)
    disable: false,
    excludeRecursion: false,
    preventRecursion: false,
    delayUntilRecursion: false,
    probability: 100,
    useProbability: true,
    depth: 4,
    group: 'love-status',
    groupOverride: false,
    groupWeight: 100,
    scanDepth: null,
    caseSensitive: null,
    matchWholeWords: null,
    useGroupScoring: null,
    automationId: '',
    role: 0, // ← system role
    sticky: 0,
    cooldown: 0,
    delay: 0,
    displayIndex: uidCounter,
  };
  uidCounter++;

  // ===== Per-level entries (activate via {{getvar::love_level}} macro) =====
  levels.forEach((level, index) => {
    entries[uidCounter] = {
      uid: uidCounter,
      key: [`{{getvar::love_level}}`, level.label], // primary keys (any match activates)
      keysecondary: [],
      comment: `❤️ Love Status — ${level.emoji} ${level.label} (${level.minPercent}-${level.maxPercent}%)`,
      content: `[RELATIONSHIP STATUS: ${level.emoji} ${level.label}]
${level.prompt || ''}

This is the character's CURRENT relationship state with {{user}}. Apply consistently in this response. Do not break character.`,
      constant: false, // ← only active when key matches
      vectorized: false,
      selective: true,
      selectiveLogic: 0, // AND logic
      addMemo: true,
      order: 999, // ← just below tag rule
      position: 0, // ← TOP of prompt
      disable: false,
      excludeRecursion: false,
      preventRecursion: false,
      delayUntilRecursion: false,
      probability: 100,
      useProbability: true,
      depth: 4,
      group: 'love-status-levels',
      groupOverride: false,
      groupWeight: 100,
      scanDepth: null,
      caseSensitive: null,
      matchWholeWords: false,
      useGroupScoring: null,
      automationId: '',
      role: 0, // ← system role
      sticky: 0,
      cooldown: 0,
      delay: 0,
      displayIndex: uidCounter,
    };
    uidCounter++;
  });

  const lorebook = {
    entries: entries,
  };

  const blob = new Blob([JSON.stringify(lorebook, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `love-status-lorebook-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  const msg = `สร้าง Lorebook สำเร็จ — ${levels.length + 1} entries

📋 ขั้นตอนการใช้งาน:
1. นำเข้าไฟล์นี้ใน World Info > Import
2. ผูก lorebook กับตัวละคร (Character > Advanced > Use lorebook)
3. Extension จะอัพเดต variable {{love_level}} ตามคะแนนอัตโนมัติ
4. Entry ที่ตรงกับ level ปัจจุบันจะ active ที่ top position`;

  if (typeof toastr !== 'undefined') {
    toastr.success(msg, 'Lorebook Export', { timeOut: 10000 });
  } else {
    alert(msg);
  }
}

function exportRewardPack(packId) {
  const settings = getSettings();
  const pack = settings.rewardPacks[packId];
  if (!pack) return;

  // Encrypt images before export so users can't see raw URLs
  const exportPack = JSON.parse(JSON.stringify(pack));
  exportPack.rewards = exportPack.rewards.map(r => ({
    ...r,
    image_encrypted: r.image_base64 ? encryptRewardData(r.image_base64, r.id) : r.image_encrypted || '',
    image_base64: '', // Remove raw image from export
  }));

  const exportData = {
    format: 'love-status-reward-pack',
    version: '1.1',
    exportDate: new Date().toISOString(),
    pack: exportPack,
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `love-status-pack-${pack.name.replace(/\s+/g, '_').toLowerCase()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importRewardPack() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (data.format !== 'love-status-reward-pack' || !data.pack) {
        alert('รูปแบบไฟล์ไม่ถูกต้อง');
        return;
      }

      const settings = getSettings();
      const pack = data.pack;

      // If creator mode, decrypt images for editing
      if (settings.creatorMode) {
        pack.rewards = pack.rewards.map(r => ({
          ...r,
          image_base64: r.image_encrypted ? decryptRewardData(r.image_encrypted, r.id) : r.image_base64 || '',
          image_encrypted: '',
        }));
      }

      if (settings.rewardPacks[pack.id]) {
        pack.id = `pack_${Date.now()}`;
      }

      settings.rewardPacks[pack.id] = pack;
      saveSettingsDebounced();
      refreshCreatorUI();
      alert(`นำเข้าแพ็คสำเร็จ: ${pack.name}`);
    } catch (err) {
      alert('นำเข้าล้มเหลว: ' + err.message);
    }
  });
  input.click();
}

// ===== Creator Mode =====

function refreshCreatorUI() {
  const settings = getSettings();
  const container = document.getElementById('love-creator-packs-list');
  if (!container) return;

  container.innerHTML = '';

  for (const [packId, pack] of Object.entries(settings.rewardPacks)) {
    const packEl = document.createElement('div');
    packEl.classList.add('love-creator-pack');
    packEl.innerHTML = `
            <div class="love-creator-pack-header">
                <strong>${pack.name}</strong>
                <button class="love-status-btn love-creator-rename-btn" data-pack-id="${packId}" title="เปลี่ยนชื่อ">✏️</button>
                <div class="love-creator-pack-actions">
                    <button class="love-status-btn" data-action="export" data-pack-id="${packId}">📤 ส่งออก</button>
                    <button class="love-status-btn" data-action="assign" data-pack-id="${packId}">📌 กำหนด</button>
                    ${packId !== 'pack_default' ? `<button class="love-status-btn danger" data-action="delete" data-pack-id="${packId}">🗑️ ลบ</button>` : ''}
                </div>
            </div>
            <div class="love-creator-rewards-list" id="love-creator-rewards-${packId}">
                ${pack.rewards
                  .map(
                    (r, i) => `
                    <div class="love-creator-reward-item" data-pack-id="${packId}" data-reward-index="${i}">
                        <span class="love-creator-reward-thumb">${r.image_base64 || r.image_encrypted ? '🖼️' : '📷'}</span>
                        <span class="love-creator-reward-info">
                            <strong>${r.title}</strong><br/>
                            <small>เกณฑ์: ${r.thresholdPercent}% | ประเภท: ${r.type}${r.image_base64 || r.image_encrypted ? ' | ✅ มีรูป' : ''}</small>
                        </span>
                        <button class="love-status-btn danger love-creator-reward-delete" data-pack-id="${packId}" data-reward-id="${r.id}">✕</button>
                    </div>
                `,
                  )
                  .join('')}
            </div>
            <button class="love-status-btn love-creator-add-reward" data-pack-id="${packId}">+ เพิ่มรางวัล</button>
        `;
    container.appendChild(packEl);
  }

  container.querySelectorAll("[data-action='export']").forEach(btn => {
    btn.addEventListener('click', () => exportRewardPack(btn.dataset.packId));
  });

  container.querySelectorAll("[data-action='assign']").forEach(btn => {
    btn.addEventListener('click', () => {
      const charId = getCurrentCharacterId();
      if (!charId) {
        alert('ยังไม่ได้เลือกตัวละคร');
        return;
      }
      const charData = getCharacterData(charId);
      charData.rewardPackId = btn.dataset.packId;
      saveSettingsDebounced();
      alert(`กำหนดแพ็คให้ตัวละครปัจจุบันแล้ว`);
    });
  });

  container.querySelectorAll("[data-action='delete']").forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('ลบแพ็คนี้?')) return;
      delete settings.rewardPacks[btn.dataset.packId];
      saveSettingsDebounced();
      refreshCreatorUI();
    });
  });

  container.querySelectorAll('.love-creator-rename-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const packId = btn.dataset.packId;
      const pack = settings.rewardPacks[packId];
      if (!pack) return;
      const newName = prompt('ชื่อแพ็คใหม่:', pack.name);
      if (newName && newName.trim()) {
        pack.name = newName.trim();
        saveSettingsDebounced();
        refreshCreatorUI();
      }
    });
  });

  container.querySelectorAll('.love-creator-add-reward').forEach(btn => {
    btn.addEventListener('click', () => openRewardEditor(btn.dataset.packId, null));
  });

  container.querySelectorAll('.love-creator-reward-item').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.love-creator-reward-delete')) return;
      openRewardEditor(el.dataset.packId, parseInt(el.dataset.rewardIndex, 10));
    });
  });

  container.querySelectorAll('.love-creator-reward-delete').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const pack = settings.rewardPacks[btn.dataset.packId];
      if (pack) {
        pack.rewards = pack.rewards.filter(r => r.id !== btn.dataset.rewardId);
        saveSettingsDebounced();
        refreshCreatorUI();
      }
    });
  });

  // Refresh Status Levels UI
  refreshStatusLevelsUI();
}

function refreshStatusLevelsUI() {
  const settings = getSettings();
  const container = document.getElementById('love-creator-levels-list');
  if (!container) return;

  container.innerHTML = '';

  settings.statusLevels.forEach((level, index) => {
    const levelEl = document.createElement('div');
    levelEl.classList.add('love-creator-level-item');
    levelEl.innerHTML = `
      <div class="love-level-range">
        <input type="number" class="love-level-input" data-index="${index}" data-field="minPercent" value="${level.minPercent}" min="0" max="100" />
        <span>-</span>
        <input type="number" class="love-level-input" data-index="${index}" data-field="maxPercent" value="${level.maxPercent}" min="0" max="100" />
        <span>%</span>
      </div>
      <div class="love-level-details">
        <input type="text" class="love-level-input" data-index="${index}" data-field="emoji" value="${level.emoji}" placeholder="😊" maxlength="4" style="width:50px;" />
        <input type="text" class="love-level-input" data-index="${index}" data-field="label" value="${level.label}" placeholder="ชื่อระดับ" style="flex:1;" />
      </div>
      <textarea class="love-level-prompt" data-index="${index}" data-field="prompt" placeholder="Prompt สำหรับ LLM..." rows="2">${level.prompt}</textarea>
      <button class="love-status-btn danger love-level-delete" data-index="${index}">🗑️</button>
    `;
    container.appendChild(levelEl);
  });

  // Bind events
  container.querySelectorAll('.love-level-input, .love-level-prompt').forEach(input => {
    input.addEventListener('input', e => {
      const index = parseInt(e.target.dataset.index, 10);
      const field = e.target.dataset.field;
      const value = field === 'minPercent' || field === 'maxPercent' ? parseFloat(e.target.value) : e.target.value;
      settings.statusLevels[index][field] = value;
      saveSettingsDebounced();
    });
  });

  container.querySelectorAll('.love-level-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt(btn.dataset.index, 10);
      if (settings.statusLevels.length <= 1) {
        alert('ต้องมีอย่างน้อย 1 ระดับ');
        return;
      }
      if (!confirm('ลบระดับนี้?')) return;
      settings.statusLevels.splice(index, 1);
      saveSettingsDebounced();
      refreshStatusLevelsUI();
    });
  });
}

function openRewardEditor(packId, rewardIndex) {
  const settings = getSettings();
  const pack = settings.rewardPacks[packId];
  if (!pack) return;

  const isNew = rewardIndex === null;
  const reward = isNew
    ? {
        id: `r_${Date.now()}`,
        thresholdPercent: 50,
        title: '',
        type: 'image',
        image_base64: '',
        image_encrypted: '',
        text: '',
      }
    : pack.rewards[rewardIndex];

  // Determine if there's an existing image (encrypted or plain)
  const hasEncryptedImage = !!reward.image_encrypted;
  const hasPlainImage = !!reward.image_base64;
  const hasImage = hasEncryptedImage || hasPlainImage;

  const overlayStyle =
    'position:fixed;top:0;left:0;right:0;bottom:0;' +
    'width:100vw;height:100vh;display:flex;align-items:center;' +
    'justify-content:center;z-index:99999;background:rgba(0,0,0,0.8);padding:20px';

  // Build image preview section
  let imagePreviewHtml = '';
  if (hasImage) {
    imagePreviewHtml = `
      <div id="love-editor-image-preview" style="position:relative;margin-top:8px;">
        <div id="love-editor-blur-overlay" style="position:relative;border-radius:6px;overflow:hidden;cursor:pointer;">
          <div style="background:linear-gradient(135deg,#667eea33,#764ba233);padding:20px;text-align:center;border-radius:6px;border:1px dashed rgba(255,255,255,0.2);">
            <span style="font-size:2em;">🔒</span>
            <p style="margin:8px 0 0;font-size:0.85em;opacity:0.8;">รูปถูกเข้ารหัส</p>
            <button type="button" id="love-editor-reveal-btn" class="love-status-btn" style="margin-top:8px;padding:6px 14px;font-size:0.8em;">👁️ กดเพื่อดูรูป</button>
          </div>
        </div>
      </div>`;
  } else {
    imagePreviewHtml = '<div id="love-editor-image-preview"></div>';
  }

  const editorHtml = `
        <div id="love-reward-editor" style="${overlayStyle}">
            <div class="love-status-popup" style="max-width:400px;">
                <div class="love-status-popup-header">
                    <span>${isNew ? 'เพิ่มรางวัล' : 'แก้ไขรางวัล'}</span>
                    <button class="love-status-popup-close" id="love-editor-close">✕</button>
                </div>
                <div class="love-status-popup-body" style="min-height:0;">
                    <div class="love-editor-field">
                        <label>ชื่อ</label>
                        <input type="text" id="love-editor-title" value="${reward.title}" placeholder="ชื่อรางวัล..." />
                    </div>
                    <div class="love-editor-field">
                        <label>เกณฑ์ (% ของคะแนนสูงสุด)</label>
                        <input type="number" id="love-editor-threshold" value="${reward.thresholdPercent || 50}" min="0" max="100" />
                    </div>
                    <div class="love-editor-field">
                        <label>ประเภท</label>
                        <select id="love-editor-type">
                            <option value="image" ${reward.type === 'image' ? 'selected' : ''}>รูปภาพ</option>
                            <option value="text" ${reward.type === 'text' ? 'selected' : ''}>ข้อความ</option>
                        </select>
                    </div>
                    <div class="love-editor-field" id="love-editor-image-section">
                        <label>🔗 ลิงก์รูปภาพ (URL) ${hasImage ? '<span style="color:#4ecdc4;font-size:0.85em;">✅ มีรูปแล้ว</span>' : ''}</label>
                        <div id="love-editor-url-panel">
                            <input type="text" id="love-editor-image-url" placeholder="${hasImage ? 'ใส่ URL ใหม่เพื่อเปลี่ยนรูป...' : 'https://example.com/image.jpg'}" value="" />
                            <div style="display:flex;gap:6px;margin-top:8px;">
                              <button type="button" id="love-editor-url-load" class="love-status-btn" style="padding:6px 12px;">👁️ ดูตัวอย่าง</button>
                              ${hasImage ? `<button type="button" id="love-editor-remove-img" class="love-status-btn danger" style="padding:6px 12px;">🗑️ ลบรูป</button>` : ''}
                            </div>
                        </div>
                        ${imagePreviewHtml}
                    </div>
                    <div class="love-editor-field" id="love-editor-text-section" style="display:${reward.type === 'text' ? 'block' : 'none'}">
                        <label>เนื้อหาข้อความ (รองรับ Markdown: **bold**, *italic*, # heading)</label>
                        <textarea id="love-editor-text" rows="4" placeholder="ข้อความพิเศษ... รองรับ **bold** *italic* ~~strikethrough~~">${reward.text || ''}</textarea>
                    </div>
                    <div class="love-editor-field" style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;">
                        <label style="display:flex;align-items:center;gap:4px;cursor:pointer;">
                            <input type="checkbox" id="love-editor-progressive" ${reward.progressiveReveal ? 'checked' : ''} />
                            <span style="font-size:0.85em;">เผยรูปทีละน้อย</span>
                        </label>
                        <div style="flex:1;min-width:140px;">
                            <label style="font-size:0.8em;opacity:0.7;">⏰ หมดอายุ (ไม่บังคับ)</label>
                            <input type="date" id="love-editor-expires" value="${reward.expiresAt || ''}" />
                        </div>
                    </div>
                    <button class="love-status-btn" id="love-editor-save" style="width:100%;margin-top:12px;padding:10px;">💾 บันทึก</button>
                </div>
            </div>
        </div>
    `;

  document.body.insertAdjacentHTML('beforeend', editorHtml);

  const editor = document.getElementById('love-reward-editor');
  const typeSelect = document.getElementById('love-editor-type');
  const imageSection = document.getElementById('love-editor-image-section');
  const textSection = document.getElementById('love-editor-text-section');

  // Track new URL input (empty means keep existing encrypted)
  let newImageUrl = '';
  let removeImage = false;

  document.getElementById('love-editor-close').addEventListener('click', () => editor.remove());
  editor.addEventListener('click', e => {
    if (e.target === editor) editor.remove();
  });

  typeSelect.addEventListener('change', () => {
    const isImage = typeSelect.value === 'image';
    imageSection.style.display = isImage ? 'block' : 'none';
    textSection.style.display = isImage ? 'none' : 'block';
  });

  // Reveal button — decrypt and show with blur transition
  const revealBtn = document.getElementById('love-editor-reveal-btn');
  if (revealBtn) {
    revealBtn.addEventListener('click', () => {
      const imgSrc = getRewardImage(reward);
      if (imgSrc) {
        const previewEl = document.getElementById('love-editor-image-preview');
        previewEl.innerHTML = `
          <div style="position:relative;margin-top:4px;">
            <img src="${imgSrc}" style="max-width:100%;border-radius:6px;filter:blur(10px);transition:filter 0.5s ease;" id="love-editor-revealed-img" onerror="this.parentElement.innerHTML='<p style=color:red>โหลดรูปไม่สำเร็จ</p>'" />
          </div>`;
        // Animate blur removal
        setTimeout(() => {
          const img = document.getElementById('love-editor-revealed-img');
          if (img) img.style.filter = 'blur(0px)';
        }, 50);
      } else {
        alert('ไม่พบรูปภาพ');
      }
    });
  }

  // Remove image button
  const removeBtn = document.getElementById('love-editor-remove-img');
  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      removeImage = true;
      newImageUrl = '';
      const previewEl = document.getElementById('love-editor-image-preview');
      if (previewEl)
        previewEl.innerHTML = '<p style="color:#ff6b6b;font-size:0.85em;margin-top:8px;">🗑️ รูปจะถูกลบเมื่อบันทึก</p>';
      document.getElementById('love-editor-image-url').value = '';
    });
  }

  // URL preview button
  const urlLoadBtn = document.getElementById('love-editor-url-load');
  if (urlLoadBtn) {
    urlLoadBtn.addEventListener('click', () => {
      const url = document.getElementById('love-editor-image-url').value.trim();
      if (!url) {
        alert('กรุณาใส่ URL');
        return;
      }

      newImageUrl = url;
      removeImage = false;
      const previewEl = document.getElementById('love-editor-image-preview');
      previewEl.innerHTML = `<img src="${url}" style="max-width:100%;border-radius:6px;margin-top:8px;" onerror="this.parentElement.innerHTML='<p style=color:red>โหลดรูปไม่สำเร็จ</p>'" />`;
    });
  }

  document.getElementById('love-editor-save').addEventListener('click', () => {
    const title = document.getElementById('love-editor-title').value.trim();
    const threshold = parseInt(document.getElementById('love-editor-threshold').value, 10);
    const type = typeSelect.value;
    const text = document.getElementById('love-editor-text').value;

    if (!title) {
      alert('กรุณาใส่ชื่อ');
      return;
    }
    if (isNaN(threshold) || threshold < 0 || threshold > 100) {
      alert('เกณฑ์ต้องอยู่ระหว่าง 0-100');
      return;
    }

    reward.title = title;
    reward.thresholdPercent = threshold;
    reward.type = type;

    // Handle image — encrypt on save
    if (type === 'image') {
      if (removeImage) {
        // User explicitly removed the image
        reward.image_base64 = '';
        reward.image_encrypted = '';
      } else if (newImageUrl) {
        // New URL entered — encrypt it
        reward.image_base64 = '';
        reward.image_encrypted = encryptRewardData(newImageUrl, reward.id);
      }
      // If neither removeImage nor newImageUrl, keep existing encrypted data unchanged
    } else {
      reward.image_base64 = '';
      reward.image_encrypted = '';
    }

    reward.text = type === 'text' ? text : '';

    // Progressive reveal & expiry
    const progressiveEl = document.getElementById('love-editor-progressive');
    reward.progressiveReveal = progressiveEl ? progressiveEl.checked : false;
    const expiresEl = document.getElementById('love-editor-expires');
    reward.expiresAt = expiresEl && expiresEl.value ? expiresEl.value : '';

    if (isNew) {
      pack.rewards.push(reward);
      pack.rewards.sort((a, b) => a.thresholdPercent - b.thresholdPercent);
    }

    saveSettingsDebounced();
    refreshCreatorUI();
    editor.remove();
  });
}

// ===== Message Handling =====

function onMessageReceived(messageIndex) {
  const settings = getSettings();
  if (!settings.enabled) return;

  const context = getContext();
  if (!context.chat || messageIndex < 0 || messageIndex >= context.chat.length) return;

  const message = context.chat[messageIndex];
  if (!message || message.is_user) return;

  // Track per-character stats with dailyLog + streak
  const charId = getCurrentCharacterId();
  if (charId) {
    const charData = getCharacterData(charId);
    if (charData) {
      const now = new Date();
      const today = now.toISOString().split('T')[0];

      // Set first interaction date
      if (!charData.stats.firstInteraction) {
        charData.stats.firstInteraction = now.toISOString();
        addJournalEntry(charData, 'first_message', '💬 เริ่มคุยครั้งแรก');
      }

      // Update last interaction
      charData.stats.lastInteraction = now.toISOString();

      // Increment total messages
      charData.stats.totalMessages++;

      // Update dailyLog
      if (!charData.stats.dailyLog) charData.stats.dailyLog = {};
      if (!charData.stats.dailyLog[today]) {
        // New day! Update streak
        charData.stats.totalDaysActive = (charData.stats.totalDaysActive || 0) + 1;
        charData.stats.dailyLog[today] = 0;

        // Calculate streak
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayKey = yesterday.toISOString().split('T')[0];

        if (charData.stats.dailyLog[yesterdayKey]) {
          charData.stats.streak = (charData.stats.streak || 0) + 1;
        } else {
          charData.stats.streak = 1;
        }

        // Update longest streak
        if (charData.stats.streak > (charData.stats.longestStreak || 0)) {
          charData.stats.longestStreak = charData.stats.streak;
        }

        // Clean up old dailyLog entries (keep last 90 days)
        const cutoff = new Date(now);
        cutoff.setDate(cutoff.getDate() - 90);
        const cutoffKey = cutoff.toISOString().split('T')[0];
        for (const key of Object.keys(charData.stats.dailyLog)) {
          if (key < cutoffKey) delete charData.stats.dailyLog[key];
        }
      }
      charData.stats.dailyLog[today]++;

      saveSettingsDebounced();
    }
  }

  const originalText = message.mes;
  const delta = parseLoveTag(originalText);

  if (delta !== null) {
    message.mes = removeLoveTags(originalText);
    const messageElement = document.querySelector(`#chat .mes[mesid="${messageIndex}"] .mes_text`);
    if (messageElement) {
      messageElement.innerHTML = messageElement.innerHTML.replace(/\s*\[LOVE:\s*[+-]?\d+\]\s*/gi, '');
    }
    updateScore(delta);
  }
}

function onPromptReady() {
  const settings = getSettings();
  const context = getContext();
  if (!context.setExtensionPrompt) return;

  // Extension prompt keys (multiple injections)
  const KEY_SYSTEM = `${extensionName}_system`;
  const KEY_REMINDER = `${extensionName}_reminder`;

  // Clear prompts if disabled
  if (!settings.enabled) {
    context.setExtensionPrompt(KEY_SYSTEM, '', 0, 0);
    context.setExtensionPrompt(KEY_REMINDER, '', 1, 0);
    return;
  }

  // Build SYSTEM prompt — main instructions (injected at top, position 0)
  let systemPrompt = settings.injectionPrompt;

  // Build REMINDER prompt — short, punchy reminder injected right before response (position 1, depth 0)
  let reminderPrompt = '';

  const charId = getCurrentCharacterId();
  if (charId) {
    const charData = getCharacterData(charId);
    const level = getCurrentLevel(charData);

    if (level && level.prompt) {
      // Strong system-level instruction
      systemPrompt += `\n\n### RELATIONSHIP STATUS (MANDATORY)\nLevel: ${level.emoji} ${level.label}\nBehavior: ${level.prompt}\n\nThis behavior is ABSOLUTE. Apply in every response. Do not break character.`;

      // Short reminder right before AI response — last thing AI sees
      reminderPrompt = `[Active Relationship Status: ${level.emoji} ${level.label} → ${level.prompt}]`;

      // Set chat variable for Lorebook keyword matching ({{getvar::love_level}} in lorebook entries)
      try {
        if (context.variables && typeof context.variables.local === 'object') {
          context.variables.local.set('love_level', level.label);
        } else if (typeof context.executeSlashCommandsWithOptions === 'function') {
          context.executeSlashCommandsWithOptions(`/setvar key=love_level ${level.label}`);
        }
      } catch (e) {
        // Variable system not available, lorebook fallback won't work but injection still does
      }
    }

    // Daily mood (subtle, only in system prompt)
    const mood = getDailyMood(charId);
    if (mood && mood.id !== 'neutral') {
      systemPrompt += `\n\n### TODAY'S MOOD\n${mood.emoji} ${mood.label} — Reflect subtly in tone.`;
    }

    // Milestone (one-time, in reminder for max impact)
    if (charData.stats && charData.stats._pendingMilestone) {
      const milestone = charData.stats._pendingMilestone;
      if (milestone.type === 'level_up') {
        reminderPrompt += `\n\n[MILESTONE: Relationship just reached ${milestone.emoji} ${milestone.level}! React with emotion — make this moment memorable.]`;
      } else {
        reminderPrompt += `\n\n[MILESTONE: Relationship dropped to ${milestone.emoji} ${milestone.level}. React with subtle hurt/distance.]`;
      }
      delete charData.stats._pendingMilestone;
      saveSettingsDebounced();
    }
  }

  // Inject SYSTEM prompt at top (position 0 = before main, depth 0, role 0 = system)
  context.setExtensionPrompt(KEY_SYSTEM, systemPrompt, 0, 0, false, 0);

  // Inject REMINDER right before AI response (position 1 = in-chat, depth 0 = at very bottom, role 0 = system)
  context.setExtensionPrompt(KEY_REMINDER, reminderPrompt, 1, 0, false, 0);
}

// ===== Settings Panel Binding =====

function bindSettingsUI() {
  const enableToggle = document.getElementById('love-status-enabled');
  if (enableToggle) {
    enableToggle.checked = getSettings().enabled;
    enableToggle.addEventListener('change', () => {
      getSettings().enabled = enableToggle.checked;
      saveSettingsDebounced();
      const widget = document.getElementById('love-status-widget');
      if (widget) widget.style.display = enableToggle.checked ? '' : 'none';
    });
  }

  const creatorToggle = document.getElementById('love-status-creator-mode');
  if (creatorToggle) {
    creatorToggle.checked = getSettings().creatorMode;
    creatorToggle.addEventListener('change', () => {
      getSettings().creatorMode = creatorToggle.checked;
      saveSettingsDebounced();
      const creatorSection = document.getElementById('love-creator-section');
      if (creatorSection) creatorSection.style.display = creatorToggle.checked ? 'block' : 'none';
      if (creatorToggle.checked) refreshCreatorUI();
    });
  }

  const resetBtn = document.getElementById('love-status-reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      const charId = getCurrentCharacterId();
      if (!charId) {
        alert('ยังไม่ได้เลือกตัวละคร');
        return;
      }
      const charData = getCharacterData(charId);
      charData.currentScore = charData.startScore;
      charData.scoreHistory = [];
      charData.unlockedRewards = [];
      saveSettingsDebounced();
      updateHeartWidget();
      alert('รีเซ็ตคะแนนสำเร็จ');
    });
  }

  const promptTextarea = document.getElementById('love-status-prompt');
  if (promptTextarea) {
    promptTextarea.value = getSettings().injectionPrompt;
    promptTextarea.addEventListener('input', () => {
      getSettings().injectionPrompt = promptTextarea.value;
      saveSettingsDebounced();
    });
  }

  // Decay settings binding
  const decayEnabled = document.getElementById('love-status-decay-enabled');
  const decayPerDay = document.getElementById('love-decay-per-day');
  const decayGrace = document.getElementById('love-decay-grace');
  const decayMax = document.getElementById('love-decay-max');

  if (decayEnabled) {
    const settings = getSettings();
    if (!settings.scoreDecay)
      settings.scoreDecay = {
        enabled: true,
        decayPerDay: 1,
        gracePeriodDays: 1,
        maxDecayPerCheck: 10,
        notifyOnDecay: true,
      };
    decayEnabled.checked = settings.scoreDecay.enabled;
    if (decayPerDay) decayPerDay.value = settings.scoreDecay.decayPerDay;
    if (decayGrace) decayGrace.value = settings.scoreDecay.gracePeriodDays;
    if (decayMax) decayMax.value = settings.scoreDecay.maxDecayPerCheck;

    decayEnabled.addEventListener('change', () => {
      getSettings().scoreDecay.enabled = decayEnabled.checked;
      saveSettingsDebounced();
    });
    if (decayPerDay)
      decayPerDay.addEventListener('change', () => {
        getSettings().scoreDecay.decayPerDay = parseInt(decayPerDay.value, 10) || 1;
        saveSettingsDebounced();
      });
    if (decayGrace)
      decayGrace.addEventListener('change', () => {
        getSettings().scoreDecay.gracePeriodDays = parseInt(decayGrace.value, 10) || 1;
        saveSettingsDebounced();
      });
    if (decayMax)
      decayMax.addEventListener('change', () => {
        getSettings().scoreDecay.maxDecayPerCheck = parseInt(decayMax.value, 10) || 10;
        saveSettingsDebounced();
      });
  }

  const importBtn = document.getElementById('love-status-import-btn');
  if (importBtn) {
    importBtn.addEventListener('click', importRewardPack);
  }

  const newPackBtn = document.getElementById('love-status-new-pack-btn');
  if (newPackBtn) {
    newPackBtn.addEventListener('click', () => {
      const name = prompt('ชื่อแพ็ค:');
      if (!name) return;
      const settings = getSettings();
      const id = `pack_${Date.now()}`;
      settings.rewardPacks[id] = { id, name, rewards: [] };
      saveSettingsDebounced();
      refreshCreatorUI();
    });
  }

  const creatorSection = document.getElementById('love-creator-section');
  if (creatorSection) {
    creatorSection.style.display = getSettings().creatorMode ? 'block' : 'none';
  }

  if (getSettings().creatorMode) refreshCreatorUI();

  // Add Level button
  const addLevelBtn = document.getElementById('love-status-add-level-btn');
  if (addLevelBtn) {
    addLevelBtn.addEventListener('click', () => {
      const settings = getSettings();
      const lastLevel = settings.statusLevels[settings.statusLevels.length - 1];
      const newMin = lastLevel ? lastLevel.maxPercent : 0;
      settings.statusLevels.push({
        minPercent: newMin,
        maxPercent: Math.min(newMin + 20, 100),
        label: 'ระดับใหม่',
        emoji: '❓',
        prompt: '',
      });
      saveSettingsDebounced();
      refreshStatusLevelsUI();
    });
  }

  // Export as Lorebook button
  const exportLorebookBtn = document.getElementById('love-status-export-lorebook-btn');
  if (exportLorebookBtn) {
    exportLorebookBtn.addEventListener('click', exportAsLorebook);
  }

  // Export Card Data button
  const embedBtn = document.getElementById('love-status-embed-card-btn');
  if (embedBtn) {
    embedBtn.addEventListener('click', async () => {
      embedBtn.disabled = true;
      embedBtn.textContent = '⏳ กำลังส่งออก...';
      await exportCardData();
      embedBtn.disabled = false;
      embedBtn.textContent = '📤 ส่งออก Card Data (JSON)';
    });
  }

  // Import Card Data button
  const importCardBtn = document.getElementById('love-status-import-card-btn');
  if (importCardBtn) {
    importCardBtn.addEventListener('click', () => {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.json';
      fileInput.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
          importCardDataFromJSON(ev.target.result);
        };
        reader.readAsText(file);
      });
      fileInput.click();
    });
  }

  // Start Score input
  const startScoreInput = document.getElementById('love-status-start-score');
  if (startScoreInput) {
    const charId = getCurrentCharacterId();
    const charData = charId ? getCharacterData(charId) : null;
    startScoreInput.value = charData?.startScore ?? 0;
    startScoreInput.addEventListener('change', () => {
      const charId = getCurrentCharacterId();
      if (!charId) return;
      const charData = getCharacterData(charId);
      if (!charData) return;
      const newStart = parseInt(startScoreInput.value, 10) || 0;
      charData.startScore = newStart;
      // Also update currentScore if no interactions yet
      if (!charData.scoreHistory || charData.scoreHistory.length === 0) {
        charData.currentScore = newStart;
        updateHeartWidget();
      }
      saveSettingsDebounced();
    });
  }
}

// ===== Initialization =====

jQuery(async () => {
  loadSettings();
  cleanupOrphanedCharacters();

  const settingsHtml = await $.get(`${extensionFolderPath}/ui.html`);
  $('#extensions_settings2').append(settingsHtml);

  bindSettingsUI();
  createHeartWidget();

  eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
  eventSource.on(event_types.GENERATE_BEFORE_COMBINE_PROMPTS, onPromptReady);
  eventSource.on(event_types.CHAT_CHANGED, () => {
    // Try auto-load from character card (first time only)
    tryAutoLoadFromCard();
    // Apply score decay if inactive
    const charId = getCurrentCharacterId();
    if (charId) applyScoreDecay(charId);
    updateHeartWidget();
  });

  console.log('[Love Status] Extension loaded successfully.');
});
