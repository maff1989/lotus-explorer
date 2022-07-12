import {
  connect,
  disconnect,
  PipelineStage,
} from 'mongoose';
import * as fs from 'fs/promises';
import { BlockInfo, Explorer } from './explorer';
import settings from './settings';
import {
  getChartsDifficultyAggregation,
} from './util';
import * as Address from '../models/address';
import * as AddressTx from '../models/addresstx';
import * as Block from '../models/block';
import * as Charts from '../models/charts';
import * as Markets from '../models/markets';
import * as Peers from '../models/peers';
import * as Richlist from '../models/richlist';
import * as Stats from '../models/stats';
import * as Tx from '../models/tx';

const lib = new Explorer();
/*
set('useCreateIndex', true);
set('useUnifiedTopology', true);
set('useNewUrlParser', true);
set('useFindAndModify', false);
*/

type SupplyDistributionTier =
  't_1_25'
  | 't_26_50'
  | 't_51_75'
  | 't_76_100'
  | 't_101plus';
type SupplyDistribution = {
  [tier in SupplyDistributionTier]: {
    percent: number,
    total: number
  }
};
type ChartTransactionTimespan = 'day' | 'week' | 'month';
type ChartDifficultyTimespan = 'week' | 'month' | 'quarter' | 'year';
type ChartDistributionTimespan = 'day' | 'week';
const TIMESPANS: {
  [timespan: string]: number
} = {
  day: 86400,
  week: 604800,
  month: 2592000,
  quarter: 7776000,
};
const BLOCKSPANS: {
  [blockspan: string]: number
} = {
  day: 720,
  week: 5040,
  month: 21900,
  quarter: 65700,
  year: 262800
};
const save_tx = async (txid: string, height: number) => {
  const tx = await lib.get_rawtransaction(txid);
  const { vin } = await lib.prepare_vin(tx);
  const { vout, burned } = await lib.prepare_vout(tx.vout);
  const total = await lib.calculate_total(vout);
  const fee = await lib.calculate_fee(vout, vin);
  // update vins
  for (const input of vin) {
    const { addresses, amount } = input;
    try {
      await update_address(addresses, amount, height, txid, 'vin');
    } catch (e: any) {
      throw new Error(`save_tx: update_address: vin ${input.addresses}: ${e.message}`);
    }
  }
  // update vouts
  for (const output of vout) {
    const { addresses, amount } = output;
    const type = { output: '' };
    // only update if address is not an OP_RETURN with a value > 0
    if (amount > 0 && !addresses.includes("OP_RETURN")) {
      type.output = 'vout';
    }
    // if sending to itself, don't add output to "Total Received" for this address
    if (vin.find(input => input.addresses == addresses)) {
      type.output = 'toSelf';
    }
    try {
      await update_address(addresses, amount, height, txid, type.output);
    } catch (e: any) {
      throw new Error(`save_tx: update_address: vout ${addresses}: ${e.message}`);
    }
  }
  // save Tx
  const newTx = new Tx.Model({
    txid: tx.txid,
    vin,
    vout,
    fee,
    size: tx.size,
    total: total.toFixed(6),
    timestamp: tx.time,
    localeTimestamp: new Date(tx.time * 1000).toLocaleString('en-us', { timeZone:"UTC" }),
    blockhash: tx.blockhash,
    blockindex: height,
  });
  try {
    await newTx.save();
  } catch (e: any) {
    throw new Error(`save_tx: newTx.save: ${e.message}`);
  }
  return { burned };
};
const save_block = async (
  block: BlockInfo,
  txburned: number
): Promise<void> => {
  try {
    const { blockFees, blockFeesBurned } = await lib.get_block_fees(block.height);
    const totalFeesBurned = blockFeesBurned + txburned;
    // gather minedby address
    const coinbaseTx = await lib.get_rawtransaction(block.tx[0]);
    const miner = coinbaseTx.vout[1].scriptPubKey.addresses[0];
    // save block
    const newBlock = new Block.Model({
      height: block.height,
      minedby: miner,
      //hash: block.hash,
      difficulty: block.difficulty,
      timestamp: block.time,
      localeTimestamp: new Date(block.time * 1000).toLocaleString('en-us', { timeZone:"UTC" }),
      size: block.size,
      fees: blockFees,
      burned: totalFeesBurned,
      txcount: block.nTx
    });
    await newBlock.save();
  } catch (e: any) {
    throw new Error(`save_block: failed to save new block to db: ${e.message}`);
  }
  return;
};
const update_address = async (
  address: string,
  amount: number,
  blockheight: number,
  txid: string,
  type: string
): Promise<void> => {
  const addr_inc = { sent: 0, balance: 0, received: 0 };
  if (address == 'coinbase') {
    addr_inc.sent = amount;
  } else {
    switch (type) {
      // used during vout processing to undo below vin case
      case 'toSelf':
        addr_inc.sent = -amount;
        addr_inc.balance = amount;
        break;
      // increment sent and deduct from balance
      case 'vin':
        addr_inc.sent = amount;
        addr_inc.balance = -amount;
        break;
      // increment received/balance
      default:
        addr_inc.received = amount;
        addr_inc.balance = amount;
        break;
    }
    try {
      await AddressTx.Model.findOneAndUpdate(
        { a_id: address, txid: txid },
        { $inc: {
          amount: addr_inc.balance
        }, $set: {
          a_id: address,
          blockindex: blockheight,
          txid: txid
        }},
        { new: true, upsert: true }
      );
    } catch (e: any) {
      throw new Error(`update_address: ${address}: ${txid}: ${e.message}`);
    };
  }
  try {
    await Address.Model.findOneAndUpdate(
      { a_id: address },
      { $inc: addr_inc },
      { new: true, upsert: true },
    );
  } catch (e: any) {
    throw new Error(`update_address: ${address}: ${e.message}`);
  }
  return;
};

const rewind_update_address = async (
  address: string,
  amount: number,
  type: string
): Promise<void> => {
  const addr_inc = { sent: 0, balance: 0, received: 0 };
  switch (type) {
    case 'rewind-vin':
      addr_inc.sent = -amount
      addr_inc.balance = amount;
      break;
    case 'rewind-vout':
      addr_inc.received = -amount;
      addr_inc.balance = -amount;
      break;
    case 'rewind-toSelf':
      addr_inc.sent = amount;
      addr_inc.balance = -amount;
      break;
  }
  try {
    const newAddress = await Address.Model.findOneAndUpdate(
      { a_id: address },
      { $inc: addr_inc },
      { new: true }
    );
    // delete address if sent, received, and balance are all 0
    if (
      newAddress.sent == 0
      && newAddress.received == 0
      && newAddress.balance == 0
    ) {
      await Address.Model.deleteOne({ a_id: address });
    }
  } catch (e: any) {
    throw new Error(`rewind_update_address(${address}, ${amount}, ${type}): ${e.message}`);
  }
};

const rewind_save_tx = async (
  tx: Tx.Document,
  height: number
) => {
  const { txid, vin, vout, } = tx;
  // rewind vins
  for (const input of vin) {
    const { addresses, amount } = input;
    // skip coinbase input
    if (addresses == 'coinbase') {
      continue;
    }
    try {
      await rewind_update_address(addresses, amount, 'rewind-vin');
    } catch (e: any) {
      throw new Error(`rewind_save_tx: rewind_update_address: vin ${addresses}: ${e.message}`);
    }
  }
  // rewind vouts
  for (const output of vout) {
    const type = { output: 'rewind-vout' };
    const { addresses, amount } = output;
    // skip all OP_RETURN outputs
    if (addresses.includes("OP_RETURN")) {
      continue;
    }
    if (vin.find(input => input.addresses == addresses)) {
      type.output = 'rewind-toSelf';
    }
    try {
      await rewind_update_address(addresses, amount, type.output);
    } catch (e: any) {
      throw new Error(`rewind_save_tx: rewind_update_address: vout ${addresses}: ${e.message}`);
    }
  }
  // Delete Tx and AddressTx entry for txid after rewinding all address updates
  try {
    await Tx.Model.deleteOne({ txid: txid });
    await AddressTx.Model.deleteMany({ txid: txid });
  } catch (e: any) {
    throw new Error(`rewind_save_tx:: Tx/AddressTx.Model.deleteOne(${txid}): ${e.message}`);
  }
};
const get_market_data = async (market: string) => {
  const exMarket = await import('./lib/markets/' + market + '.ts');
  exMarket.get_data();
};
export const create_lock = async (lockfile: string): Promise<boolean> => {
  if (settings.lock_during_index == true) {
    const fileName = './tmp/' + lockfile + '.pid';
    try {
      await fs.appendFile(fileName, process.pid.toString());
      return true;
    } catch (e: any) {
      console.log("Error: unable to create %s", fileName);
      process.exit(1);
    }
  }
  return false;
};
export const remove_lock = async (lockfile: string): Promise<boolean> => {
  if (settings.lock_during_index == true) {
    const fileName = './tmp/' + lockfile + '.pid';
    try {
      await fs.unlink(fileName);
      return true;
    } catch (e: any) {
      console.log("unable to remove lock: %s", fileName);
      process.exit(1);
    }
  }
  return false;
};
export const is_locked = async (lockfile: string): Promise<boolean> => {
  if (settings.lock_during_index == true) {
    const fileName = './tmp/' + lockfile + '.pid';
    try {
      await fs.access(fileName);
      return true;
    } catch (e: any) {
      return false;
    }
  }
  return false;
};
/**
 * 
 *  Database module
 * 
 */
export class Database {
  private dbString = 'mongodb://' + settings.dbsettings.user
  + ':' + settings.dbsettings.password
  + '@' + settings.dbsettings.address
  + ':' + settings.dbsettings.port
  + '/' + settings.dbsettings.database;

  /*
   *    Database Connectivity
   */
  async connect() {
    try {
      await connect(this.dbString);
    } catch (e: any) {
      throw new Error(`Database.connect: ${this.dbString}: ${e.message}`);
    }
  };

  async disconnect() {
    try {
      await disconnect();
    } catch (e: any) {
      throw new Error(`Database.disconnect: ${this.dbString}: ${e.message}`);
    }
  };

  /*
   *    Create Database Entries
   */
  async create_market(
    coin: string,
    market: string
  ): Promise<Markets.Document> {
    try {
      const create = new Markets.Model({
        coin,
        market
      });
      return await create.save();
    } catch (e: any) {
      throw new Error(`Database.create_market: ${e.message}`);
    }
  };
  
  async create_peer(params: Peers.Document): Promise<Peers.Document> {
    try {
      const peer = new Peers.Model(params);
      return await peer.save();
    } catch (e: any) {
      throw new Error(`Database.create_peer: ${e.message}`);
    }
  };

  async create_richlist(coin: string): Promise<Richlist.Document> {
    try {
      const richlist = new Richlist.Model({ coin: coin, received: [], balance: [] });
      return await richlist.save();
    } catch (e: any) {
      throw new Error(`Database.create_richlist: ${e.message}`);
    }
  };

  async create_stats(coin: string): Promise<Stats.Document> {
    try {
      const create = new Stats.Model({
        coin: coin,
        count: 0,
        last: 0,
        supply: 0,
        burned: 0,
        connections: 0,
      });
      return await create.save();
    } catch (e: any) {
      throw new Error(`Database.create_stats: ${e.message}`);
    }
  };

  async create_txs(block: BlockInfo): Promise<{
    txburned: number
  }> {
    const { height, tx } = block;
    const burned = { total: 0 };
    for (const txid of tx) {
      console.log('%s: %s', height, txid);
      try {
        const { burned: txBurned } = await save_tx(txid, height);
        burned.total += txBurned;
      } catch (e: any) {
        throw new Error(`Database.create_txs: ${height}: ${txid}: ${e.message}`);
      }
    }
    return { txburned: burned.total };
  };

  /*
   *
   *    Check Database Entries
   *
   */
  async check_market(market: string): Promise<Markets.Document> {
    try {
      // returns either full document or null
      return await Markets.Model.findOne({ market: market }).lean();
    } catch (e: any) {
      return null;
    }
  };

  async check_richlist(coin: string): Promise<Richlist.Document> {
    try {
      // returns either full document or null
      return await Richlist.Model.findOne({ coin: coin }).lean();
    } catch (e: any) {
      return null;
    }
  };

  async check_stats(coin: string): Promise<Stats.Document> {
    try {
      // returns either full document or null
      return await Stats.Model.findOne({ coin: coin }).lean();
    } catch (e: any) {
      return null;
    }
  };

  /*
   *
   *    Get Database Entries
   * 
   */
  async get_address(hash: string): Promise<Address.Document> {
    try {
      return await Address.Model.findOne({ a_id: hash }).lean();
    } catch (e: any) {
      throw new Error(`Database.get_address: ${e.message}`);
    }
  };

  async get_block(height: number): Promise<Block.Document> {
    try {
      return await Block.Model.findOne({ height: height }).lean();
    } catch (e: any) {
      throw new Error(`Database.get_block: ${e.message}`);
    }
  };

  async get_latest_block(): Promise<Block.Document> {
    try {
      const result = await Block.Model.find()
        .sort({ timestamp: -1 })
        .limit(1);
      return <Block.Document>result.pop();
    } catch (e: any) {
      throw new Error(`Database.get_latest_block: ${e.message}`);
    }
  };

  // Polls the Charts db for latest aggregate data
  async get_charts(): Promise<Charts.Document> {
    try {
      return await Charts.Model.findOne().lean();
    } catch (e: any) {
      return null;
    }
  };

  async get_distribution(
    richlist: Richlist.Document,
    stats: Stats.Document
  ): Promise<SupplyDistribution> {
    const distribution = {
      t_1_25: { percent: 0, total: 0 },
      t_26_50: { percent: 0, total: 0 },
      t_51_75: { percent: 0, total: 0 },
      t_76_100: { percent: 0, total: 0 },
      t_101plus: { percent: 0, total: 0 }
    };
    for (let i = 0; i < richlist.balance.length; i++) {
      const addressDoc = richlist.balance[i];
      const addressBalanceXpi = lib.convert_to_xpi(addressDoc.balance);
      const supplyXPI = lib.convert_to_xpi(stats.supply);
      const count = i + 1;
      const percent = (addressBalanceXpi / supplyXPI) * 100;
      switch (true) {
        case count <= 25:
          distribution.t_1_25.percent = distribution.t_1_25.percent + percent;
          distribution.t_1_25.total = distribution.t_1_25.total + addressBalanceXpi;
          break;
        case count <= 50:
          distribution.t_26_50.percent = distribution.t_26_50.percent + percent;
          distribution.t_26_50.total = distribution.t_26_50.total + addressBalanceXpi;
          break;
        case count <= 75:
          distribution.t_51_75.percent = distribution.t_51_75.percent + percent;
          distribution.t_51_75.total = distribution.t_51_75.total + addressBalanceXpi;
          break;
        case count <= 100:
          distribution.t_76_100.percent = distribution.t_76_100.percent + percent;
          distribution.t_76_100.total = distribution.t_76_100.total + addressBalanceXpi;
          break;
      }
    }
    const t_101plus_percent = 100
      - distribution.t_76_100.percent
      - distribution.t_51_75.percent
      - distribution.t_26_50.percent
      - distribution.t_1_25.percent;
    const t_101plus_total = stats.supply
      - distribution.t_76_100.total
      - distribution.t_51_75.total
      - distribution.t_26_50.total
      - distribution.t_1_25.total;
    distribution.t_101plus.percent = parseFloat(t_101plus_percent.toFixed(2));
    distribution.t_101plus.total = parseFloat(t_101plus_total.toFixed(6));
    distribution.t_1_25.percent = parseFloat(distribution.t_1_25.percent.toFixed(2));
    distribution.t_1_25.total = parseFloat(distribution.t_1_25.total.toFixed(6));
    distribution.t_26_50.percent = parseFloat(distribution.t_26_50.percent.toFixed(2));
    distribution.t_26_50.total = parseFloat(distribution.t_26_50.total.toFixed(6));
    distribution.t_51_75.percent = parseFloat(distribution.t_51_75.percent.toFixed(2));
    distribution.t_51_75.total = parseFloat(distribution.t_51_75.total.toFixed(6));
    distribution.t_76_100.percent = parseFloat(distribution.t_76_100.percent.toFixed(2));
    distribution.t_76_100.total = parseFloat(distribution.t_76_100.total.toFixed(6));
    return distribution;
  };

  async get_market(market: string) {
    try {
      return await Markets.Model.findOne({ market: market }).lean();
    } catch (e: any) {
      throw new Error(`Database.get_market: ${e.message}`);
    }
  };

  async get_peer(address: string): Promise<Peers.Document> {
    try {
      return await Peers.Model.findOne({ address: address }).lean();
    } catch (e: any) {
      throw new Error(`Database.get_peer: ${e.message}`);
    }
  };

  async get_peers(): Promise<Peers.Document[]> {
    try {
      return await Peers.Model.find({}).lean();
    } catch (e: any) {
      throw new Error(`Database.get_peers: ${e.message}`);
    }
  }
  
  async get_richlist(coin: string): Promise<Richlist.Document> {
    try {
      return await Richlist.Model.findOne({ coin: coin }).lean();
    } catch (e: any) {
      throw new Error(`Database.get_richlist: ${e.message}`);
    }    
  };
  
  async get_stats(coin: string): Promise<Stats.Document> {
    try {
      return await Stats.Model.findOne({ coin: coin }).lean();
    } catch (e: any) {
      throw new Error(`Database.get_stats: ${e.message}`);
    }
  };
  
  async get_tx(txid: string): Promise<Tx.Document> {
    try {
      return await Tx.Model.findOne({ txid: txid }).lean();
    } catch (e: any) {
      throw new Error(`Database.get_tx: ${e.message}`);
    }
  };

  async get_txs(txids: string[]) {
    const txs: Tx.Document[] = [];
    for (const txid of txids) {
      try {
        const tx = await this.get_tx(txid);
        txs.push(tx);
      } catch (e: any) {
        // couldn't find txid in db
        throw new Error(
          e.message
          + ` -- data for txid ${txid} didn't save to db?`
        );
      }
    }
    return txs;
  };

  /*
   *
   *    Get AJAX Entries
   * 
   */
  async get_last_blocks_ajax(
    start: number,
    length: number
  ) {
    const data: {
      blocks: Block.Document[],
      count: number
    } = { blocks: [], count: 0 };
    try {
      const stats = await Stats.Model.findOne();
      data.blocks = await Block.Model.aggregate([
        { $sort: { height: -1 }},
        { $skip: start },
        { $limit: length }
      ]);
      data.count = stats.last;
      return data;
    } catch (e: any) {
      throw new Error(`get_last_blocks_ajax: failed to poll blocks collection: ${e.message}`);
    }
  };

  async get_address_txs_ajax(
    address: string,
    start: number,
    length: number
  ) {
    const data: {
      txs: Tx.Document[],
      count: number
    } = { txs: [], count: 0 };
    try {
      const { balance } = await Address.Model.findOne({ a_id: address }) || { balance: 0 };
      data.count= await AddressTx.Model.find({ a_id: address }).count();
      // return default data if no db entries for address
      if (data.count < 1) {
        return data;
      }
      const addressTxs: AddressTx.Document[] = await AddressTx.Model
        .find({ a_id: address })
        .sort({ blockindex: -1 })
        .sort({ amount: 1 })
        .skip(start)
        .limit(length);
      let runningBalance = balance ?? 0;
      for (const addressTx of addressTxs) {
        const tx = await this.get_tx(addressTx.txid);
        data.txs.push({
          txid: tx.txid,
          timestamp: tx.timestamp,
          vin: tx.vin,
          vout: tx.vout,
          balance: runningBalance
        } as Tx.Document);
        runningBalance -= addressTx.amount;
      }
      return data;
    } catch (e: any) {
      throw new Error(`get_address_txs_ajax: failed to poll addresstxs collection: ${e.message}`);
    }
  };

  /*
   *
   *    Get Database Charts
   * 
   */
  async get_charts_difficulty(
    timespan: ChartDifficultyTimespan
  ): Promise<{
    plot: Charts.PlotData
  }> {
    const seconds = TIMESPANS[timespan];
    const data: {
      plot: Charts.PlotData
    } = { plot: [] };
    try {
      const dbBlock = await this.get_latest_block();
      const agg: PipelineStage[] = [
        { '$match': {
          'timestamp': { '$gte': (dbBlock.timestamp - seconds) }
        }},
        { "$sort": {"timestamp": 1} },
        //{ "$limit": blockspan },
        { "$group": {
          _id: null,
          "blocks": { $push: { t: "$localeTimestamp", d: "$difficulty" } }
        }},
      ];
      // filter agg results depending on blockspan to reduce data load
      agg.push(getChartsDifficultyAggregation[timespan]);
      const result: Array<{
        blocks: Array<{
          localeTimestamp: string,
          difficulty: number
        }>
      }> = await Block.Model.aggregate(agg);
      data.plot = result[0].blocks.map((block) => Object.values(block));
      return data;
    } catch (e: any) {
      throw new Error(`Database.get_charts_difficulty(${timespan}): ${e.message}`);
    }
  };
  
  async get_charts_reward_distribution(
    timespan: ChartDistributionTimespan
  ): Promise<{
    plot: Charts.PlotData,
    minerTotal: number
  }> {
    const seconds = TIMESPANS[timespan];
    const blockspan = BLOCKSPANS[timespan];
    const data: {
      plot: Charts.PlotData,
      minerTotal: number
    } = { plot: [], minerTotal: 0 };
    try {
      const dbBlock = await this.get_latest_block();
      const result: Array<{
        _id: null,
        blocks: Array<{ minedby: string }>
      }> = await Block.Model.aggregate([
        { '$match': {
          'timestamp': { '$gte': (dbBlock.timestamp - seconds) }
        }},
        //{ "$sort": {"timestamp": 1} },
        //{ "$limit": blockspan },
        { "$group": {
          _id: null,
          "blocks": { $push: { minedby: "$minedby" } }
        }},
      ]);
      const minerBlockCounts: { [minedby: string]: number } = {};
      result[0].blocks.forEach((block) => {
        minerBlockCounts[block.minedby] !== undefined
          ? minerBlockCounts[block.minedby]++
          : minerBlockCounts[block.minedby] = 1
      });
  
      let minerMiscBlocks = 0;
      const minerFiltered: { [minedby: string]: number } = {};
      for (const [minedby, blockCount] of Object.entries(minerBlockCounts)) {
        blockCount > Math.floor(0.03 * blockspan)
          ? minerFiltered[minedby] = blockCount
          : minerMiscBlocks += blockCount;
      }
  
      const plot = Object.entries(minerFiltered).sort((a, b) => b[1] - a[1]);
      data.plot.push(["Miscellaneous Miners (<= 3% hashrate each)", minerMiscBlocks]);
      data.minerTotal = Object.keys(minerBlockCounts).length;
      return data;
    } catch (e: any) {
      throw new Error(`Database.get_charts_reward_distribution(${timespan}): ${e.message}`);
    }
  };

  // gather and prepare chart data for transaction count based on timespan
  async get_charts_txs(
    timespan: ChartTransactionTimespan
  ): Promise<{
    plot: Charts.PlotData,
    txTotal: number
  }> {
    const seconds = TIMESPANS[timespan];
    const data: {
      plot: Charts.PlotData,
      txTotal: number
    } = { plot: [], txTotal: 0 };
    try {
      const dbBlock = await this.get_latest_block();
      const [{ blocks, txtotal }] = await Block.Model.aggregate([
        { '$match': {
          'timestamp': { '$gte': (dbBlock.timestamp - seconds) },
          'txcount': { $gt: 1 } 
        }},
        { "$sort": { "timestamp": 1 } },
        //{ "$limit": blockspan },
        { "$group":
          {
            _id: null,
            "blocks": {
              $push: {
                localeTimestamp: "$localeTimestamp",
                txcount: {
                  $subtract: ["$txcount", 1] 
                }
              }
            },
            // add together all txcount minus 1; we don't include coinbase tx in count
            'txtotal': {
              $sum: {
                $subtract: ["$txcount", 1] 
              }
            }
          }
        },
      ]);
      const arranged_data: { [x: string]: number } = {};
      blocks.forEach((block: Block.Document) => {
        arranged_data[block.localeTimestamp] = block.txcount;
      });
      data.plot = Object.entries(arranged_data);
      data.txTotal = txtotal;
      return data;
    } catch (e: any) {
      throw new Error(`Database.get_charts_txs(${timespan}): ${e.message}`);
    }
  };
  
  /*
   *
   *    Update Database Entries
   * 
   */

  async update_charts_db(): Promise<void> {
    try {
      // Transaction Charts
      const { plot: txsDay, txTotal: txsDay_count } = await this.get_charts_txs('day');
      const { plot: txsWeek, txTotal: txsWeek_count } = await this.get_charts_txs('week');
      const { plot: txsMonth, txTotal: txsMonth_count } = await this.get_charts_txs('month');
      // Reward Distribution Charts
      const { plot: miningDistDay, minerTotal: totalMinersDay } = await this.get_charts_reward_distribution('day');
      const { plot: miningDistWeek, minerTotal: totalMinersWeek } = await this.get_charts_reward_distribution('week');
      // Difficulty Charts
      const { plot: difficultyWeek } = await this.get_charts_difficulty('week');
      const { plot: difficultyMonth } = await this.get_charts_difficulty('month');
      const { plot: difficultyQuarter } = await this.get_charts_difficulty('quarter');
      //const { plot: difficultyYear } = await this.get_charts_difficulty('year');
      await Charts.Model.findOneAndUpdate({}, {
        // txs
        txsDay, txsDay_count,
        txsWeek, txsWeek_count,
        txsMonth, txsMonth_count,
        // miningDist
        miningDistDay, totalMinersDay,
        miningDistWeek, totalMinersWeek,
        // difficulty
        difficultyWeek,
        difficultyMonth,
        difficultyQuarter,
        //difficultyYear
      }, { upsert: true });
    } catch (e: any) {
      throw new Error(`Database.update_charts_db: ${e.message}`);
    }
  };
  
  async update_label(hash: string, message: string): Promise<void> {
    const address = await this.get_address(hash);
    if (address?.a_id) {
      try {
        await Address.Model.updateOne({ a_id: hash }, { name: message });
      } catch (e: any) {
        throw new Error(`Database.update_label: ${e.message}`)
      }
    }
  };

  async update_markets_db(market: string) {
    
  };

  //property: 'received' or 'balance'
  async update_richlist(list: string): Promise<void> {
    try {
      const addresses = list == 'received'
        ? await Address.Model.find({}, 'a_id balance received name')
          .sort({ received: 'desc' })
          .limit(100)
        : await Address.Model.find({}, 'a_id balance received name')
          .sort({ balance: 'desc' })
          .limit(100);
      list == 'received'
        ? await Richlist.Model.updateOne({ coin: settings.coin }, { received: addresses })
        : await Richlist.Model.updateOne({ coin: settings.coin }, { balance: addresses });
    } catch (e: any) {
      throw new Error(`Database.update_richlist: ${e.message}`);
    }
  };

  async update_tx_db(
    coin: string,
    startBlockHeight: number,
    endBlockHeight: number
  ): Promise<void> {
    const counter = { currentBlockHeight: startBlockHeight };
    while (counter.currentBlockHeight <= endBlockHeight) {
      let blockBurned = 0;
      try {
        const blockhash = await lib.get_blockhash(counter.currentBlockHeight);
        const block = await lib.get_block(blockhash);
        // save all txs in block
        const { txburned } = await this.create_txs(block);
        // save block
        await save_block(block, txburned);
        console.log('%s: block saved', block.height);
      } catch (e: any) {
        throw new Error(`Database.update_tx_db: ${e.message}`);
      }
      counter.currentBlockHeight++;
    }
  };

  async update_stats(coin: string, blockcount: number): Promise<void> {
    try {
      const supply = await lib.get_supply();
      const burned = await lib.get_burned_supply();
      const connections = await lib.get_connectioncount();
      await Stats.Model.findOneAndUpdate({ coin: coin }, {
        $set: {
          last: blockcount,
          count: blockcount,
          coin,
          supply,
          burned,
          connections
        }
      }, {
        // return new, updated document
        new: true
      });
    } catch (e: any) {
      throw new Error(`Database.update_stats: ${e.message}`);
    }
  };

  /*
   *
   *    Delete/Rewind Database Entries
   * 
   */
  async drop_peer(address: string): Promise<void> {
    try {
      await Peers.Model.deleteOne({ address: address });
    } catch (e: any) {
      throw new Error(`drop_peer: ${e.message}`);
    }
  };

  async drop_peers(): Promise<void> {
    try {
      await Peers.Model.deleteMany({});
    } catch (e: any) {
      throw new Error(`drop_peers: ${e.message}`);
    }
  };

  async delete_richlist(coin: string): Promise<void> {
    try {
      await Richlist.Model.findOneAndRemove({ coin: coin });
    } catch (e: any) {
      throw new Error(`delete_richlist: ${e.message}`);
    }
  };
  /**
   * Rewind appropriate index states from `endHeight` to `startHeight`
   * 
   * `startHeight` is the last good block, plus one (i.e. oldest bad block)
   * @param endHeight Newest orphaned block height to rewind
   * @param startHeight Oldest orphaned block to rewind
   */
  async rewind_db(
    endHeight: number,
    startHeight: number
  ) {
    // rewind from endHeight down to and including startHeight
    for (let i = endHeight; i >= startHeight; i--) {
      try {
        // get db txes at block height
        const txs: Tx.Document[] = await Tx.Model.find({ blockindex: i });
        for (const tx of txs) {
          console.log(`REWIND: ${i}: ${tx.txid}`);
          await rewind_save_tx(tx, i);
        }
        // delete saved block from db
        console.log(`REWIND: ${i}: delete block`);
        await Block.Model.findOneAndDelete({ height: i });
      } catch (e: any) {
        throw new Error(`Database.rewind_db(${endHeight}, ${startHeight}): ${e.message}`);
      }
    }
  };

};