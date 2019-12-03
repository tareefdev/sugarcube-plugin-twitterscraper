const os = require("os");
const fs = require("fs");
const { retry, flatmapP } = require("dashp");
const { envelope: env } = require("@sugarcube/core");
const { runCmd } = require("@sugarcube/utils");
const { promisify } = require("util");
const {cleanUp} = require(@sugarcube/plugin-fs);
const readFile = promisify(fs.readFile);

const querySource = "twitter_user";
const tempDir = os.tmpdir();

async function twitterScraper(user) {
  const file = `${tempDir}/tweets-${user}.json`;
  let ifFileExist;

  await runCmd("twitterscraper", [
    "--user",
    user,
    "-a",
    "--output",
    file,
    "--overwrite"
  ]);
  fs.access(file, fs.F_OK, err => {
    ifFileExist = err ? true : false;
  });
  const data = ifFileExist ? JSON.parse((await readFile(file)).toString()) : [];
  ifFileExist && await cleanUp(file);
  return data;
}

const plugin = async (envelope, { stats, log }) => {
  const queries = env.queriesByType(querySource, envelope);

  // !! you need parsing of the input query. I'm sure you get most feeds as
  // full URL's. Take a look here:
  // https://github.com/critocrito/sugarcube/blob/master/packages/plugin-fs/lib/api.js#L39
  const data = await flatmapP(async query => {
    stats.count("total");
    let tweets;

    try {
      tweets = await twitterScraper(query);
    } catch (e) {
      log.error(`Failed to scrape ${query}: ${e.message}`);
      stats.fail({ term: query, reason: e.message });
      return [];
    }

    stats.count("success");

    log.info(`We have scraped ${tweets.length} tweets for ${query}.`);

    return tweets.map(({tweet_id,text,timestamp,has_media, tweet_url }) => {
      return {
        _sc_id_fields: [tweet_id],
        text,
        timestamp,
        has_media,
        tweet_url
      };
    });
  }, queries);

  return env.concatData(data, envelope);
};

plugin.argv = {};
plugin.desc = "Scrap twitter profiles";

module.exports = plugin;
