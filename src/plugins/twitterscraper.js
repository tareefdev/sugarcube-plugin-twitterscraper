const os = require("os");
const fs = require("fs");
const { URL } = require("url");
const { retry, flatmapP, flatmapP4 } = require("dashp");
const { envelope: env } = require("@sugarcube/core");
const { runCmd } = require("@sugarcube/utils");
const { promisify } = require("util");
const { cleanUp, existsP } = require("@sugarcube/plugin-fs");
const csv = require("csvtojson");

const {
  parse,
  format,
  endOfDay,
  addWeeks,
  eachWeekOfInterval
} = require("date-fns");
const readFile = promisify(fs.readFile);

const querySource = "twitter_user";

const formatDate = date => format(date, "yyyy-MM-dd HH:mm:ss");
const parseDate = date => parse(date, "yyyy-MM-dd mm:ss:SS", new Date());

const parseTwitterUser = user => {
  if (Number.isInteger(user)) return user.toString();
  if (user.startsWith("http")) {
    const u = new URL(user);
    return u.pathname
      .replace(/^\//, "")
      .replace(/\/$/, "")
      .split("/")[0];
  }
  return user.replace(/^@/, "");
};

async function twitterScraper(user, sinceDay, untilDay) {
  const since = formatDate(sinceDay);
  const until = formatDate(untilDay);
  const tempDir = os.tmpdir();
  const csvFile = `${tempDir}/tweets-${user}-${since}-${until}.csv`;
  let data = [];

  await runCmd("twint", [
    "-u",
    user,
    "--since",
    since,
    "--until",
    until,
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
  const queries = env.queriesByType(querySource, envelope);

  const endDay = endOfDay(new Date());
  const startDay = parse("2011-01-01", "yyyy-MM-dd", new Date());
  const intervals = eachWeekOfInterval({ start: startDay, end: endDay }).map(
    week => [week, addWeeks(week, 1)]
  );

  const data = await flatmapP(async query => {
    stats.count("total");
    let tweets;
    try {
      tweets = await flatmapP4(async ([since, until]) => {
        const data = await twitterScraper(
          parseTwitterUser(query),
          since,
          until
        );

        log.debug(
          `Fetched ${data.length} tweets from ${format(
            since,
            "yyyy-MM-dd"
          )} until ${format(until, "yyyy-MM-dd")}`
        );

        return data;
      }, intervals);
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
