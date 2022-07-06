import express from 'express';
import { Response } from 'express';
import qr from 'qr-image';
import {
  Database,
  is_locked
} from '../lib/database';
import {
  Explorer,
  BlockDocument,
  RawTransaction,
  TransactionDocument,
  BlockInfo
} from '../lib/explorer';

const settings = require('../lib/settings')
  , locale = require('../lib/locale')
  , db = new Database()
  , lib = new Explorer();
/*
 *
 *      Handler Functions
 * 
 */
const route_get_index = async (
  res: Response,
  error: string
): Promise<void> => {
  return (await is_locked('index'))
    ? res.render('index', { active: 'home', error: error, warning: locale.initial_index_alert })
    : res.render('index', { active: 'home', error: error, warning: null });
};
const route_get_address = async (
  res: Response,
  address: string
): Promise<void> => {
  const dbAddress = await db.get_address(address);
  return dbAddress
    ? res.render('address', {
        active: 'address',
        address: dbAddress,
        txs: []
      })
    : route_get_index(res, `${address} not found`);
};
const route_get_block = async (
  res: Response,
  blockhash: string
): Promise<void> => {
  // process height
  const height = Number(blockhash);
  if (!isNaN(height)) {
    const hash = await lib.get_blockhash(height);
    return res.redirect('/block/' + hash);
  }
  const renderData: {
    active: string,
    confirmations: number,
    blockcount: number,
    blockDocument: BlockDocument,
    blockInfo: BlockInfo,
    txs: TransactionDocument[] | string
  } = {
    active: 'block',
    confirmations: settings.confirmations,
    blockcount: null,
    blockDocument: null,
    blockInfo: null,
    txs: null
  };
  // process block
  switch (true) {
    // genesis block handler
    case blockhash === settings.genesis_block:
      renderData.txs = 'GENESIS';
      return res.render('block', renderData);
    // default block render
    default:
      renderData.blockInfo = await lib.get_block(blockhash);
      const { tx: txs, height } = renderData.blockInfo;
      const dbBlock = await db.get_block(height);
      const stats = await db.get_stats(settings.coin);
      renderData.blockcount = stats.last;
      renderData.txs = await db.get_txs(txs);
      renderData.blockDocument = {
        height: height,
        difficulty: dbBlock.difficulty,
        fees: dbBlock.fees,
        localeTimestamp: dbBlock.localeTimestamp,
        minedby: dbBlock.minedby,
        size: dbBlock.size,
        timestamp: dbBlock.timestamp,
        txcount: dbBlock.txcount,
        burned: lib.convert_to_xpi(dbBlock.burned)
      };
      return res.render('block', renderData);
  }

};
const route_get_charts = async (
  res: Response
): Promise<void> => {
  const dbCharts = db.get_charts();
  return dbCharts
    ? res.render('charts', {
        active: 'charts',
        ...dbCharts
      })
    : route_get_index(res, null);
};
const route_get_market = async (
  res: Response,
  market: string
): Promise<void> => {
  const dbMarket = await db.get_market(market);
  return res.render(`./markets/${market}`, {
    active: 'markets',
    marketdata: {
      coin: settings.markets.coin,
      exchange: settings.markets.exchange,
      data: dbMarket,
    },
    market: market
  });
};
const route_get_richlist = async (
  res: Response
): Promise<void> => {
  const dbStats = await db.get_stats(settings.coin);
  const dbRichlist = await db.get_richlist(settings.coin);
  if (!dbRichlist) {
    return route_get_index(res, null);
  }
  const dbDistribution = await db.get_distribution(dbRichlist, dbStats);
  return res.render('richlist', {
    active: 'richlist',
    balance: dbRichlist.balance,
    received: dbRichlist.received,
    stats: dbStats,
    dista: dbDistribution.t_1_25,
    distb: dbDistribution.t_26_50,
    distc: dbDistribution.t_51_75,
    distd: dbDistribution.t_76_100,
    diste: dbDistribution.t_101plus,
    show_dist: settings.richlist.distribution,
    show_received: settings.richlist.received,
    show_balance: settings.richlist.balance,
  });
};
const route_get_tx = async (
  res: Response,
  txid: string
): Promise<void> => {
  const renderData: {
    active: string,
    tx: TransactionDocument | RawTransaction,
    confirmations: number,
    blockcount: number
  } = {
    active: 'tx',
    tx: null,
    confirmations: settings.confirmations,
    blockcount: null
  };
  // process genesis block
  if (txid == settings.genesis_block) {
    return route_get_block(res, settings.genesis_block);
  }
  // process db tx
  const dbTx = await db.get_tx(txid);
  if (dbTx) {
    renderData.tx = dbTx;
    renderData.blockcount = await lib.get_blockcount();
    return res.render('tx', renderData);
  }
  // check mempool for tx
  // if tx isn't there either, assume invalid
  const mempool = await lib.get_rawmempool();
  if (!mempool.includes(txid)) {
    return route_get_index(res, `Transaction not found: ${txid}`);
  }
  // process mempool tx
  const tx = await lib.get_rawtransaction(txid);
  const { vin } = await lib.prepare_vin(tx);
  const { vout } = await lib.prepare_vout(tx.vout);
  const fee = await lib.calculate_fee(vout, vin);
  renderData.blockcount = await lib.get_blockcount();
  renderData.tx = {
    txid: tx.txid,
    size: tx.size,
    fee: fee,
    vin: vin,
    vout: vout,
    timestamp: tx.time,
    blockhash: tx.blockhash,
    blockindex: 0
  };
  return res.render('tx', renderData);
}
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
  // render market if it is enabled
  return settings.markets.enabled.includes(market)
    ? route_get_market(res, market)
    : route_get_index(res, null);
});
router.get('/richlist', async (req, res) => {
  if (!settings.display.richlist) {
    return route_get_index(res, null);
  }
  return route_get_richlist(res);
});
router.get('/charts', async (req, res) => {
  if (!settings.display.charts) {
    return route_get_index(res, null);
  }
  return route_get_charts(res);
});
router.get('/network', async (req, res) => {
  return res.render('network', { active: 'network' });
});
router.get('/tx/:txid', async (req, res) => {
  return route_get_tx(res, req.params.txid);
});
router.get('/block/:hash', async (req, res) => {
  return route_get_block(res, req.params.hash);
});
router.get('/address/:address', async (req, res) => {
  return route_get_address(res, req.params.address);
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
});
router.post('/search', async (req, res) => {
  const search = String(req.body);
  // process block/tx
  if (search.length == 64) {
    const block = await lib.get_block(search);
    if (block) {
      return res.redirect(`/block/${search}`);
    }
    // check db/mempool for tx
    const dbTx = await db.get_tx(search);
    const mempool = await lib.get_rawmempool();
    if (dbTx || mempool.includes(search)) {
      return res.redirect(`/tx/${search}`);;
    }
  }
  return route_get_index(res, locale.ex_search_error + search);
});

export default router;
