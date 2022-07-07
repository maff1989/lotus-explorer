/**
* The Settings Module reads the settings out of settings.json and provides
* this information to the other modules
*
* Refer to the settings.json.template file for more details
*/
import * as fs from 'fs';
import jsonminify from 'jsonminify';

export default class {
  //The app title, visible e.g. in the browser window
  title = "blockchain";
  //The url it will be accessed from
  address = "explorer.example.com";
  // logo
  logo = "/images/logo.png";
  headerlogo = false;
  //The app favicon fully specified url, visible e.g. in the browser window
  favicon = "favicon.ico";
  //Theme
  theme = "Cyborg";
  //The Port ep-lite should listen to
  port = Number(process.env.PORT) || 3001;
  //coin symbol, visible e.g. MAX, LTC, HVC
  symbol = "BTC";
  //coin name, visible e.g. in the browser window
  coin = "Bitcoin";
  //This setting is passed to MongoDB to set up the database
  dbsettings = {
    "user": "explorer",
    "password": "3xp!0reR",
    "database": "blockchaindb",
    "address" : "localhost",
    "port" : 27017
  };
  //This setting is passed to the wallet
  wallet = { "host" : "127.0.0.1",
    "port" : 8669,
    "username" : "bitcoinrpc",
    "password" : "password"
  };
  //Locale file
  locale = "locale/en.json";
  //Menu items to display
  display = {
    "api": true,
    "markets": true,
    "charts": true,
    "twitter": true,
    "facebook": false,
    "googleplus": false,
    "youtube": false,
    "search": true,
    "richlist": true,
    "movement": true,
    "network": true,
    "navbar_dark": false,
    "navbar_light": false
  };
  //API view
  api = {
    "blockindex": 1337,
    "blockhash": "00000000002db22bd47bd7440fcad99b4af5f3261b7e6bd23b7be911e98724f7",
    "txhash": "c251b0f894193dd55664037cbf4a11fcd018ae3796697b79f5097570d7de95ae",
    "address": "RBiXWscC63Jdn1GfDtRj8hgv4Q6Zppvpwb",
  };
  // markets
  markets = {
    "coin": "JBS",
    "exchange": "BTC",
    "enabled": ['bittrex'],
    "default": "bittrex"
  };
  // richlist/top100 settings
  richlist = {
    "distribution": true,
    "received": true,
    "balance": true
  };
  movement = {
    "min_amount": 100,
    "low_flag": 1000,
    "high_flag": 10000
  };
  //index
  index = {
    "show_hashrate": false,
    "show_market_cap": false,
    "show_market_cap_over_price": false,
    "difficulty": "",
    "last_blocks": 50,
    "last_txs": 100,
    "txs_per_page": 10
  };
  // twitter
  twitter = "iquidus";
  facebook = "yourfacebookpage";
  googleplus = "yourgooglepluspage";
  youtube = "youryoutubechannel";
  // confirmations required before tx considered "safe"
  confirmations = 30;
  //timeouts
  update_timeout = 125;
  check_timeout = 250;
  block_parallel_tasks = 1;
  //genesis
  genesis_tx = "65f705d2f385dc85763a317b3ec000063003d6b039546af5d8195a5ec27ae410";
  genesis_block = "b2926a56ca64e0cd2430347e383f63ad7092f406088b9b86d6d68c2a34baef51";

  use_rpc = true;
  heavy = false;
  lock_during_index = false;
  txcount = 100;
  txcount_per_page = 50;
  show_sent_received = true;
  supply = "COINBASE";
  nethash = "getnetworkhashps";
  nethash_units = "G";
  labels = {};

  reloadSettings = () => {
    // Discover where the settings file lives
    const settingsFilename = "./settings.json";  
    try {
      // read the settings
      const settingsStr = fs.readFileSync(settingsFilename).toString();
      const settingsJsonminify = jsonminify(settingsStr).replace(",]","]").replace(",}","}");
      const settingsParsed = JSON.parse(settingsJsonminify);
      for (const i in settingsParsed) {
        //test if the setting start with a low character
        if (i.charAt(0).search("[a-z]") !== 0) {
          console.warn("Settings should start with a low character: '" + i + "'");
        }
        // we know this setting, so we overwrite it
        if (this[i] !== undefined) {
          // 1.6.2 -> 1.7.X we switched to a new coin RPC with different auth methods
          // This check uses old .user and .pass config strings if they exist, and .username, .password don't.
          if (i == 'wallet') {
            if (
              !settingsParsed.wallet.hasOwnProperty('username')
              && settingsParsed.wallet.hasOwnProperty('user')
            ) {
              settingsParsed.wallet.username = settingsParsed.wallet.user;
            }
            if (
              !settingsParsed.wallet.hasOwnProperty('password')
              && settingsParsed.wallet.hasOwnProperty('pass')
            ) {
              settingsParsed.wallet.password = settingsParsed.wallet.pass;
            }
          }
          this[i] = settingsParsed[i];
        }
      }
    } catch (e: any) {
      return console.warn('Unable to find/load settings.json. Continuing using defaults!');
    }
  };
};
