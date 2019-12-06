const os = require("os");
const fs = require("fs");
const { URL } = require("url");
const { retry, flatmapP } = require("dashp");
const { envelope: env } = require("@sugarcube/core");
const { runCmd } = require("@sugarcube/utils");
const { promisify } = require("util");
const { cleanUp, existsP } = require("@sugarcube/plugin-fs");
const csv = require("csvtojson");
const { parse, format, endOfDay, eachWeekOfInterval } = require("date-fns");
const readFile = promisify(fs.readFile);

const querySource = "twitter_tweet";

const formatDate = date => format(date, "yyyy-MM-dd ");
const parseDate = date => parse(date, "yyyy-MM-dd mm:ss:SS");

const endDay = endOfDay(new Date());
const startDay = parse("2011-01-01", "yyyy-MM-dd", new Date());
const intervals = eachWeekOfInterval({ start: startDay, end: endDay });

async function scrapByInterval(query) {
  await Promise.all(
    intervals.map(async (date, index) => {
      await twitterScraper(
        query,
        parseDate(date),
        parseDate(intervals[index + 1])
      );
    })
  );
}

function parseTweetId(id) {
  if (id.startsWith("http")) {
    const u = new URL(id);
    return u.pathname.split("/").filter(x => x !== "")[2];
  }
  return id;
}

async function twitterScraper(user, sinceDay, untilDay) {
  const tempDir = os.tmpdir();
  const csvFile = `${tempDir}/tweets-${user}.csv`;
  let data = [];

  await runCmd("twint", [
    "-u",
    user,
    "--since",
    sinceDay,
    "--until",
    untilDay,
    "-o",
    csvFile,
    "--csv"
  ]);

  if (await existsP(csvFile)) {
    data = await csv().fromFile(csvFile);
    await cleanUp(csvFile);
  }
  return data;
}

const plugin = async (envelope, { stats, log }) => {
  const queries = env
    .queriesByType(querySource, envelope)
    .map(term => parseTweetId(term));

  const data = await flatmapP(async query => {
    stats.count("total");
    let tweets;
    try {
      tweets = await scrapByInterval(query);
    } catch (e) {
      log.error(`Failed to scrape ${query}: ${e.message}`);
      stats.fail({ term: query, reason: e.message });
      return [];
    }

    stats.count("success");

    log.info(`We have scraped ${tweets.length} tweets for ${query}.`);
    return tweets.map(
      ({
        id,
        date,
        time,
        username,
        name,
        tweet,
        urls,
        photos,
        hashtags,
        link,
        video,
        geo,
        place
      }) => {
        const timestamp = parse(
          `${date}:${time}`,
          "yyyy-MM-dd:H:mm:ss:SS",
          new Date()
        );
        return {
          _sc_id_fields: [id],
          _sc_content_fields: [tweet],
          _sc_media: [...photos],
          timestamp,
          time,
          username,
          name,
          tweet,
          urls,
          photos,
          hashtags,
          link,
          video,
          geo,
          place
        };
      }
    );
  }, queries);

  return env.concatData(data, envelope);
};

plugin.argv = {};
plugin.desc = "Scrap twitter profiles";

module.exports = plugin;
