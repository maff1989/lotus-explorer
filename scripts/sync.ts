import { Explorer } from '../lib/explorer';
import settings from '../lib/settings';
import {
  is_locked,
  create_lock,
  remove_lock,
  Database
} from '../lib/database';
import * as Address from '../models/address';
import * as AddressTx from '../models/addresstx';
import * as Block from '../models/block';
import * as Richlist from '../models/richlist';
import * as Stats from '../models/stats';
import * as Tx from '../models/tx';

let MODE = 'update';
let DATABASE = 'index';

// displays usage and exits
const printUsageAndExit = () => {
  console.log('Usage: node scripts/sync.js [database] [mode]');
  console.log('');
  console.log('database: (required)');
  console.log('index        Main index: coin info/stats, transactions & addresses');
  console.log('market       Market data: summaries, orderbooks, trade history & chartdata')
  console.log('');
  console.log('mode: (required for index database only)');
  console.log('update       Updates index from last sync to current block');
  console.log('reindex      Clears index then resyncs from genesis to current block');
  console.log('');
  console.log('notes:');
  console.log('* \'current block\' is the latest created block when script is executed.');
  console.log('* The market database only supports (& defaults to) reindex mode.');
  console.log('* If check mode finds missing data(ignoring new data since last sync),');
  console.log('  index_timeout in settings.json is set too low.')
  console.log('');
  process.exit(1);
};

// check options
if (process.argv[2] == 'index') {
  if (process.argv.length <3) {
    printUsageAndExit();
  } else {
    switch(process.argv[3])
    {
      case 'update':
        MODE = 'update';
        break;
      case 'check':
        MODE = 'check';
        break;
      case 'reindex':
        MODE = 'reindex';
        break;
      case 'reindex-rich':
        MODE = 'reindex-rich';
        break;
      default:
        printUsageAndExit();
    }
  }
} else if (process.argv[2] == 'market'){
  DATABASE = 'market';
} else {
  printUsageAndExit();
}

const db = new Database();
const lib = new Explorer();

const main = async () => {
  // exit if already running
  if (await is_locked(DATABASE)) {
    console.log('Script already running...');
    process.exit(2);
  }
  try {
    // Init
    await create_lock(DATABASE)
    await db.connect();
    // Sanity checks
    const stats = await db.check_stats(settings.coin);
    if (!stats) {
      throw new Error('Run \'npm start\' to create database structures before running this script.');
    }
    // Proceed with db modifications
    switch (DATABASE) {
      case 'market':
        const markets = settings.markets.enabled;
        for (const market of markets) {
          if (await db.check_market(market)) {
            await db.update_markets_db(market);
            console.log('%s market data updated successfully.', market);
          }
        }
        break;
      case 'index':
        const blockcount = await lib.get_blockcount();
        console.log('blockcount', blockcount);
        // rewind index state if last good block comes before last saved block
        const blockLastGood = await lib.is_block_orphaned(stats.last);
        if (blockLastGood < stats.last) {
          console.log(`ORPHAN FOUND: height: %s`, blockLastGood + 1);
          await db.rewind_db(stats.last, blockLastGood + 1);
          // update indexes from the last good block height
          stats.last = blockLastGood;
        }
        // exit if already up-to-date and not rewinding
        else if (stats.last == blockcount) {
          console.log('Database is already up-to-date (block: %s)', blockcount);
          process.exit(0);
        }
        switch (MODE) {
          case 'reindex':
            // Delete/reset
            await Tx.Model.deleteMany({});
            console.log('TXs cleared.');
            await Address.Model.deleteMany({});
            console.log('Addresses cleared.');
            await AddressTx.Model.deleteMany({});
            console.log('Address TXs cleared.');
            await Block.Model.deleteMany({});
            console.log('Blocks cleared');
            await Richlist.Model.updateOne({ coin: settings.coin }, {
              received: [],
              balance: [],
            });
            console.log('Richlist reset.');
            await Stats.Model.updateOne({ coin: settings.coin }, {
              last: 0,
              count: 0,
              supply: 0,
              burned: 0,
            });
            console.log('Stats reset.');
            // Resync
            await db.update_tx_db(settings.coin, 1, blockcount);
            console.log("update_tx_db complete");
            await db.update_richlist('received');
            console.log("update_richlist (received) complete");
            await db.update_richlist('balance');
            console.log("update_richlist (balance) complete");
            await db.update_stats(settings.coin, blockcount);
            console.log("update_stats complete");
            console.log('reindex complete (block: %s)', blockcount);
            break;
          case 'check':
            // not implemented in the Database class code
            break;
          case 'update':
            await db.update_tx_db(settings.coin, stats.last + 1, blockcount);
            console.log("update_tx_db complete");
            await db.update_charts_db();
            console.log("update_charts_db complete");
            await db.update_richlist('received');
            console.log("update_richlist (received) complete");
            await db.update_richlist('balance');
            console.log("update_richlist (balance) complete");
            await db.update_stats(settings.coin, blockcount);
            console.log("update_stats complete");
            console.log('update complete (block: %s)', blockcount);
            break;
          case 'reindex-rich':
            break;
        }
        break;
    }
    await db.disconnect();
    await remove_lock(DATABASE)
  } catch (e: any) {
    await db.disconnect();
    console.log(e.message);
    process.exit(1);
  }
};
main();