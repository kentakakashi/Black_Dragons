const blacklistPublisher = require("../systems/blacklistPublisher");

module.exports = {
  name: "blacklist-publish",
  data: {
    name: "blacklist-publish"
  },
  execute: blacklistPublisher.execute
};
