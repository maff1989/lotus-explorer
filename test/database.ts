const settings = require('../lib/settings');
import { Database } from '../lib/database';


const dbString = 'mongodb://' + settings.dbsettings.user
  + ':' + settings.dbsettings.password
  + '@' + settings.dbsettings.address
  + ':' + settings.dbsettings.port
  + '/' + settings.dbsettings.database;
const db = new Database();

const main = async () => {
  await db.connect(dbString);

  const isLocked = await db.is_locked();
  const stats = await db.get_stats('Lotus');
  // const newStats = await db.create_stats('homina');
  const address = await db.get_address('lotus_16PSJMPL9PB7v6md8mbnHsQAZC1RXEs92uZFRRcWq');
  const richlist = await db.get_richlist('Lotus');
  const chartsTxs = await db.get_charts_txs('day');
  const chartsRewards = await db.get_charts_reward_distribution('day');
  const chartsDifficulty = await db.get_charts_difficulty('week');

  console.log('isLocked', isLocked);
  console.log('stats', stats);
  // console.log('newStats', newStats);
  console.log('address', address);
  console.log('richlist', richlist);
  console.log('chartsTxs', chartsTxs);
  console.log('chartsRewards', chartsRewards);
  console.log('chartsDifficulty', chartsDifficulty);

  await db.disconnect();
};
main();