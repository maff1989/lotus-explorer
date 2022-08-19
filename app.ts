import express from 'express';
import path from 'path';
import favicon from 'static-favicon';
import bitcoinapi from 'bitcoin-node-api';
import logger from 'morgan';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import router from './routes';
import { Explorer } from './lib/explorer';
import { Database } from './lib/database';
import settings from './lib/settings';
import locale from './lib/locale';

const package_metadata = require('./package.json')
  , db = new Database()
  , lib = new Explorer();
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
