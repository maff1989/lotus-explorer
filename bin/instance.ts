#!/usr/bin/env node
import app from '../app';
import debug from 'debug';
import { Database } from '../lib/database';
const settings = require('../lib/settings');
const db = new Database();

const main = async () => {
  // Initialize instance
  app.set('port', process.env.PORT || settings.port);
  await db.connect();
  // check stats database; create if doesn't exist
  const dbStats = await db.check_stats(settings.coin);
  app.locals.stats = dbStats ? dbStats: await db.create_stats(settings.coin);
  // check Exbitron markets database; create if doesn't exist
  const markets = settings.markets.enabled;
  for (const market of markets) {
    const dbMarket = await db.check_market(market);
    if (!dbMarket) {
      await db.create_market(settings.markets.coin, market);
    }
  }
  // check richlist; create if doesn't exist
  const dbRichlist = await db.check_richlist(settings.coin);
  if (!dbRichlist) {
    await db.create_richlist(settings.coin);
  }
  // Start the listener
  const server = app.listen(app.get('port'), '::', function() {
    debug('Express server listening on port ' + server.address());
  });
};
main();