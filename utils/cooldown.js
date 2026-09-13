const cooldowns = new Map();

function checkCooldown(userId, duration = 60000) {
  const previous = cooldowns.get(userId);
  if (!previous) return { active: false, remaining: 0 };

  const elapsed = Date.now() - previous;
  if (elapsed >= duration) {
    cooldowns.delete(userId);
    return { active: false, remaining: 0 };
  }

  return {
    active: true,
    remaining: Math.ceil((duration - elapsed) / 1000)
  };
}

function setCooldown(userId) {
  cooldowns.set(userId, Date.now());
}

module.exports = { checkCooldown, setCooldown };
