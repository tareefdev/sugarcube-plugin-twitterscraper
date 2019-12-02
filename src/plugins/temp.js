const { flatmapP } = require("dashp");
const fetch = require("node-fetch");
const { parseISO } = require("date-fns");
const { envelope: env } = require("@sugarcube/core");

const querySource = "http_url";

const plugin = async (envelope, { log, stats }) => {
  const queries = env.queriesByType(querySource, envelope);

  const data = await flatmapP(async query => {
    stats.count("total");

    const url = `http://labs.mementoweb.org/timemap/json/${query}`;

    let resp;
    let json;

    try {
      resp = await fetch(url);
    } catch (e) {
      stats.fail({ term: query, reason: e.message });
      return [];
    }

    try {
      json = await resp.json();
    } catch (e) {
      stats.fail({ term: query, reason: "No Mementos found." });
      return [];
    }

    if (
      json.mementos == null ||
      json.mementos.list == null ||
      !Array.isArray(json.mementos.list)
    ) {
      stats.fail({ term: query, reason: "TimeMap data format mismatch." });
      return [];
    }

    stats.count("success");

    log.info(`Expanding ${query} into ${json.mementos.list.length} Mementos.`);

    return json.mementos.list.map(({ datetime, uri }) => {
      const createdAt = parseISO(datetime);

      return {
        _sc_id_fields: ["uri"],
        _sc_media: [{ type: "url", term: uri }],
        _sc_pubdates: { source: createdAt },
        _sc_queries: [{ type: querySource, term: query }],
        created_at: createdAt,
        uri
      };
    });
  }, queries);

  return env.concatData(data, envelope);
};

plugin.argv = {};
plugin.desc = "Lookup the TimeMap for a resource URI.";

module.exports = plugin;
