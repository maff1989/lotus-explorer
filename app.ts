import express from 'express';
import path from 'path';
import favicon from 'static-favicon';
import bitcoinapi from 'bitcoin-node-api';
import logger from 'morgan';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import router from './routes';
import { Explorer, TransactionDocument } from './lib/explorer';
import { Database } from './lib/database';

const settings = require('./lib/settings')
  , package_metadata = require('./package.json')
  , db = new Database()
  , lib = new Explorer()
  , locale = require('./lib/locale');
// Set Up BitcoinAPI
bitcoinapi.setWalletDetails(settings.wallet);
bitcoinapi.setAccess('only', [
  'getinfo', 'getnetworkhashps', 'getmininginfo',
  'getdifficulty', 'getconnectioncount', 'getblockcount',
  'getblockhash', 'getblock', 'getrawtransaction',
  'getpeerinfo', 'gettxoutsetinfo', 'verifymessage',
]);
// Set Up PUG
const app = express();
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');
app.use(favicon(path.join(__dirname, settings.favicon)));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
// Set Up Routes
app.use('/api', bitcoinapi.app);
app.use('/', router);
app.use('/ext/getmoneysupply', async (req, res) => {
  const stats = await db.get_stats(settings.coin);
  return res.send(` ${stats.supply}`);
});
app.use('/ext/getburnedsupply', async (req, res) => {
  const stats = await db.get_stats(settings.coin);
  return res.send(` ${stats.burned}`);
});
app.use('/ext/getaddress/:address', async (req, res) => {
  const last_txs: Array<{
    txid: string,
    type: string
  }> = [];
  const { address } = req.params;
  try {
    const dbAddress = await db.get_address(address);
    const addressTxsAjax = await db.get_address_txs_ajax(
      address, 0, settings.txcount
    );
    const { sent, received, balance } = dbAddress;
    const { txs } = addressTxsAjax;
    for (const tx of txs) {
      const { txid } = tx ?? null;
      const value = { vin: 0, vout: 0 };
      value.vin += tx.vin?.find(vin => vin.addresses == address).amount ?? 0;
      value.vout += tx.vout?.find(vout => vout.addresses == address).amount ?? 0;
      const type = value.vin > value.vout ? 'vin': 'vout';
      last_txs.push({ txid, type });
    }
    return res.send({
      address,
      sent: lib.convert_to_xpi(sent),
      received: lib.convert_to_xpi(received),
      balance: lib.convert_to_xpi(balance)
        .toString()
        .replace(/(^-+)/mg, ''),
      last_txs
    });
  } catch (e: any) {
    return res.send({ error: 'address not found', address });
  }
});
app.use('/ext/gettx/:txid', async (req, res) => {
  const { txid } = req.params;
  const renderData: {
    active: string,
    tx: TransactionDocument,
    confirmations: number,
    blockcount: number
  } = {
    active: 'tx',
    tx: null,
    confirmations: settings.confirmations,
    blockcount: null
  };
  // process db tx
  const dbTx = await db.get_tx(txid);
  if (dbTx) {
    renderData.tx = dbTx;
    // get last block height from Stats db
    const stats = await db.get_stats(settings.coin);
    renderData.blockcount = stats.last;
    return res.send(renderData);
  }
  // check mempool for tx
  // if tx isn't there either, assume invalid
  const mempool = await lib.get_rawmempool();
  if (!mempool.includes(txid)) {
    return res.send({ error: `transaction not found`, txid });
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
});
app.use('/ext/getbalance/:address', async (req, res) => {
  const { address } = req.params;
  try {
    const dbAddress = await db.get_address(address);
    return res.send(lib.convert_to_xpi(dbAddress.balance)
      .toString()
      .replace(/(^-+)/mg, ''));
  } catch (e: any) {
    return res.send({ error: 'address not found', address });
  }
});
app.use('/ext/getdistribution', async (req, res) => {
  try {
    const dbRichlist = await db.get_richlist(settings.coin);
    const dbStats = await db.get_stats(settings.coin);
    return res.send(await db.get_distribution(dbRichlist, dbStats));
  } catch (e: any) {
    return res.send({ error: `distribution for ${settings.coin} not found` });
  }
});

// Locals
app.set('title', settings.title);
app.set('iquidus_version', package_metadata.version);
app.set('symbol', settings.symbol);
app.set('coin', settings.coin);
app.set('locale', locale);
app.set('display', settings.display);
app.set('markets', settings.markets);
app.set('twitter', settings.twitter);
app.set('facebook', settings.facebook); 
app.set('googleplus', settings.googleplus);
app.set('youtube', settings.youtube);
app.set('genesis_block', settings.genesis_block);
app.set('index', settings.index);
app.set('use_rpc', settings.use_rpc);
app.set('heavy', settings.heavy);
app.set('lock_during_index', settings.lock_during_index);
app.set('txcount', settings.txcount);
app.set('txcount_per_page', settings.txcount_per_page);
app.set('nethash', settings.nethash);
app.set('nethash_units', settings.nethash_units);
app.set('show_sent_received', settings.show_sent_received);
app.set('logo', settings.logo);
app.set('headerlogo', settings.headerlogo);
app.set('theme', settings.theme);
app.set('labels', settings.labels);
// catch 404 and forward to error handler
app.use(async (req, res, next) => {
  next({
    message: 'Not Found',
    status: 404
  });
});
// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use((err, req, res, next) => {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}
// production error handler
// no stacktraces leaked to user
app.use((err, req, res, next) => {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});

export default app;
