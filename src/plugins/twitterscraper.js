const jsonfile = require("jsonfile");
const { retry, flatmapP } = require("dashp");
const { toArray } = require("lodash");
const { envelope: env } = require("@sugarcube/core");
const { runCmd } = require("@sugarcube/utils");

const querySource = "twitter_tweet";

async function twitterScraper(user) {
  runCmd("twitterscraper", [
    "--user",
    user,
    "--output",
    "tweets.json",
    "--overwrite"
  ]);
  const file = await jsonfile.readFile("./tweets.json");
  return file;
}

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

    stats.count("success");

    return profile.map(tweet => {
      return {
        _sc_id_fields: tweet["tweet_id"]
      };
    });
  }, queries);

  // log.info(`We have scraped ${queries.length} twitter profiles!`);
  return env.concatData(data, envelope);
};

plugin.argv = {};
plugin.desc = "Scrap twitter profiles";

module.exports = plugin;
