import express, { Response } from 'express';
import qr from 'qr-image';
import { Address } from '@abcpros/bitcore-lib-xpi';
import chronikRouter from './chronik';
import {
  Chronik
} from '../lib/chronik';
import {
  Database,
  is_locked
} from '../lib/database';
import {
  Explorer,
  BlockInfo
} from '../lib/explorer';
import {
  toXPI
} from '../lib/util';
import * as Block from '../models/block';
import * as Tx from '../models/tx';
import settings from '../lib/settings';
import locale from '../lib/locale';

const db = new Database()
  , lib = {
    explorer: new Explorer(),
    chronik: new Chronik(
      `http://${settings.chronik.host}:` +
      `${settings.chronik.port}` +
      `${settings.chronik.uri}`
    )
};
/*
 *
 *      Handler Functions
 * 
 */
const ajaxParamTypeConverter = (params: any) => {
  return {
    start: Number(params.start),
    length: Number(params.length),
    draw: Number(params.draw),
  };
};
/**
 * Render the main index page, optionally with a warning/error
 * @param res - Response instance from Express router
 * @param error - Error string to display, or null
 */
const route_get_index = async (
  res: Response,
  error: string
): Promise<void> => {
  const warning = await is_locked('index')
    ? locale.initial_index_alert
    : null;
  return res.render('index', { active: 'home', error, warning });
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
    if (!settings.display.markets) {
      return route_get_index(res, null);
    }
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
          balance: toXPI(doc.balance)
        };
      }),
      received: dbRichlist.received.map(doc => {
        return {
          ...doc,
          received: toXPI(doc.received)
        };
      }),
      stats: {
        ...dbStats,
        supply: toXPI(dbStats.supply),
        burned: toXPI(dbStats.burned)
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
router.get('/stats', async (req, res) => {
  if (!settings.display.stats) {
    return route_get_index(res, null);
  }
  try {
    const difficulty = await lib.explorer.get_difficulty();
    const hashrate = await lib.explorer.get_hashrate();
    const connections = await lib.explorer.get_connectioncount();
    const blockcount = await lib.explorer.get_blockcount();
    const mempool = await lib.explorer.get_mempoolinfo();
    const dbStats = await db.get_stats(settings.coin);
    // calculate runrate inflation
    // 
    const block = await db.get_latest_block();
    const inflation =
      ((block.subsidy - block.burned) * 720 * 365) / dbStats.supply;
    const stats = {
      difficulty,
      hashrate,
      connections,
      blockcount,
      mempool,
      inflation,
      dbStats
    };
    const dbCharts = await db.get_charts();
    return res.render('stats', {
      active: 'stats',
      stats,
      ...dbCharts,
      burnedDay_total: toXPI(dbCharts.burnedDay_total),
      burnedWeek_total: toXPI(dbCharts.burnedWeek_total),
      burnedMonth_total: toXPI(dbCharts.burnedMonth_total),
    });
  } catch (e: any) {
    console.log(`/stats: ${e.message}`);
    return route_get_index(res, `Failed to render Stats page, please contact the site admin`);
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
    const { last: blockcount } = await db.get_stats(settings.coin);
    if (settings.use_chronik) {
      const tx = await lib.chronik.txFetch(txid);
      const timestamp = tx.block?.timestamp ?? tx.timeFirstSeen;
      // No fees in coinbase tx
      const fee = tx.isCoinbase
        ? 0
        : lib.chronik.txCalculateFee(tx.inputs, tx.outputs);
      // Set default vin for coinbase tx
      const { vin } = lib.chronik.txPrepareVin(tx.inputs);
      const { vout, burned } = lib.chronik.txPrepareVout(tx.outputs);
      renderData.tx = {
        txid: txid,
        size: tx.size,
        timestamp: Number(timestamp),
        blockhash: tx.block?.hash ?? '-',
        blockindex: tx.block?.height ?? 0,
        fee: fee,
        vin: vin,
        vout: vout,
        burned: burned
      }
      renderData.blockcount = tx.block ? blockcount : -1;
      return res.render('tx', renderData);
    }
    // process db tx
    const dbTx = await db.get_tx(txid);
    if (dbTx) {
      renderData.blockcount = blockcount;
      renderData.tx = dbTx;
      return res.render('tx', renderData);
    }
    // check mempool for tx
    const mempool = await lib.explorer.get_rawmempool();
    // if tx isn't there either, assume invalid
    if (!mempool.includes(txid)) {
      return route_get_index(res, `Transaction not found: ${txid}`);
    }
    // process mempool tx
    const tx = await lib.explorer.get_rawtransaction(txid);
    const { vin } = await lib.explorer.prepare_vin(tx);
    const { vout, burned } = await lib.explorer.prepare_vout(tx.vout);
    const fee = await lib.explorer.calculate_fee(vout, vin);
    renderData.tx = {
      txid: tx.txid,
      size: tx.size,
      timestamp: tx.time,
      blockhash: '-',
      fee: fee,
      vin: vin,
      vout: vout,
      blockindex: 0,
      burned: burned
    };
    renderData.blockcount = -1;
    return res.render('tx', renderData);
  } catch (e: any) {
    console.log(`/tx/${txid}: ${e.message}`);
    return route_get_index(res, `Transaction not found: ${txid}`);
  }
});
router.get('/block/:hashOrHeight', async (req, res) => {
  const { hashOrHeight } = req.params;
  try {
    // process height
    const height = Number(hashOrHeight);
    if (!isNaN(height)) {
      const blockhash = await lib.explorer.get_blockhash(height);
      return res.redirect(`/block/${blockhash}`);
    }
    // process hash
    const block = await lib.explorer.get_block(hashOrHeight);
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
      case hashOrHeight === settings.genesis_block:
        renderData.txs = 'GENESIS';
        renderData.blockDocument = {
          height: block.height,
          hash: settings.genesis_block,
          minedby: '-',
          timestamp: block.time,
          localeTimestamp: new Date(block.time * 1000)
            .toLocaleString('en-us', { timeZone:"UTC" }),
          difficulty: block.difficulty,
          size: block.size,
          fees: 0,
          subsidy: 0,
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
          burned: toXPI(dbBlock.burned)
        };
        return res.render('block', renderData);
    }
  } catch (e: any) {
    console.log(`/block/${hashOrHeight}: ${e.message}`);
    return route_get_index(res, `Block not found: ${hashOrHeight}`);
  }
});
router.get('/address/:address', async (req, res) => {
  const { address } = req.params;
  if (!Address.isValid(address)) {
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
    console.log(`/address/${address}: ${e.message}`);
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
router.post('/search', async (req, res) => {
  const search: string = String(req.body.search).trim();
  try {
    if (!search) {
      throw new Error(`undefined search body`);
    }
    // process block height
    const height = Number(search);
    if (!isNaN(height)) {
      const blockhash = await lib.explorer.get_blockhash(height);
      return res.redirect(`/block/${blockhash}`);
    }
    // process block/tx
    if (search.length == 64) {
      const block = await lib.explorer.get_block(search);
      if (block?.hash) {
        return res.redirect(`/block/${block.hash}`);
      }
      // check db/mempool for tx
      const dbTx = await db.get_tx(search);
      const mempool = await lib.explorer.get_rawmempool();
      if (dbTx?.txid || mempool.includes(search)) {
        return res.redirect(`/tx/${search}`);;
      }
    }
    // process db address
    const address = await db.get_address(search);
    if (address?.a_id) {
      return res.redirect(`/address/${address.a_id}`);
    }
    // show the address page if address is valid
    if (Address.isValid(search)) {
      return res.redirect(`/address/${search}`);
    }
  } catch (e: any) {
    console.log(`/search: ${search}: ${e.message}`);
    return route_get_index(res, locale.ex_search_error + search);
  }
});
/*
 *
 *      Extended API
 * 
 */
router.get('/ext/getmoneysupply', async (req, res) => {
  const stats = await db.get_stats(settings.coin);
  const supplyXPI = toXPI(stats.supply)
  return res.send(` ${supplyXPI}`);
});
router.get('/ext/getburnedsupply', async (req, res) => {
  const stats = await db.get_stats(settings.coin);
  const burnedXPI = toXPI(stats.burned);
  return res.send(` ${burnedXPI}`);
});
router.get('/ext/getaddress/:address', async (req, res) => {
  const dataTableRows: Array<{
    txid: string,
    type: string
  }> = [];
  const { address } = req.params;
  try {
    const { sent, received, balance } = await db.get_address(address);
    const { txs } = await db.get_address_txs_ajax(address, 0, settings.txcount);
    txs.forEach(tx => {
      const value = { vin: 0, vout: 0 };
      value.vin += tx.vin?.find(vin => vin.addresses == address)?.amount ?? 0;
      value.vout += tx.vout?.find(vout => vout.addresses == address)?.amount ?? 0;
      const type = value.vin > value.vout ? 'vin': 'vout';
      dataTableRows.push({ txid: tx.txid, type });
    });
    return res.send({
      address,
      sent: toXPI(sent),
      received: toXPI(received),
      balance: toXPI(balance),
      last_txs: dataTableRows
    });
  } catch (e: any) {
    console.log(`/ext/getaddress/${address}: ${e.message}`);
    return res.send({ error: 'address not found', address });
  }
});
router.get('/ext/gettx/:txid', async (req, res) => {
  const { txid } = req.params;
  try {
    // process db tx
    const dbTx = await db.get_tx(txid);
    if (dbTx) {
      return res.send(dbTx);
    }
    // check mempool for tx
    // if tx isn't there either, assume invalid
    const mempool = await lib.explorer.get_rawmempool();
    if (!mempool.includes(txid)) {
      throw new Error(`non-database tx not found in mempool: ${txid}`);
    }
    // process mempool tx
    const tx = await lib.explorer.get_rawtransaction(txid);
    const { vin } = await lib.explorer.prepare_vin(tx);
    const { vout, burned } = await lib.explorer.prepare_vout(tx.vout);
    const fee = await lib.explorer.calculate_fee(vout, vin);
    const { time: timestamp, size, blockhash } = tx;
    return res.send({
      _id: null,
      txid,
      size,
      timestamp,
      blockhash,
      fee,
      vin,
      vout,
      blockindex: 0,
      burned
    });
  } catch (e: any) {
    console.log(`/ext/gettx/${txid}: ${e.message}`);
    return res.send({ error: `tx not found`, txid });
  }
});
router.get('/ext/getbalance/:address', async (req, res) => {
  const { address } = req.params;
  try {
    const dbAddress = await db.get_address(address);
    return res.send(toXPI(dbAddress.balance)
      .toString()
      .replace(/(^-+)/mg, ''));
  } catch (e: any) {
    console.log(`/ext/getbalance/${address}: ${e.message}`);
    return res.send({ error: 'address not found', address });
  }
});
router.get('/ext/getdistribution', async (req, res) => {
  try {
    const dbRichlist = await db.get_richlist(settings.coin);
    const dbStats = await db.get_stats(settings.coin);
    const dbDistribution = await db.get_distribution(dbRichlist, dbStats);
    return res.send(dbDistribution);
  } catch (e: any) {
    console.log(`/ext/getdistribution: ${e.message}`);
    return res.send({ error: `distribution for ${settings.coin} not found` });
  }
});
router.get('/ext/getlastprice/:market', async (req, res) => {
  const market = String(req.params.market);
  try {
    if (!settings.markets.enabled.includes(market)) {
      throw new Error(`market not enabled`);
    }
    const { summary: { last }} = await db.get_market(market);
    res.send({ [settings.markets.exchange.toLowerCase()]: last });
  } catch (e: any) {
    console.log(`/ext/getlastprice/${market}: ${e.message}`);
    return res.send({ error: `failed to get price from market ${market}` });
  }
});
router.get('/ext/getlastblocksajax', async (req, res) => {
  let { start, length, draw } = ajaxParamTypeConverter(req.query);
  if (!length || isNaN(length) || length > settings.index.last_txs) {
    length = settings.index.last_blocks;
  }
  if (!start || isNaN(start) || start < 0) {
    start = 0;
  }
  try {
    const rowData: Array<[number, string, number, number, number, string]> = [];
    const { blocks, count } = await db.get_last_blocks_ajax(start, length);
    blocks.forEach(block => rowData.push([
      block.height,
      block.hash,
      block.size,
      block.txcount,
      toXPI(block.burned),
      new Date((block.timestamp) * 1000).toUTCString()
    ]));
    return res.json({
      draw,
      data: rowData,
      recordsTotal: count,
      recordsFiltered: count,
    });
  } catch (e: any) {
    console.log(`/ext/getlastblocksajax: ${e.message}`);
    return res.send({ error: `failed to get last blocks via AJAX` });
  }
});
router.get('/ext/getaddresstxsajax/:address', async (req, res) => {
  let { start, length, draw } = ajaxParamTypeConverter(req.query);
  const { address }: { address: string } = req.params;
  if (!length || isNaN(length) || length > settings.index.last_txs) {
    length = settings.index.last_blocks;
  }
  if (!start || isNaN(start) || start < 0) {
    start = 0;
  }
  try {
    const rowData: Array<[string, string, number, number, number]> = [];
    const { txs, count } = await db.get_address_txs_ajax(address, start, length);
    txs.forEach(tx => {
      const value = { vin: 0, vout: 0 };
      value.vin = tx.vin?.find(vin => vin.addresses == address)?.amount ?? 0;
      value.vout = tx.vout?.find(vout => vout.addresses == address)?.amount ?? 0;
      rowData.push([
        new Date((tx.timestamp) * 1000).toUTCString(),
        tx.txid,
        value.vout,
        value.vin,
        tx.balance
      ]);
    });
    return res.json({
      draw,
      data: rowData,
      recordsTotal: count,
      recordsFiltered: count,
    });
  } catch (e: any) {
    console.log(`/ext/getaddresstxsajax/${address}: ${e.message}`);
    return res.send({ error: `failed to get last address txs via AJAX` });
  }
});
router.get('/ext/connections', async (req, res) => {
  try {
    const dbPeers = await db.get_peers();
    return res.send({ data: dbPeers });
  } catch (e: any) {
    console.log(`/ext/connections: ${e.message}`);
    return res.send({ error: `failed to get peers` });
  }
});
/*
 *
 *      Chronik API
 * 
 */
router.use('/chronik', chronikRouter);

export default router;
