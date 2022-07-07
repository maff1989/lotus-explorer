import {
  connect,
  disconnect,
  PipelineStage,
} from 'mongoose';
import * as fs from 'fs/promises';
import * as Explorer from './explorer';
import Settings from './settings';
import {
  getChartsDifficultyAggregation,
} from './util';
import Address from '../models/address';
import AddressTx from '../models/addresstx';
import Block from '../models/block';
import Charts from '../models/charts';
import Markets from '../models/markets';
import Peers from '../models/peers';
import Richlist from '../models/richlist';
import Stats from '../models/stats';
import Tx from '../models/tx';

const settings = new Settings()
  , lib = new Explorer.Explorer();
/*
set('useCreateIndex', true);
set('useUnifiedTopology', true);
set('useNewUrlParser', true);
set('useFindAndModify', false);
*/

type BlockInfo = Explorer.BlockInfo;
type BlockDocument = Explorer.BlockDocument;
type TransactionDocument = Explorer.TransactionDocument;
type AddressDocument = Explorer.AddressDocument;
type AddressTransactionDocument = {
  a_id: string,
  blockindex: number,
  txid: string,
  amount: number,
};
type Charts = 
  // Transactions
  'txsDay'
  | 'txsWeek'
  | 'txsMonth'
  | 'txsQuarter'
  // Difficulty
  | 'difficultyWeek'
  | 'difficultyMonth'
  | 'difficultyQuarter'
  | 'difficultyYear'
  // Block reward distribution
  | 'miningDistDay'
  | 'miningDistWeek'
  | 'miningDistMonth'
  // Counters
  | 'txsDay_count'
  | 'txsWeek_count'
  | 'txsMonth_count'
  | 'txsQuarter_count'
  | 'totalMinersDay'
  | 'totalMinersWeek'
  | 'totalMinersMonth';
type ChartsDocument = {
  [type in Charts]: Array<(string | number)[]> | number
};
type MarketDocument = {
  market: string,
  summary: object,
  //chartData: Array,
  //buys: Array,
  //sells: Array,
  //history: Array
};
type PeerDocument = {
  createdAt?: Date,
  address: string,
  port: string,
  protocol: string,
  version: string,
  country: string,
  country_code: string,
};
type RichlistDocument = {
  coin: string,
  received: AddressDocument[],
  balance: AddressDocument[],
};
type StatsDocument = {
  coin: string,
  count: number,
  last: number,
  supply: number,
  burned: number,
  connections: number,
};
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
  // update vins and vouts
  for (const input of vin) {
    const { addresses, amount } = input;
    try {
      await update_address(addresses, amount, height, txid, 'vin');
    } catch (e: any) {
      throw new Error(`save_tx: update_address: vin ${input.addresses}: ${e.message}`);
    }
  }
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
  const newTx = new Tx({
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
  const { blockFees, blockFeesBurned } = await lib.get_block_fees(block.height);
  const totalFeesBurned = blockFeesBurned + txburned;
  // gather minedby address
  const coinbaseTx = await lib.get_rawtransaction(block.tx[0]);
  const miner = coinbaseTx.vout[1].scriptPubKey.addresses[0];
  // save block
  const newBlock = new Block({
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
  try {
    await newBlock.save();
  } catch (e: any) {
    throw new Error(`save_block: failed to save new block to db: ${e.message}`);
  }
  return;
};
const update_address = async (
  hash: string,
  amount: number,
  blockheight: number,
  txid: string,
  type: string
): Promise<void> => {
  const addr_inc: {
    sent: number,
    balance: number,
    received: number
  } = { sent: 0, balance: 0, received: 0 };
  if (hash == 'coinbase') {
    addr_inc.sent = amount;
  } else {
    switch (type) {
      case 'toSelf':
        addr_inc.sent = -amount;
        addr_inc.balance = amount;
        break;
      case 'vin':
        addr_inc.sent = amount;
        addr_inc.balance = -amount;
        break;
      // only increment received if address spent to itself
      default:
        addr_inc.received = amount;
        addr_inc.balance = amount;
        break;
    }
  }
  try {
    await Address.findOneAndUpdate(
      { a_id: hash },
      { $inc: addr_inc },
      { new: true, upsert: true },
    );
  } catch (e: any) {
    throw new Error(`update_address: ${hash}: ${e.message}`);
  }
  if (hash != 'coinbase') {
    try {
      await AddressTx.findOneAndUpdate(
        { a_id: hash, txid: txid },
        { $inc: {
          amount: addr_inc.balance
        }, $set: {
          a_id: hash,
          blockindex: blockheight,
          txid: txid
        }},
        { new: true, upsert: true }
      );
    } catch (e: any) {
      throw new Error(`update_address: ${txid}: ${e.message}`);
    };
  }
  return;
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
      console.log('Unable to connect to database: %s', this.dbString);
      console.log('Aborting');
      process.exit(1);
    }
  };

  async disconnect() {
    try {
      await disconnect();
    } catch (e: any) {
      console.log('Unable to disconnect from database: %s', e.message);
      process.exit(1);
    }
  };

  /*
   *    Create Database Entries
   */
  async create_market(
    coin: string,
    market: string
  ): Promise<MarketDocument> {
    try {
      const create = new Markets({ coin, market });
      await create.save();
    } catch (e: any) {
      return null;
    }
  };
  
  async create_peer(params: PeerDocument): Promise<PeerDocument> {
    try {
      const peer = new Peers(params);
      return await peer.save();
    } catch (e: any) {
      return null;
    }
  };

  async create_richlist(coin: string): Promise<RichlistDocument> {
    try {
      const richlist = new Richlist({ coin: coin, received: [], balance: [] });
      return await richlist.save();
    } catch (e: any) {
      return null;
    }
  };

  async create_stats(coin: string): Promise<StatsDocument> {
    try {
      const create = new Stats({
        coin: coin,
        count: 0,
        last: 0,
        supply: 0,
        burned: 0,
        connections: 0,
      });
      return await create.save();
    } catch (e: any) {
      console.log(`error saving Stats for ${coin}:`, e.message);
      return null;
    }
  };

  async create_txs(block: BlockInfo): Promise<boolean> {
    /*
    if (await is_locked('db_index')) {
      console.log('db_index lock file exists...');
      return false;
    }
    */
    for (const txid of block.tx) {
      try {
        await save_tx(txid, block.height);
      } catch (e: any) {
        console.log(`error saving Tx ${txid}:`, e.message);
        return false;
      }
    }
    return true;
  };

  /*
   *
   *    Check Database Entries
   *
   */
  async check_market(market: string): Promise<MarketDocument> {
    try {
      // returns either full document or null
      return await Markets.findOne({ market: market }).lean();
    } catch (e: any) {
      return null;
    }
  };

  async check_richlist(coin: string): Promise<RichlistDocument> {
    try {
      // returns either full document or null
      return await Richlist.findOne({ coin: coin }).lean();
    } catch (e: any) {
      return null;
    }
  };

  async check_stats(coin: string): Promise<StatsDocument> {
    try {
      // returns either full document or null
      return await Stats.findOne({ coin: coin }).lean();
    } catch (e: any) {
      return null;
    }
  };

  /*
   *
   *    Get Database Entries
   * 
   */
  async get_address(hash: string): Promise<AddressDocument> {
    try {
      return await Address.findOne({ a_id: hash }).lean();
    } catch (e: any) {
      throw new Error(`Database.get_address: ${e.message}`);
    }
  };

  async get_block(height: number): Promise<BlockDocument> {
    try {
      return await Block.findOne({ height: height }).lean();
    } catch (e: any) {
      throw new Error(`Database.get_block: ${e.message}`);
    }
  };

  async get_latest_block(): Promise<BlockDocument[]> {
    try {
      return await Block.aggregate([
        { $sort: { timestamp: -1 }},
        { $limit: 1 }
      ]);
    } catch (e: any) {
      throw new Error(`Database.get_latest_block: ${e.message}`);
    }
  };

  // Polls the Charts db for latest aggregate data
  async get_charts(): Promise<ChartsDocument> {
    try {
      return await Charts.findOne().lean();
    } catch (e: any) {
      return null;
    }
  };

  async get_distribution(
    richlist: RichlistDocument,
    stats: StatsDocument
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
      return await Markets.findOne({ market: market }).lean();
    } catch (e: any) {
      return null;
    }
  };

  async get_peer(address: string): Promise<PeerDocument> {
    try {
      return await Peers.findOne({ address: address }).lean();
    } catch (e: any) {
      return null;
    }
  };

  async get_peers(): Promise<PeerDocument[]> {
    try {
      return await Peers.find({}).lean();
    } catch (e: any) {
      return null;
    }
  }
  
  async get_richlist(coin: string): Promise<RichlistDocument> {
    try {
      return await Richlist.findOne({ coin: coin }).lean();
    } catch (e: any) {
      throw new Error(`Database.get_richlist: ${e.message}`);
    }    
  };
  
  async get_stats(coin: string): Promise<StatsDocument> {
    try {
      return await Stats.findOne({ coin: coin }).lean();
    } catch (e: any) {
      return null;
    }
  };
  
  async get_tx(txid: string): Promise<TransactionDocument> {
    try {
      return await Tx.findOne({ txid: txid }).lean();
    } catch (e: any) {
      throw new Error(`Database.get_tx: ${e.message}`);
    }
  };

  async get_txs(txids: string[]) {
    const txs: TransactionDocument[] = [];
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
      blocks: BlockDocument[],
      count: number
    } = { blocks: [], count: 0 };
    try {
      data.blocks = await Block.aggregate([
        { $sort: { height: -1 }},
        { $skip: start },
        { $limit: length }
      ]);
      data.count = await Block.find({}).count();
      return data;
    } catch (e: any) {
      console.log(`get_last_blocks_ajax: failed to poll blocks collection: ${e.message}`);
      return null;
    }
  };

  async get_last_txs_ajax(
    start: number,
    length: number,
    min: number
  ) {
    const data: {
      txs: TransactionDocument[],
      count: number
    } = { txs: [], count: 0 };
    try {
      data.txs = await Tx.aggregate([
        { $match: { total: { $gte: min }}},
        { $sort: { blockindexx: -1 }},
        { $skip: start },
        { $limit: length }
      ]);
      data.count = await Tx.find({}).count();
      return data;
    } catch (e: any) {
      console.log(`get_last_txs_ajax: failed to poll txs collection: ${e.message}`);
      return null;
    }
  };

  async get_address_txs_ajax(
    address: string,
    start: number,
    length: number
  ) {
    const data: {
      txs: TransactionDocument[],
      count: number
    } = { txs: [], count: 0 };
    try {
      const addressTxs: AddressTransactionDocument[] = await AddressTx.aggregate([
        { $match: { a_id: address }},
        { $sort: { blockindex: -1 }},
        //{ $sort: { amount: 1 }},
        { $skip: start },
        { $limit: length }
      ]);
      const aggResult = await AddressTx.aggregate([
        { $match: { a_id: address }},
        { $sort: { blockindex: -1 }},
        { $skip: start },
        {
          $group: {
            _id: '',
            balance: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        }
      ]);
      data.count = aggResult[0].count;
      let runningBalance = aggResult[0].balance ?? 0;
      for (const addressTx of addressTxs) {
        const tx = await this.get_tx(addressTx.txid);
        data.txs.push({
          txid: tx.txid,
          timestamp: tx.timestamp,
          vin: tx.vin,
          vout: tx.vout,
          balance: runningBalance
        } as TransactionDocument);
        runningBalance -= addressTx.amount;
      }
      return data;
    } catch (e: any) {
      console.log(`get_address_txs_ajax: failed to poll addresstxs collection: ${e.message}`);
      return null;
    }
  };

  /*
   *
   *    Get Database Charts
   * 
   */
  async get_charts_difficulty(timespan: ChartDifficultyTimespan) {
    const seconds = TIMESPANS[timespan];
    const data: {
      plot: Array<(string | number)[]>
    } = { plot: [] };
    try {
      const [ dbBlock ] = await this.get_latest_block();
      const agg: Array<PipelineStage> = [
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
      }> = await Block.aggregate(agg);
      data.plot = result[0].blocks.map((block) => Object.values(block));
    } catch (e: any) {
      
    }
    return data;
  };
  
  async get_charts_reward_distribution(timespan: ChartDistributionTimespan): Promise<{
    plot: Array<[string, number]>,
    minerTotal: number
  }> {
    const seconds = TIMESPANS[timespan];
    const blockspan = BLOCKSPANS[timespan];
    try {
      const [ dbBlock ] = await this.get_latest_block();
      const result: Array<{
        _id: null,
        blocks: Array<{ minedby: string }>
      }> = await Block.aggregate([
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
      plot.push(["Miscellaneous Miners (<= 3% hashrate each)", minerMiscBlocks]);
      return { plot, minerTotal: Object.keys(minerBlockCounts).length };
    } catch (e: any) {

    }
  };

  // gather and prepare chart data for transaction count based on timespan
  async get_charts_txs(timespan: ChartTransactionTimespan): Promise<{
    plot: Array<[string, number]>,
    txTotal: number
  }> {
    const seconds = TIMESPANS[timespan];
    const [ dbBlock ] = await this.get_latest_block();
    const result: Array<{
      blocks: BlockDocument[],
      txtotal: number
    }> = await Block.aggregate([
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
    result[0].blocks.forEach((block: BlockDocument) => {
      arranged_data[block.localeTimestamp] = block.txcount;
    });

    return {
      plot: Object.entries(arranged_data),
      txTotal: result[0].txtotal
    };
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
      const { plot: difficultyYear } = await this.get_charts_difficulty('year');
      await Charts.findOneAndUpdate({}, {
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
  };
  
  async update_label(hash: string, message: string): Promise<void> {
    const address = await this.get_address(hash);
    if (address) {
      try {
        await Address.updateOne({ a_id: hash }, { name: message });
      } catch (e: any) {
        throw new Error(`update_label: ${e.message}`)
      }
    }
  };

  async update_markets_db(market: string) {
    
  };

  //property: 'received' or 'balance'
  async update_richlist(list: string): Promise<void> {
    try {
      const addresses = list == 'received'
        ? await Address.find({}, 'a_id balance received name')
          .sort({ received: 'desc' })
          .limit(100)
        : await Address.find({}, 'a_id balance received name')
          .sort({ balance: 'desc' })
          .limit(100);
      list == 'received'
        ? await Richlist.updateOne({ coin: settings.coin }, { received: addresses })
        : await Richlist.updateOne({ coin: settings.coin }, { balance: addresses });
    } catch (e: any) {
      throw new Error(`update_richlist: ${e.message}`);
    }
  };

  async update_tx_db(
    coin: string,
    startBlockHeight: number,
    endBlockHeight: number
  ): Promise<void> {
    /*
    // return if locked
    if (await is_locked('db_index')) {
      return console.log('db_index lock file exists...');
    }
    // return if cannot create lock
    if (!(await create_lock('db_index'))) {
      return console.log('failed to create lock for db_index');
    }
    */
    const counter = { currentBlockHeight: startBlockHeight };
    while (counter.currentBlockHeight <= endBlockHeight) {
      let blockBurned = 0;
      try {
        const blockhash = await lib.get_blockhash(counter.currentBlockHeight);
        const block = await lib.get_block(blockhash);
        // save all txs
        for (const txid of block.tx) {
          console.log('%s: %s', counter.currentBlockHeight, txid);
          const { burned } = await save_tx(txid, block.height);
          blockBurned += burned;
        }
        // save block
        await save_block(block, blockBurned);
        console.log('-- Block %s saved', block.height);
      } catch (e: any) {
        throw new Error(`update_tx_db: ${e.message}`);
      }
      counter.currentBlockHeight++;
    }

    // update Stats collection
    try {
      await Stats.updateOne({ coin: coin }, { last: endBlockHeight });
    } catch (e: any) {
      throw new Error(`update_tx_db: Stats.updateOne: ${e.message}`);
    }
    // await remove_lock('db_index');
  };

  async update_stats(coin: string): Promise<void> {
    const count = await lib.get_blockcount();
    const supply = await lib.get_supply();
    const burned = await lib.get_burned_supply();
    const connections = await lib.get_connectioncount();
    try {
      await Stats.findOneAndUpdate({ coin: coin }, {
        $set: { coin, count, supply, burned, connections }
      }, {
        // return new, updated document
        new: true
      });
    } catch (e: any) {
      throw new Error(`update_stats: ${e.message}`);
    }
  };

  /*
   *
   *    Delete Database Entries
   * 
   */
  async drop_peer(address: string): Promise<void> {
    try {
      await Peers.deleteOne({ address: address });
    } catch (e: any) {
      throw new Error(`drop_peer: ${e.message}`);
    }
  };

  async drop_peers(): Promise<void> {
    try {
      await Peers.deleteMany({});
    } catch (e: any) {
      throw new Error(`drop_peers: ${e.message}`);
    }
  };

  async delete_richlist(coin: string): Promise<void> {
    try {
      await Richlist.findOneAndRemove({ coin: coin });
    } catch (e: any) {
      throw new Error(`delete_richlist: ${e.message}`);
    }
  }; 

};