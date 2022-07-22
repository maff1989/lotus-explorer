import express, { Response } from 'express';
import qr from 'qr-image';
import {
  Database,
  is_locked
} from '../lib/database';
import {
  Explorer,
  BlockInfo
} from '../lib/explorer';
import * as Block from '../models/block';
import * as Tx from '../models/tx';
import settings from '../lib/settings';
import locale from '../lib/locale';

const db = new Database()
  , lib = new Explorer();
/*
 *
 *      Handler Functions
 * 
 */
/**
 * Render the main index page, optionally with a warning/error
 * @param res - Response instance from Express router
 * @param error - Error string to display, or null
 */
const route_get_index = async (
  res: Response,
  error: string
): Promise<void> => {
  return (await is_locked('index'))
    ? res.render('index', { active: 'home', error: error, warning: locale.initial_index_alert })
    : res.render('index', { active: 'home', error: error, warning: null });
};
/*
 *
 *      Routes
 * 
 */
const router = express.Router();
router.get('/', async (req, res) => {
  return route_get_index(res, null);
});
router.get('/info', async (req, res) => {
  return res.render('info', {
    active: 'info',
    address: settings.address,
    hashes: settings.api
  });
});
router.get('/markets/:market', async (req, res) => {
  const { market } = req.params;
  try {
    if (!settings.markets.enabled.includes(market)) {
      throw new Error(`Market "${market}" not enabled in settings.json`);
    }
    const dbMarket = await db.get_market(market);
    if (!dbMarket) {
      throw new Error(`no database entry for "${market}"`);
    }
    return res.render(`./markets/${market}`, {
      active: 'markets',
      marketdata: {
        coin: settings.markets.coin,
        exchange: settings.markets.exchange,
        data: dbMarket,
      },
      market: market
    });
  } catch (e: any) {
    console.log(`/markets/${market}: ${e.message}`);
    return route_get_index(res, `Market not found: ${market}`);
  }
});
router.get('/richlist', async (req, res) => {
  if (!settings.display.richlist) {
    return route_get_index(res, null);
  }
  try {
    const dbStats = await db.get_stats(settings.coin);
    const dbRichlist = await db.get_richlist(settings.coin);
    const dbDistribution = await db.get_distribution(dbRichlist, dbStats);
    return res.render('richlist', {
      active: 'richlist',
      balance: dbRichlist.balance.map(doc => {
        return {
          ...doc,
          balance: lib.convert_to_xpi(doc.balance)
        };
      }),
      received: dbRichlist.received.map(doc => {
        return {
          ...doc,
          received: lib.convert_to_xpi(doc.received)
        };
      }),
      stats: {
        ...dbStats,
        supply: lib.convert_to_xpi(dbStats.supply),
        burned: lib.convert_to_xpi(dbStats.burned)
      },
      dista: dbDistribution.t_1_25,
      distb: dbDistribution.t_26_50,
      distc: dbDistribution.t_51_75,
      distd: dbDistribution.t_76_100,
      diste: dbDistribution.t_101plus,
      show_dist: settings.richlist.distribution,
      show_received: settings.richlist.received,
      show_balance: settings.richlist.balance,
    });
  } catch (e: any) {
    console.log(`/richlist: ${settings.coin}: ${e.message}`);
    return route_get_index(res, `Richlist not found for coin ${settings.coin}`);
  }
});
router.get('/charts', async (req, res) => {
  if (!settings.display.charts) {
    return route_get_index(res, null);
  }
  try {
    const dbCharts = await db.get_charts();
    return res.render('charts', {
      active: 'charts',
      ...dbCharts
    });
  } catch (e: any) {
    console.log(`/charts: ${e.message}`);
    return route_get_index(res, `Failed to render Charts page, please contact the site admin`);
  }
});
router.get('/network', async (req, res) => {
  return res.render('network', { active: 'network' });
});
router.get('/tx/:txid', async (req, res) => {
  const { txid } = req.params;
  const renderData: {
    active: string,
    tx: Tx.Document,
    confirmations: number,
    blockcount: number
  } = {
    active: 'tx',
    tx: null,
    confirmations: settings.confirmations,
    blockcount: null
  };
  try {
    // process db tx
    const { last: blockcount } = await db.get_stats(settings.coin);
    renderData.blockcount = blockcount;
    const dbTx = await db.get_tx(txid);
    if (dbTx) {
      renderData.tx = dbTx;
      return res.render('tx', renderData);
    }
    // check mempool for tx
    const mempool = await lib.get_rawmempool();
    // if tx isn't there either, assume invalid
    if (!mempool.includes(txid)) {
      return route_get_index(res, `Transaction not found: ${txid}`);
    }
    // process mempool tx
    const tx = await lib.get_rawtransaction(txid);
    const { vin } = await lib.prepare_vin(tx);
    const { vout } = await lib.prepare_vout(tx.vout);
    const fee = await lib.calculate_fee(vout, vin);
    renderData.tx = {
      txid: tx.txid,
      size: tx.size,
      timestamp: tx.time,
      blockhash: '-',
      fee: fee,
      vin: vin,
      vout: vout,
      blockindex: null
    };
    renderData.blockcount = -1;
    return res.render('tx', renderData);
  } catch (e: any) {
    console.log(`/tx/${txid}: ${e.message}`);
    return route_get_index(res, `Transaction not found: ${txid}`);
  }
});
router.get('/block/:blockhash', async (req, res) => {
  const { blockhash } = req.params;
  // process height
  const height = Number(blockhash);
  if (!isNaN(height)) {
    const hash = await lib.get_blockhash(height);
    return res.redirect(`/block/${hash}`);
  }
  try {
    const block = await lib.get_block(blockhash);
    const renderData: {
      active: string,
      confirmations: number,
      blockInfo: BlockInfo,
      blockDocument: Block.Document,
      blockcount: number,
      txs: Tx.Document[] | string
    } = {
      active: 'block',
      confirmations: settings.confirmations,
      blockInfo: block,
      blockDocument: null,
      blockcount: null,
      txs: null
    };
    // process block
    switch (true) {
      // something went wrong with RPC call
      case block instanceof Error:
        throw <any>block as Error;
      // genesis block handler
      case blockhash === settings.genesis_block:
        renderData.txs = 'GENESIS';
        renderData.blockDocument = {
          height: block.height,
          minedby: '-',
          timestamp: block.time,
          localeTimestamp: new Date(block.time * 1000)
            .toLocaleString('en-us', { timeZone:"UTC" }),
          difficulty: block.difficulty,
          size: block.size,
          fees: 0,
          burned: 0,
          txcount: block.nTx
        };
        return res.render('block', renderData);
      // default block render
      default:
        const dbBlock = await db.get_block(block.height);
        const stats = await db.get_stats(settings.coin);
        renderData.txs = await db.get_txs(block.tx);
        renderData.blockcount = stats.last;
        renderData.blockDocument = {
          ...dbBlock,
          burned: lib.convert_to_xpi(dbBlock.burned)
        };
        return res.render('block', renderData);
    }
  } catch (e: any) {
    console.log(`/block/${blockhash}: ${e.message}`);
    return route_get_index(res, `Block not found: ${blockhash}`);
  }
});
router.get('/address/:address', async (req, res) => {
  const { address } = req.params;
  const { isvalid } = await lib.validate_address(address);
  if (!isvalid) {
    return route_get_index(res, `Address is invalid: ${address}`);
  }
  const renderData = {
    active: 'address',
    address: {
      a_id: address,
      balance: 0,
      received: 0,
      sent: 0
    },
    txs: []
  }
  try {
    const dbAddress = await db.get_address(address);
    if (!dbAddress) {
      return res.render('address', renderData);
    }
    return res.render('address', {
      ...renderData,
      address: dbAddress,
    });
  } catch (e: any) {
    console.log(`route_get_address: ${address}: ${e.message}`);
    return route_get_index(res, `Address not found: ${address}`);
  }
});
router.get('/qr/:string', async (req, res) => {
  const { string } = req.params;
  if (string) {
    const address = qr.image(string, {
      type: 'png',
      size: 4,
      margin: 1,
      ec_level: 'H'
    });
    res.type('png');
    return address.pipe(res);
  }
});
router.get('/ext/summary', async (req, res) => {
  try {
    const difficulty = await lib.get_difficulty();
    const hashrate = await lib.get_hashrate();
    const connections = await lib.get_connectioncount();
    const blockcount = await lib.get_blockcount();
    const mempool = await lib.get_mempoolinfo();
    const dbStats = await db.get_stats(settings.coin);
    return res.send({ data: [{
      difficulty: difficulty,
      supply: lib.convert_to_xpi(dbStats.supply),
      burned: lib.convert_to_xpi(dbStats.burned),
      hashrate: hashrate,
      // lastPrice: dbStats.last_price,
      connections: connections,
      blockcount: blockcount,
      mempoolinfo: mempool
    }]});
  } catch (e: any) {
    console.log(`/ext/summary: ${e.message}`);
    return res.send({ error: `failed to fetch summary data` });
  }
});
router.post('/search', async (req, res) => {
  const search = String(req.body.search).trim();
  if (!search) {
    return route_get_index(res, locale.ex_search_error + search);
  }
  // process block height
  const height = Number(search);
  if (!isNaN(height)) {
    const blockhash = await lib.get_blockhash(height);
    return res.redirect(`/block/${blockhash}`);
  }
  // process block/tx
  if (search.length == 64) {
    const block = await lib.get_block(search);
    if (block?.hash) {
      return res.redirect(`/block/${block.hash}`);
    }
    // check db/mempool for tx
    const dbTx = await db.get_tx(search);
    const mempool = await lib.get_rawmempool();
    if (dbTx?.txid || mempool.includes(search)) {
      return res.redirect(`/tx/${search}`);;
    }
  }
  // process address
  const address = await db.get_address(search);
  if (address?.a_id) {
    return res.redirect(`/address/${address.a_id}`);
  }
  return route_get_index(res, locale.ex_search_error + search);
});

export default router;
