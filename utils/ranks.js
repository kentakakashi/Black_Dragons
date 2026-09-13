const RANKS = [
  { key: "Z", emoji: "👑", min: 50000 },
  { key: "SSS", emoji: "💠", min: 20000 },
  { key: "SS", emoji: "🔥", min: 15000 },
  { key: "S", emoji: "⚡", min: 10000 },
  { key: "A", emoji: "🏆", min: 7500 },
  { key: "B", emoji: "💫", min: 5000 },
  { key: "C", emoji: "⚔️", min: 2500 },
  { key: "D", emoji: "🗡️", min: 1000 },
  { key: "E", emoji: "🌱", min: 0 }
];

function getRank(kills) {
  const value = Number(kills);
  return RANKS.find(rank => value >= rank.min) || RANKS[RANKS.length - 1];
}

function getRankDisplay(rankOrKey) {
  const rank = typeof rankOrKey === "string" ? getRankByKey(rankOrKey) : rankOrKey;
  return `${rank.emoji} **${rank.key}**`;
}

function getRankByKey(key) {
  return RANKS.find(rank => rank.key === String(key).toUpperCase()) || RANKS[RANKS.length - 1];
}

function getNextRank(kills) {
  const current = getRank(kills);
  const index = RANKS.findIndex(rank => rank.key === current.key);
  return index > 0 ? RANKS[index - 1] : null;
}

function formatKills(number) {
  return Number(number).toLocaleString("en-US");
}

module.exports = {
  RANKS,
  getRank,
  getRankByKey,
  getRankDisplay,
  getNextRank,
  formatKills
};
