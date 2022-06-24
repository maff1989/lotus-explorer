const settings = require('./settings');
import { connect, disconnect, set, MongooseOptions } from 'mongoose';
import assert from 'assert';
import * as fs from 'fs/promises';
import * as Explorer from '../lib/explorer';
import Address from '../models/address';
import AddressTx from '../models/addresstx';
import Block from '../models/block';
import Charts from '../models/charts';
import Markets from '../models/markets';
import Peers from '../models/peers';
import Richlist from '../models/richlist';
import Stats from '../models/stats';
import Tx from '../models/tx';

const lib = new Explorer.Explorer();
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
type StatsDocument = {
  coin: string,
  count: number,
  last: number,
  supply: number,
  burned: number,
  connections: number,
};
const TIMESPANS: {
  [timespan: string]: number
} = {
  day: 86400,
  week: 604800,
  month: 2592000,
  quarter: 7776000,
};
const BLOCKSPANS: {
  [timespan: string]: number
} = {
  day: 720,
  week: 5040,
  month: 21900,
  quarter: 65700,
  year: 262800
};
const find_address = async (hash: string): Promise<AddressDocument> => {
  return (await Address.findOne({ a_id: hash }))._doc;
};
const find_richlist = async (coin: string) => {
  return (await Richlist.findOne({ coin: coin }))._doc;
};
const find_tx = async (txid: string): Promise<TransactionDocument> => {
  return (await Tx.findOne({ txid: txid }))._doc;
};
const find_block = async (height: number) => {
  return (await Block.findOne({ height: height }))._doc;
};
const find_latest_block = async (): Promise<BlockDocument[]> => {
  return await Block.find().sort({'timestamp': -1}).limit(1);
};
const save_tx = async (txid: string, blockheight: number) => {
  const tx = await lib.get_rawtransaction(txid);
  assert(tx, 'Unable to fetch raw tx');
  const { vin } = await lib.prepare_vin(tx);
  const { vout, burned } = await lib.prepare_vout(tx.vout);
  const total = await lib.calculate_total(vout);
  const fee = await lib.calculate_fee(vout, vin);
  // update vins and vouts
  vin.forEach(async input => await update_address(
    input.addresses,
    input.amount,
    blockheight,
    txid,
    'vin'
  ));
  vout.forEach(async output => await update_address(
    output.addresses,
    output.amount,
    blockheight,
    txid,
    vin.find(input => output.addresses == input.addresses)
      // don't add output to "Total Received" for this address
      ? 'toSelf'
      // only update if address is not an OP_RETURN with a value > 0
      : 'vout'
  ));
  // save Tx
  try {
    const newTx = new Tx({
      txid: tx.txid,
      vin,
      vout,
      fee,
      size: tx.size,
      total: total.toFixed(6),
      timestamp: tx.time,
      localeTimestamp: new Date(tx.time * 1000).toLocaleString('en-us', {timeZone:"UTC"}),
      blockhash: tx.blockhash,
      blockindex: blockheight,
    });
    await newTx.save();
  } catch (e: any) {
    throw new Error(`save_tx: failed to save new tx to db: ${e.message}`);
  }
  return { burned };
};
const save_block = async (
  block: BlockInfo,
  txburned: number
): Promise<void | Error> => {
  const { blockFees, blockFeesBurned } = await lib.get_block_fees(block.height);
  const totalFeesBurned = blockFeesBurned + txburned;
  // gather minedby address
  const tx = await lib.get_rawtransaction(block.tx[0]);
  const miner = tx.vout[1].scriptPubKey.addresses[0];
  // save block
  try {
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
    newBlock.save();
  } catch (e: any) {
    return new Error(`save_block: failed to save new block to db: ${e.message}`);
  }
  return;
};
const update_address = async (
  hash: string,
  amount: number,
  blockheight: number,
  txid: string,
  type: string
): Promise<void | Error> => {
  const addr_inc: {
    sent?: number,
    balance?: number,
    received?: number
  } = {};
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
      { new: true,
        upsert: true
      }
    );
    if (hash != 'coinbase') {
      await AddressTx.findOneAndUpdate(
        { a_id: hash, txid: txid },
        { $inc: {
          amount: addr_inc.balance
        }, $set: {
          a_id: hash,
          blockindex: blockheight,
          txid: txid
        }},
        { new: true,
          upsert: true
        }
      );
    }
  } catch (e: any) {
    return new Error(`update_address: failed to update address ${hash}: ${e.message}`);
  }
  return;
};
const create_lock = async (lockfile: string): Promise<boolean> => {
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
const remove_lock = async (lockfile: string): Promise<boolean> => {
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
const is_locked = async (lockfile: string): Promise<boolean> => {
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

  // initialize DB
  async connect(database: string) {
    try {
      await connect(database);
    } catch (e: any) {
      console.log('Unable to connect to database: %s', database);
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

  async is_locked() {
    return await is_locked('db_index');
  };

  async update_label(hash: string, message: string) {
    const address = await find_address(hash);
    if(address){
      return await Address.updateOne({ a_id: hash }, { name: message });
    }
    return false;
  };

  async check_stats(coin: string) {
    const stats = await Stats.findOne({ coin: coin });
    return stats ? true: false;
  };

  async get_stats(coin: string): Promise<StatsDocument> {
    const stats = await Stats.findOne({ coin: coin });
    return stats ?? null
  };

  async create_stats(coin: string): Promise<StatsDocument> {
    const create = new Stats({
      coin: coin,
      last: 0,
    });
    const newStats = await create.save();
    return newStats ?? null;
  };

  async get_address(hash: string) {
    return await find_address(hash);
  };

  async get_richlist(coin: string) {
    return await find_richlist(coin);
  };
  
  // Polls the Charts db for latest aggregate data
  async get_charts() {
    return await Charts.findOne();
  };
  
  async get_block(height: number) {
    return await find_block(height);
  };

  async get_tx(txid: string) {
    return await find_tx(txid);
  };

  async get_txs(block: BlockInfo) {
    const txs: TransactionDocument[] = [];
    for (const txid of block.tx) {
      const tx = await find_tx(txid);
      txs.push(tx);
    }
    return txs;
  };
  
  //property: 'received' or 'balance'
  async update_richlist(list: string) {
    const addresses = list == 'received'
      ? await Address.find({}, 'a_id balance received name').sort({ received: 'desc' }).limit(100)
      : await Address.find({}, 'a_id balance received name').sort({ balance: 'desc' }).limit(100);
    return list == 'received'
      ? await Richlist.updateOne({ coin: settings.coin }, { received: addresses })
      : await Richlist.updateOne({ coin: settings.coin }, { balance: addresses });
  };
  
  // gather and prepare chart data for transaction count based on timespan
  async get_charts_txs(timespan: string): Promise<{
    data: Array<[string, number]>,
    txtotal: number
  }> {
    const [ dbBlock ] = await find_latest_block();
    const timespan_s = TIMESPANS[timespan];
    const result: Array<{
      blocks: BlockDocument[],
      txtotal: number
    }> = await Block.aggregate([
      { '$match': {
        'timestamp': { '$gte': (dbBlock.timestamp - timespan_s) },
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
      data: Object.entries(arranged_data),
      txtotal: result[0].txtotal
    };
  };
  
  async get_charts_reward_distribution(timespan: string): Promise<{
    data: Array<[string, number]>,
    minerTotal: number
  }> {
    const [ dbBlock ] = await find_latest_block();
    const timespan_s = TIMESPANS[timespan];
    const blockspan = BLOCKSPANS[timespan];
    const result: Array<{
      _id: null,
      blocks: Array<{ minedby: string }>
    }> = await Block.aggregate([
      { '$match': {
        'timestamp': { '$gte': (dbBlock.timestamp - timespan_s) }
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

    const data = Object.entries(minerFiltered).sort((a, b) => b[1] - a[1]);
    data.push(["Miscellaneous Miners (<= 3% hashrate each)", minerMiscBlocks]);
    return { data, minerTotal: Object.keys(minerBlockCounts).length };
  };
  
  async get_charts_difficulty(timespan: string) {
    const [ dbBlock ] = await find_latest_block();
    const timespan_s = TIMESPANS[timespan];
    const agg: Array<{}> = [
      { '$match': {
        'timestamp': { '$gte': (dbBlock.timestamp - timespan_s) }
      }},
      { "$sort": {"timestamp": 1} },
      //{ "$limit": blockspan },
      { "$group": {
        _id: null,
        "blocks": { $push: { t: "$localeTimestamp", d: "$difficulty" } }
      }},
    ];
    // filter agg results depending on blockspan to reduce data load
    switch (timespan) {
      case 'week':
        agg.push({
          '$project': {
            // filter blocks 
            'blocks': {
              '$filter': {
                'input': '$blocks',
                'as': 'block',
                'cond': {
                  // get difficulty from 6 blocks from each hour of the day
                  '$and': [
                    { '$gte': [{ '$hour': {'$dateFromString': {'dateString': "$$block.t"}}}, 0]},
                    { '$lte': [{ '$hour': {'$dateFromString': {'dateString': "$$block.t"}}}, 23]},
                    { '$or': [
                      { '$eq': [{ '$minute': {'$dateFromString': {'dateString': "$$block.t"}}}, 0]},
                      { '$eq': [{ '$minute': {'$dateFromString': {'dateString': "$$block.t"}}}, 10]},
                      { '$eq': [{ '$minute': {'$dateFromString': {'dateString': "$$block.t"}}}, 20]},
                      { '$eq': [{ '$minute': {'$dateFromString': {'dateString': "$$block.t"}}}, 30]},
                      { '$eq': [{ '$minute': {'$dateFromString': {'dateString': "$$block.t"}}}, 40]},
                      { '$eq': [{ '$minute': {'$dateFromString': {'dateString': "$$block.t"}}}, 50]},
                    ]}
                  ]
                }
              }
            }
          }
        });
        break;
      case 'month':
        agg.push({
          '$project': {
            // filter blocks 
            'blocks': {
              '$filter': {
                'input': '$blocks',
                'as': 'block',
                'cond': {
                  // get difficulty from 2 blocks per every 4th hour of the day
                  '$and': [
                    { '$or': [
                      { '$eq': [{ '$hour': {'$dateFromString': {'dateString': "$$block.t"}}}, 0]},
                      { '$eq': [{ '$hour': {'$dateFromString': {'dateString': "$$block.t"}}}, 4]},
                      { '$eq': [{ '$hour': {'$dateFromString': {'dateString': "$$block.t"}}}, 8]},
                      { '$eq': [{ '$hour': {'$dateFromString': {'dateString': "$$block.t"}}}, 12]},
                      { '$eq': [{ '$hour': {'$dateFromString': {'dateString': "$$block.t"}}}, 16]},
                      { '$eq': [{ '$hour': {'$dateFromString': {'dateString': "$$block.t"}}}, 20]},
                    ]},
                    { '$or': [
                      { '$eq': [{ '$minute': {'$dateFromString': {'dateString': "$$block.t"}}}, 0]},
                      { '$eq': [{ '$minute': {'$dateFromString': {'dateString': "$$block.t"}}}, 30]},
                    ]}
                  ]
                }
              }
            }
          }
        });
        break;
      case 'quarter':
        agg.push({
          '$project': {
            // filter blocks 
            'blocks': {
              '$filter': {
                'input': '$blocks',
                'as': 'block',
                'cond': {
                  // get difficulty from 1 block per day
                  '$eq': [{ '$hour': {'$dateFromString': {'dateString': "$$block.t"}}}, 0]
                }
              }
            }
          }
        });
        break;
      case 'year':
        agg.push({
          '$project': {
            // filter blocks 
            'blocks': {
              '$filter': {
                'input': '$blocks',
                'as': 'block',
                'cond': {
                  // get difficulty from 11 blocks per month
                  '$or': [
                    { '$eq': [{ '$dayOfMonth': {'$dateFromString': {'dateString': "$$block.t"}}}, 1]},
                    { '$eq': [{ '$dayOfMonth': {'$dateFromString': {'dateString': "$$block.t"}}}, 4]},
                    { '$eq': [{ '$dayOfMonth': {'$dateFromString': {'dateString': "$$block.t"}}}, 7]},
                    { '$eq': [{ '$dayOfMonth': {'$dateFromString': {'dateString': "$$block.t"}}}, 10]},
                    { '$eq': [{ '$dayOfMonth': {'$dateFromString': {'dateString': "$$block.t"}}}, 13]},
                    { '$eq': [{ '$dayOfMonth': {'$dateFromString': {'dateString': "$$block.t"}}}, 16]},
                    { '$eq': [{ '$dayOfMonth': {'$dateFromString': {'dateString': "$$block.t"}}}, 19]},
                    { '$eq': [{ '$dayOfMonth': {'$dateFromString': {'dateString': "$$block.t"}}}, 22]},
                    { '$eq': [{ '$dayOfMonth': {'$dateFromString': {'dateString': "$$block.t"}}}, 25]},
                    { '$eq': [{ '$dayOfMonth': {'$dateFromString': {'dateString': "$$block.t"}}}, 28]},
                    { '$eq': [{ '$dayOfMonth': {'$dateFromString': {'dateString': "$$block.t"}}}, 31]},
                  ]
                }
              }
            }
          }
        });
        break;
    }
    const result: Array<{
      blocks: Array<{
        localeTimestamp: string,
        difficulty: number
      }>
    }> = await Block.aggregate(agg);
    return {
      data: result[0].blocks.map((block) => Object.values(block))
    };
  };

  async create_txs(block: BlockInfo): Promise<boolean> {
    if (await is_locked('db_index')) {
      console.log('db_index lock file exists...');
      return false;
    }
    for (const txid of block.tx) {
      try {
        await save_tx(txid, block.height);
      } catch (e: any) {
        console.log(`error saving tx ${txid}: %s`, e.message);
        return false;
      }
    }
    return true;
  };
  
  async get_last_blocks_ajax(
    start: number,
    length: number
  ) {
    const data: {
      blocks: BlockDocument[],
      count: number
    } = {
      blocks: await Block.find({})
        .sort({ 'height': -1 })
        .skip(start)
        .limit(length),
      count: await Block.find({}).count()
    };
    return data;
  };

  async get_last_txs_ajax(
    start: number,
    length: number,
    min: number
  ) {
    const data: {
      txs: TransactionDocument[],
      count: number
    } = {
      txs: await Tx.find({ 'total': { $gte: min }})
        .sort({ blockindex: -1 })
        .skip(start)
        .limit(length),
      count: await Tx.find({}).count()
    };
    return data;
  };

  async get_address_txs_ajax(
    hash: string,
    start: number,
    length: number
  ) {
    const addressTxs: AddressTransactionDocument[] = await AddressTx.find({ a_id: hash })
      .sort({ blockindex: -1 })
      // BUG: Order parent->child transactions properly in address history (prevent negative Balance)
      // add sort for ascending amount
      .sort({ amount: 1 })
      .skip(start)
      .limit(length);
    const aggResult = await AddressTx.aggregate([
      { $match: { a_id: hash }},
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
    const { count, balance }: {
      count: number,
      balance: number
    } = aggResult.pop();

    let runningBalance = balance ?? 0;
    const txs: TransactionDocument[] = [];
    for (const addressTx of addressTxs) {
      const tx = await find_tx(addressTx.txid);
      txs.push({
        ...tx,
        balance: runningBalance
      } as TransactionDocument);
      runningBalance -= addressTx.amount;
    }

    return { txs, count };
  };

  
};