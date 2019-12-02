const { retry, flatmapP } = require("dashp");
const { toArray } = require("lodash");
const { envelope: env } = require("@sugarcube/core");
const { runCmd } = require("@sugarcube/utils");

const querySource = "twitter_tweet";

const twitterScraper = user =>
  retry(() => runCmd("twitterscraper", ["--user", user, "--dump"]));

const plugin = async (envelope, { stats, log }) => {
  const queries = env.queriesByType(querySource, envelope);

  const data = await flatmapP(async query => {
    stats.count("total");
    let profile;

    try {
      profile = await twitterScraper(query);
    } catch (e) {
      stats.fail({ term: query, reason: e.message });
      return [];
    }
    const bb = JSON.parse(profile);
    log.info(bb.length);
    stats.count("success");

    return "hi";
  }, queries);

  // log.info(`We have scraped ${queries.length} twitter profiles!`);
  return env.concatData(data, envelope);
};

plugin.argv = {};
plugin.desc = "Scrap twitter profiles";

module.exports = plugin;
