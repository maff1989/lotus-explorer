import {
  connect,
  disconnect,
  PipelineStage,
} from 'mongoose';
import * as fs from 'fs/promises';
import moment from 'moment';
import {
  BlockInfo,
  Explorer
} from './explorer';
import settings from './settings';
import {
  toSats,
  toXPI,
  chartsDifficultyAggregation,
} from './util';
import * as Markets from './markets';
import * as MongoDB from '../models';

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
type ChartBurnedTimespan = 'day' | 'week' | 'month'
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
  year: 31536000
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
/**
 * Save transaction info after converting to `Tx.Model`
 * @param txid Transaction ID
 * @param height Block height that includes this `txid`
 * @returns Object containing amount burned by tx, in satoshis
 */
const save_tx = async (
  txid: string,
  height: number
): Promise<{
  fee: number,
  burned: number
}> => {
  const tx = await lib.get_rawtransaction(txid);
  const { vin } = await lib.prepare_vin(tx);
  const { vout, burned } = await lib.prepare_vout(tx.vout);
  const total = vout.reduce((a, b) => a + b.amount, 0);
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
  try {
    // save Tx
    const newTx = new MongoDB.Tx.Model({
      txid: tx.txid,
      vin,
      vout,
      fee,
      size: tx.size,
      total: total.toFixed(6),
      timestamp: tx.time,
      localeTimestamp: new Date(tx.time * 1000)
        .toLocaleString('en-us', { timeZone:"UTC" }),
      blockhash: tx.blockhash,
      blockindex: height,
      burned: burned
    });
    await newTx.save();
  } catch (e: any) {
    throw new Error(`save_tx: ${e.message}`);
  }
  return { fee, burned };
};
/**
 * Save info for `txid` and `address` to `AddressTx.Model`
 * @param address Lotus address
 * @param balance Overall balance of `address` in tx, in satoshis
 * @param height Block height that includes this `txid`
 * @param txid Transaction ID
 */
const save_addresstx = async (
  address: string,
  balance: number,
  height: number,
  txid: string
): Promise<void> => {
  try {
    await MongoDB.AddressTx.Model.findOneAndUpdate(
      { a_id: address, txid: txid },
      { $inc: {
        amount: balance
      }, $set: {
        a_id: address,
        blockindex: height,
        txid: txid
      }},
      { upsert: true }
    );
  } catch (e: any) {
    throw new Error(`save_addresstx: ${e.message}`);
  }
};
/**
 * Save raw block data as `Block.Model`
 * @param block Raw block info
 * @param fees Fees paid by txs, in satoshis
 * @param burned OP_RETURN and fees burned, in satoshis
 */
const save_block = async (
  block: BlockInfo,
  fees: number,
  subsidy: number,
  burned: number,
): Promise<void> => {
  try {
    // gather minedby address
    const coinbaseTx = await lib.get_rawtransaction(block.tx[0]);
    const miner = coinbaseTx.vout[1].scriptPubKey.addresses[0];
    // save block
    const newBlock = new MongoDB.Block.Model({
      height: block.height,
      minedby: miner,
      //hash: block.hash,
      difficulty: block.difficulty,
      timestamp: block.time,
      localeTimestamp: new Date(block.time * 1000)
        .toLocaleString('en-us', { timeZone:"UTC" }),
      size: block.size,
      fees,
      subsidy,
      burned,
      txcount: block.nTx
    });
    await newBlock.save();
  } catch (e: any) {
    throw new Error(`save_block: ${e.message}`);
  }
  return;
};
/**
 * Update `Address.Model` state for `address` with prepared `vin`/`vout` data
 * @param address Lotus address
 * @param amount Amount to incremenet/decrement, in satoshis
 * @param height Block height that includes this `txid`
 * @param txid Transaction ID
 * @param type How to calculate `$inc` for address update
 * @returns 
 */
const update_address = async (
  address: string,
  amount: number,
  height: number,
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
      await save_addresstx(
        address,
        addr_inc.balance,
        height,
        txid
      );
    } catch (e: any) {
      throw new Error(`update_address: ${address}: ${txid}: ${e.message}`);
    };
  }
  try {
    await MongoDB.Address.Model.findOneAndUpdate(
      { a_id: address },
      { $inc: addr_inc },
      { new: true, upsert: true },
    );
  } catch (e: any) {
    throw new Error(`update_address: ${address}: ${e.message}`);
  }
  return;
};
/**
 * Rewind state changes for `address` with prepared `vin`/`vout` data
 * @param address Lotus address
 * @param amount Amount to increment/decrement, in satoshis
 * @param type How to calculate `$inc` for address rewind
 */
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
    // capture updated document
    const newAddress = await MongoDB.Address.Model
      .findOneAndUpdate(
        { a_id: address },
        { $inc: addr_inc },
        { new: true }
      );
    // delete address if sent, received, and balance are all 0
    // i.e. assume no transactions exist for address
    if (
      newAddress.sent == 0
      && newAddress.received == 0
      && newAddress.balance == 0
    ) {
      await MongoDB.Address.Model.deleteOne({ a_id: address });
    }
  } catch (e: any) {
    throw new Error(`rewind_update_address(${address}, ${amount}, ${type}): ${e.message}`);
  }
};
/**
 * Rewind state changes caused by `tx`
 * @param tx Transaction document (`Tx.Document`)
 */
const rewind_save_tx = async (
  tx: MongoDB.Tx.Document
) => {
  const { txid, vin, vout, } = tx;
  // rewind vins
  for (const input of vin) {
    const { addresses, amount } = input;
    try {
      // Rewind sent amount from coinbase entry
      if (addresses == 'coinbase') {
        await MongoDB.Address.Model.findOneAndUpdate(
          { a_id: 'coinbase' },
          { $inc: { sent: -amount }});
        continue;
      } else {
        await rewind_update_address(addresses, amount, 'rewind-vin');
      }
    } catch (e: any) {
      throw new Error(`rewind_save_tx: vin: ${e.message}`);
    }
  }
  // rewind vouts
  for (const output of vout) {
    const type = { output: 'rewind-vout' };
    const { addresses, amount } = output;
    if (vin.find(input => input.addresses == addresses)) {
      type.output = 'rewind-toSelf';
    }
    try {
      await rewind_update_address(addresses, amount, type.output);
    } catch (e: any) {
      throw new Error(`rewind_save_tx: vout: ${e.message}`);
    }
  }
  // Delete Tx and AddressTx entry for txid after rewinding all address updates
  try {
    await MongoDB.Tx.Model.deleteOne({ txid: txid });
    await MongoDB.AddressTx.Model.deleteMany({ txid: txid });
  } catch (e: any) {
    throw new Error(`rewind_save_tx: ${txid}: ${e.message}`);
  }
};
const get_market_data = async (
  market: string
) => {
  try {
    const marketlib = new Markets[market].default();
    return await marketlib.get_data();
  } catch (e: any) {
    throw new Error(`get_market_data. ${e.message}`);
  }  
};
export const create_lock = async (
  lockfile: string
): Promise<boolean> => {
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
export const remove_lock = async (
  lockfile: string
): Promise<boolean> => {
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
export const is_locked = async (
  lockfile: string
): Promise<boolean> => {
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
  /**
   * Connection string for MongoDB using data from `settings.json`
   */
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
      throw new Error(`connect: ${this.dbString}: ${e.message}`);
    }
  };

  async disconnect() {
    try {
      await disconnect();
    } catch (e: any) {
      throw new Error(`disconnect: ${this.dbString}: ${e.message}`);
    }
  };

  /*
   *    Create Database Entries
   */
  async create_market(
    coin: string,
    market: string
  ): Promise<MongoDB.Markets.Document> {
    try {
      const create = new MongoDB.Markets.Model({
        coin,
        market
      });
      return await create.save();
    } catch (e: any) {
      throw new Error(`create_market: ${e.message}`);
    }
  };
  
  async create_peer(
    params: MongoDB.Peers.Document
  ): Promise<MongoDB.Peers.Document> {
    try {
      const peer = new MongoDB.Peers.Model(params);
      return await peer.save();
    } catch (e: any) {
      throw new Error(`create_peer: ${e.message}`);
    }
  };

  async create_richlist(
    coin: string
  ): Promise<MongoDB.Richlist.Document> {
    try {
      const richlist = new MongoDB.Richlist.Model({
        coin: coin,
        received: [],
        balance: []
      });
      return await richlist.save();
    } catch (e: any) {
      throw new Error(`create_richlist: ${e.message}`);
    }
  };

  async create_stats(
    coin: string
  ): Promise<MongoDB.Stats.Document> {
    try {
      const create = new MongoDB.Stats.Model({
        coin: coin,
        count: 0,
        last: 0,
        supply: 0,
        burned: 0,
        connections: 0,
      });
      return await create.save();
    } catch (e: any) {
      throw new Error(`create_stats: ${e.message}`);
    }
  };

  async create_txs(
    block: BlockInfo
  ): Promise<{
    fees: number,
    burned: number
  }> {
    const { height, tx } = block;
    const counters = { fees: 0, burned: 0 };
    for (const txid of tx) {
      try {
        const { fee, burned } = await save_tx(txid, height);
        counters.fees += fee;
        counters.burned += burned;
      } catch (e: any) {
        throw new Error(`create_txs: ${height}: ${txid}: ${e.message}`);
      }
    }
    return counters;
  };

  /*
   *
   *    Check Database Entries
   *
   */
  async check_market(
    market: string
  ): Promise<MongoDB.Markets.Document> {
    try {
      // returns either full document or null
      return await MongoDB.Markets.Model
        .findOne({ market: market })
        .lean();
    } catch (e: any) {
      return null;
    }
  };

  async check_richlist(
    coin: string
  ): Promise<MongoDB.Richlist.Document> {
    try {
      // returns either full document or null
      return await MongoDB.Richlist.Model
        .findOne({ coin: coin })
        .lean();
    } catch (e: any) {
      return null;
    }
  };

  async check_stats(
    coin: string
  ): Promise<MongoDB.Stats.Document> {
    try {
      // returns either full document or null
      return await MongoDB.Stats.Model
        .findOne({ coin: coin })
        .lean();
    } catch (e: any) {
      return null;
    }
  };

  /*
   *
   *    Get Database Entries
   * 
   */
  async get_address(
    hash: string
  ): Promise<MongoDB.Address.Document> {
    try {
      return await MongoDB.Address.Model
        .findOne({ a_id: hash })
        .lean();
    } catch (e: any) {
      throw new Error(`get_address: ${e.message}`);
    }
  };

  async get_block(
    height: number
  ): Promise<MongoDB.Block.Document> {
    try {
      return await MongoDB.Block.Model
        .findOne({ height: height })
        .lean();
    } catch (e: any) {
      throw new Error(`get_block: ${e.message}`);
    }
  };

  async get_latest_block(): Promise<MongoDB.Block.Document> {
    try {
      const result = await MongoDB.Block.Model
        .find()
        .sort({ timestamp: -1 })
        .limit(1);
      return <MongoDB.Block.Document>result.pop();
    } catch (e: any) {
      throw new Error(`get_latest_block: ${e.message}`);
    }
  };

  // Polls the Charts db for latest aggregate data
  async get_charts(): Promise<MongoDB.Charts.Document> {
    try {
      return await MongoDB.Charts.Model
        .findOne()
        .lean();
    } catch (e: any) {
      return null;
    }
  };

  async get_distribution(
    richlist: MongoDB.Richlist.Document,
    stats: MongoDB.Stats.Document
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
      const addressBalanceXpi = toXPI(addressDoc.balance);
      const supplyXPI = toXPI(stats.supply);
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
      return await MongoDB.Markets.Model
        .findOne({ market: market })
        .lean();
    } catch (e: any) {
      throw new Error(`get_market: ${e.message}`);
    }
  };

  async get_peer(
    address: string
  ): Promise<MongoDB.Peers.Document> {
    try {
      return await MongoDB.Peers.Model
        .findOne({ address: address })
        .lean();
    } catch (e: any) {
      throw new Error(`get_peer: ${e.message}`);
    }
  };

  async get_peers(): Promise<MongoDB.Peers.Document[]> {
    try {
      return await MongoDB.Peers.Model.find().lean();
    } catch (e: any) {
      throw new Error(`get_peers: ${e.message}`);
    }
  }
  
  async get_richlist(
    coin: string
  ): Promise<MongoDB.Richlist.Document> {
    try {
      return await MongoDB.Richlist.Model
        .findOne({ coin: coin })
        .lean();
    } catch (e: any) {
      throw new Error(`get_richlist: ${e.message}`);
    }    
  };
  
  async get_stats(
    coin: string
  ): Promise<MongoDB.Stats.Document> {
    try {
      return await MongoDB.Stats.Model
        .findOne({ coin: coin })
        .lean();
    } catch (e: any) {
      throw new Error(`get_stats: ${e.message}`);
    }
  };
  
  async get_tx(
    txid: string
  ): Promise<MongoDB.Tx.Document> {
    try {
      return await MongoDB.Tx.Model
        .findOne({ txid: txid })
        .lean();
    } catch (e: any) {
      throw new Error(`get_tx: ${e.message}`);
    }
  };

  async get_txs(
    txids: string[]
  ): Promise<MongoDB.Tx.Document[]> {
    const txs: MongoDB.Tx.Document[] = [];
    for (const txid of txids) {
      try {
        const tx = await this.get_tx(txid);
        txs.push(tx);
      } catch (e: any) {
        // couldn't find txid in db
        throw new Error(
          e.message +
          ` -- data for txid ${txid} didn't save to db?`
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
      blocks: MongoDB.Block.Document[],
      count: number
    } = { blocks: [], count: 0 };
    try {
      const stats = await MongoDB.Stats.Model
        .findOne();
      data.blocks = await MongoDB.Block.Model
        .find()
        .sort({ height: -1 })
        .skip(start)
        .limit(length);
      data.count = stats.last;
      return data;
    } catch (e: any) {
      throw new Error(`get_last_blocks_ajax: ${e.message}`);
    }
  };

  async get_address_txs_ajax(
    address: string,
    start: number,
    length: number
  ) {
    const data: {
      txs: MongoDB.Tx.Document[],
      count: number
    } = { txs: [], count: 0 };
    try {
      data.count = await MongoDB.AddressTx.Model
        .find({ a_id: address })
        .count();
      // return default data if no db entries for address
      if (data.count < 1) {
        return data;
      }
      const [{ balance }] = await MongoDB.AddressTx.Model
        .aggregate([
          { '$match': { a_id: address }},
          { '$sort': { 'blockindex': -1 }},
          { '$skip': Number(start) },
          { '$group': {
            _id: null,
            balance: { '$sum': '$amount' }
          }}
        ]) || [{ balance: 0 }];
      const addressTxs: MongoDB.AddressTx.Document[] =
        await MongoDB.AddressTx.Model
          .find({ a_id: address })
          .sort({ blockindex: -1 })
          .sort({ amount: 1 })
          .skip(start)
          .limit(length)
          .lean();
      let runningBalance = balance ?? 0;
      for (const addressTx of addressTxs) {
        const tx = await this.get_tx(addressTx.txid);
        data.txs.push({
          txid: tx.txid,
          timestamp: tx.timestamp,
          vin: tx.vin,
          vout: tx.vout,
          balance: runningBalance
        } as MongoDB.Tx.Document);
        runningBalance -= addressTx.amount;
      }
      return data;
    } catch (e: any) {
      throw new Error(`get_address_txs_ajax: ${e.message}`);
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
    plot: MongoDB.Charts.PlotData
  }> {
    const seconds = TIMESPANS[timespan];
    const data: {
      plot: MongoDB.Charts.PlotData
    } = { plot: [] };
    try {
      const dbBlock = await this.get_latest_block();
      const agg: PipelineStage[] = [
        { '$match': {
          'timestamp': { '$gte': (dbBlock.timestamp - seconds) }
        }},
      ];
      // filter agg results depending on blockspan to reduce data load
      agg.push(...chartsDifficultyAggregation[timespan]);
      const result: Array<{
        _id: string | null,
        difficulty: number
      }> = await MongoDB.Block.Model.aggregate(agg);
      const plot = result.map(entry => Object.values(entry));
      data.plot = plot.sort((a, b) => {
        const t1 = moment(a[0], 'MM-DD-YYYY HH').toLocaleString();
        const t2 = moment(b[0], 'MM-DD-YYYY HH').toLocaleString();
        return Date.parse(t1) - Date.parse(t2);
      });
      return data;
    } catch (e: any) {
      throw new Error(`get_charts_difficulty(${timespan}): ${e.message}`);
    }
  };
  
  async get_charts_reward_distribution(
    timespan: ChartDistributionTimespan
  ) {
    const seconds = TIMESPANS[timespan];
    const blockspan = BLOCKSPANS[timespan];
    const data: {
      plot: MongoDB.Charts.PlotData,
      minerTotal: number
    } = { plot: [], minerTotal: 0 };
    try {
      const dbBlock = await this.get_latest_block();
      const blocks: MongoDB.Block.Document[] =
        await MongoDB.Block.Model
          .find({ timestamp: { $gte: (dbBlock.timestamp - seconds)}});
      const minerBlockCounts: { [minedby: string]: number } = {};
      blocks.forEach((block) => {
        minerBlockCounts[block.minedby] !== undefined
          ? minerBlockCounts[block.minedby]++
          : minerBlockCounts[block.minedby] = 1
      });
  
      let minerMiscBlocks = 0;
      const minerFiltered: { [minedby: string]: number } = {};
      for (const [minedby, blockCount]
        of Object.entries(minerBlockCounts)
      ) {
        blockCount > Math.floor(0.03 * blockspan)
          ? minerFiltered[minedby] = blockCount
          : minerMiscBlocks += blockCount;
      }
  
      data.plot = Object.entries(minerFiltered)
        .sort((a, b) => b[1] - a[1]);
      data.plot.push([
        "Miscellaneous Miners (<= 3% hashrate each)",
        minerMiscBlocks
      ]);
      data.minerTotal = Object.keys(minerBlockCounts).length;
      return data;
    } catch (e: any) {
      throw new Error(`get_charts_reward_distribution(${timespan}): ${e.message}`);
    }
  };

  async gen_charts_burned(
    timespan: ChartBurnedTimespan
  ) {
    const data: {
      plot: MongoDB.Charts.PlotData,
      burnedTotal: number
    } = { plot: [], burnedTotal: 0 };
    try {
      const dbBlock = await this.get_latest_block();
      const txs = await MongoDB.Tx.Model
        .find({
          timestamp: { $gte: (dbBlock.timestamp - TIMESPANS[timespan]) },
          burned: { $gt: 0 }
        })
        .select({ localeTimestamp: 1, burned: 1 });
      const arranged: { [x: string]: number } = {};
      txs.forEach(tx => {
        const timestampBurned = arranged[tx.localeTimestamp] || 0;
        arranged[tx.localeTimestamp] = toXPI(timestampBurned > 0
          ? toSats(timestampBurned) + tx.burned
          : tx.burned);
        data.burnedTotal += tx.burned;
      });
      data.plot = Object.entries(arranged);
      return data;
    } catch (e: any) {
      throw new Error(`gen_charts_burned(${timespan}): ${e.message}`);
    }
  };

  // gather and prepare chart data for transaction count based on timespan
  async get_charts_txs(
    timespan: ChartTransactionTimespan
  ) {
    const seconds = TIMESPANS[timespan];
    const data: {
      plot: MongoDB.Charts.PlotData,
      txTotal: number
    } = { plot: [], txTotal: 0 };
    try {
      const dbBlock = await this.get_latest_block();
      const blocks = await MongoDB.Block.Model
        .find({
          timestamp: { $gte: (dbBlock.timestamp - seconds) },
          txcount: { $gt: 1 } 
        })
        .select({ localeTimestamp: 1, txcount: 1 })
        .lean();
      const arranged_data: { [x: string]: number } = {};
      blocks.forEach((block: MongoDB.Block.Document) => {
        const txcount = block.txcount - 1;
        arranged_data[block.localeTimestamp] = txcount;
        data.txTotal += txcount;
      });
      data.plot = Object.entries(arranged_data);
      return data;
    } catch (e: any) {
      throw new Error(`get_charts_txs(${timespan}): ${e.message}`);
    }
  };
  
  /*
   *
   *    Update Database Entries
   * 
   */

  async update_charts_db(): Promise<void> {
    const start = Date.now();
    try {
      // Burned XPI Charts
      const {
        plot: burnedDay,
        burnedTotal: burnedDay_total
      } = await this.gen_charts_burned('day');
      const {
        plot: burnedWeek,
        burnedTotal: burnedWeek_total
      } = await this.gen_charts_burned('week');
      const {
        plot: burnedMonth,
        burnedTotal: burnedMonth_total
      } = await this.gen_charts_burned('month');
      // Transaction Charts
      const {
        plot: txsDay,
        txTotal: txsDay_count
      } = await this.get_charts_txs('day');
      const {
        plot: txsWeek,
        txTotal: txsWeek_count
      } = await this.get_charts_txs('week');
      const {
        plot: txsMonth,
        txTotal: txsMonth_count
      } = await this.get_charts_txs('month');
      // Reward Distribution Charts
      const {
        plot: miningDistDay,
        minerTotal: totalMinersDay
      } = await this.get_charts_reward_distribution('day');
      const {
        plot: miningDistWeek,
        minerTotal: totalMinersWeek
      } = await this.get_charts_reward_distribution('week');
      // Difficulty Charts
      const { plot: difficultyWeek } = await this.get_charts_difficulty('week');
      const { plot: difficultyMonth } = await this.get_charts_difficulty('month');
      const { plot: difficultyQuarter } = await this.get_charts_difficulty('quarter');
      const { plot: difficultyYear } = await this.get_charts_difficulty('year');
      await MongoDB.Charts.Model.findOneAndUpdate({}, {
        // burned
        burnedDay, burnedDay_total,
        burnedWeek, burnedWeek_total,
        burnedMonth, burnedMonth_total,
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
        difficultyYear
      }, { upsert: true });
    } catch (e: any) {
      throw new Error(`update_charts_db: ${e.message}`);
    }
    const end = Date.now();
    console.log('LOG: update_charts_db complete (%sms)', end - start)
  };
  
  async update_label(
    hash: string,
    message: string
  ): Promise<void> {
    const address = await this.get_address(hash);
    if (address?.a_id) {
      try {
        await MongoDB.Address.Model
          .updateOne({ a_id: hash }, { name: message });
      } catch (e: any) {
        throw new Error(`update_label: ${e.message}`)
      }
    }
  };

  async update_markets_db(
    market: string
  ): Promise<void> {
    try {
      const data = await get_market_data(market);
      await MongoDB.Markets.Model.updateOne({ market: market }, {
        chartdata: JSON.stringify(data.chartdata),
        buys: data.buys,
        sells: data.sells,
        history: data.trades
      });
    } catch (e: any) {
      throw new Error(`update_markets_db: ${e.message}`);
    }
  };

  //property: 'received' or 'balance'
  async update_richlist(
    list: string
  ): Promise<void> {
    const start = Date.now();
    try {
      const addresses = list == 'received'
        ? await MongoDB.Address.Model
          .find({}, 'a_id balance received name')
          .sort({ received: 'desc' })
          .limit(100)
        : await MongoDB.Address.Model
          .find({}, 'a_id balance received name')
          .sort({ balance: 'desc' })
          .limit(100);
      list == 'received'
        ? await MongoDB.Richlist.Model
          .updateOne({ coin: settings.coin }, { received: addresses })
        : await MongoDB.Richlist.Model
          .updateOne({ coin: settings.coin }, { balance: addresses });
    } catch (e: any) {
      throw new Error(`update_richlist: ${e.message}`);
    }
    const end = Date.now();
    console.log('LOG: update_richlist (%s) complete (%sms)',
      list,
      end - start
    );
  };

  async update_stats(
    coin: string,
    blockcount: number
  ): Promise<void> {
    const start = Date.now();
    try {
      const supply = await lib.get_supply();
      const burned = await lib.get_burned_supply();
      const supplyAvailable = supply - burned;
      const connections = await lib.get_connectioncount();
      await MongoDB.Stats.Model.findOneAndUpdate({ coin: coin }, {
        $set: {
          last: blockcount,
          count: blockcount,
          coin,
          supply: supplyAvailable,
          burned,
          connections
        }
      });
    } catch (e: any) {
      throw new Error(`update_stats: ${e.message}`);
    }
    const end = Date.now();
    console.log('LOG: update_stats complete (%sms)', end - start);
  };

  async update_tx_db(
    startBlockHeight: number,
    endBlockHeight: number
  ): Promise<void> {
    const start = Date.now();
    const counter = { currentBlockHeight: startBlockHeight };
    while (counter.currentBlockHeight <= endBlockHeight) {
      try {
        const timeStart = Date.now();
        const blockhash = await lib.get_blockhash(counter.currentBlockHeight);
        const block = await lib.get_block(blockhash);
        // gather block subsidy in satoshis
        const blockstats = await lib.get_blockstats(blockhash);
        const subsidy = toSats(blockstats.subsidy);
        // save all txs in block
        const { fees, burned } = await this.create_txs(block);
        // calculate burned fees from total tx fees
        const burnedFees = Math.round(fees / 2);
        // save block
        await save_block(
          block,
          fees,
          subsidy,
          burnedFees + burned,
        );
        const timeEnd = Date.now();
        console.log('SAVE: block %s (%s txs) complete (%sms)',
          block.height,
          block.nTx,
          timeEnd - timeStart
        );
      } catch (e: any) {
        throw new Error(`update_tx_db: ${e.message}`);
      }
      counter.currentBlockHeight++;
    }
    const end = Date.now();
    console.log('SAVE: block %s->%s complete (%sms)',
      startBlockHeight,
      endBlockHeight,
      end - start
    );
  };

  /*
   *
   *    Delete/Rewind Database Entries
   * 
   */
  async drop_peer(
    address: string
  ): Promise<void> {
    try {
      await MongoDB.Peers.Model.deleteOne({ address: address });
    } catch (e: any) {
      throw new Error(`drop_peer: ${e.message}`);
    }
  };

  async drop_peers(): Promise<void> {
    try {
      await MongoDB.Peers.Model.deleteMany({});
    } catch (e: any) {
      throw new Error(`drop_peers: ${e.message}`);
    }
  };

  async delete_richlist(
    coin: string
  ): Promise<void> {
    try {
      await MongoDB.Richlist.Model.findOneAndRemove({ coin: coin });
    } catch (e: any) {
      throw new Error(`delete_richlist: ${e.message}`);
    }
  };
  /**
   * Rewind appropriate index states from `startHeight` to `endHeight`
   * 
   * `endHeight` is the last good block, plus one (i.e. oldest bad block)
   * @param startHeight Newest orphaned block height to rewind
   * @param endHeight Oldest orphaned block to rewind
   */
  async rewind_db(
    startHeight: number,
    endHeight: number
  ): Promise<void> {
    for (let i = startHeight; i >= endHeight; i--) {
      try {
        // fetch and rewind db txes at blockindex
        const timeStart = Date.now();
        const txs = await MongoDB.Tx.Model.find({ blockindex: i });
        for (const tx of txs) {
          await rewind_save_tx(tx);
        }
        // delete saved block from db
        await MongoDB.Block.Model.findOneAndDelete({ height: i });
        const timeEnd = Date.now();
        console.log(`REWIND: block %s (%s txs) complete (%sms)`,
          i,
          txs.length,
          timeEnd - timeStart
        );
      } catch (e: any) {
        throw new Error(`rewind_db(${startHeight}, ${endHeight}): ${i}: ${e.message}`);
      }
    }
  };

};