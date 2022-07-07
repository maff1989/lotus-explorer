import { Database, is_locked } from '../lib/database';
import { Explorer } from '../lib/explorer';
import Settings from '../lib/settings';

/*
 *
 *    Initialization
 * 
 */
const db = new Database();
const lib = new Explorer();
const settings = new Settings();
settings.reloadSettings();
const address = 'lotus_16PSJMPL9PB7v6md8mbnHsQAZC1RXEs92uZFRRcWq';
const height = 123456;
/*
 *
 *    Main runner
 * 
 */
const main = async () => {
  // Setup
  await db.connect();
  // Checkers
  const isLocked = await is_locked('index');
  const checkMarket = await db.check_market('exbitron');
  const checkRichlist = await db.check_richlist('Lotus');
  const checkStats = await db.check_stats('Lotus');
  console.log('isLocked', isLocked);
  console.log('checkMarket', checkMarket);
  console.log('checkRichlist', checkRichlist);
  console.log('checkStats', checkStats);
  // Getters
  const addressDocument = await db.get_address(address);
  const block = await db.get_block(height);
  const richlist = await db.get_richlist(settings.coin);
  const stats = await db.get_stats(settings.coin);
  const charts = await db.get_charts();
  const distribution = await db.get_distribution(richlist, stats);
  const market = await db.get_market(settings.markets.default);
  const peer = await db.get_peer('1.2.3.4');
  const peers = await db.get_peers();
  const chartsTxs = await db.get_charts_txs('day');
  const chartsRewards = await db.get_charts_reward_distribution('day');
  const chartsDifficulty = await db.get_charts_difficulty('week');
  const lastBlocks = await db.get_last_blocks_ajax(0, 10);
  const lastTxs = await db.get_last_txs_ajax(0, 10, 0);
  const addressTxs = await db.get_address_txs_ajax(address, 0, 10);
  console.log('addressDocument', addressDocument);
  console.log('block', block);
  console.log('richlist', richlist);
  console.log('stats', stats);
  console.log('charts', charts);
  console.log('distribution', distribution);
  console.log('market', market);
  console.log('peer', peer);
  console.log('peers', peers);
  console.log('chartsTxs', chartsTxs);
  console.log('chartsRewards', chartsRewards);
  console.log('chartsDifficulty', chartsDifficulty);
  console.log('lastBlocks', lastBlocks);
  console.log('lastTxs', lastTxs);
  console.log('addressTxs', addressTxs);
  // Creators
  const createMarket = await db.create_market(settings.coin, settings.markets.default);
  const createPeer = await db.create_peer({
    address: "1.1.1.1",
    port: "10605",
    protocol: 'test',
    version: 'test',
    country: 'United States',
    country_code: 'US'
  });
  const createRichlist = await db.create_richlist(settings.coin);
  const createStats = await db.create_stats(settings.coin);
  const explorerBlockhash = await lib.get_blockhash(height);
  const explorerBlock = await lib.get_block(explorerBlockhash);
  const createTxs = await db.create_txs(explorerBlock);
  //const newStats = await db.create_stats('homina');
  console.log('createRichlist', createRichlist);
  console.log('createStats', createStats);
  console.log('createTxs', createTxs);
  // Updaters
  const chartsUpdated = await db.update_charts_db();
  console.log('chartsUpdated', chartsUpdated);
  // Deleters
  // Errors
  const checkMarketBad = await db.check_market('sexbitron');
  const checkStatsBad = await db.check_stats('hehehe');
  console.log('checkMarketBad', checkMarketBad);
  console.log('checkStatsBad', checkStatsBad);
  // Teardown
  await db.disconnect();
};
main();