import * as fs from 'fs';
import jsonminify from 'jsonminify';
import settings from './settings';

class Locale {
  menu_explorer = "Explorer";
  menu_api = "API";
  menu_markets = "Markets";
  menu_stats = "Stats";
  menu_richlist = "Rich List";
  menu_reward = "Reward";
  menu_movement = "Movement";
  menu_node = "Nodes";
  menu_network = "Network"
  
  ex_title = "Block Explorer";
  ex_search_title = "Search";
  ex_search_button = "Search";
  ex_search_message = "You may enter a block height; block hash ;tx hash or address.";
  ex_error = "Error!";
  ex_warning = "Warning:";
  ex_search_error = "Search found no results.";
  ex_latest_transactions = "Latest Transactions";
  ex_latest_blocks = "Latest Blocks";
  ex_summary = "Block Summary";
  ex_supply = "Coin Supply";
  ex_block = "Block";
  ex_mempoolinfo = "Mempool";
  ex_rawmempool = "Mempool Data";
  tx_title = "Transaction Details";
  tx_size = "Size";
  tx_fee = "Fee";
  tx_block_hash = "Block Hash";
  tx_recipients = "Recipients";
  tx_contributors = "Contributor(s)";
  tx_hash = "Hash";
  tx_address = "Address";
  tx_nonstandard = "NONSTANDARD TX";
  
  block_title = "Block Details";
  block_previous = "Previous";
  block_next = "Next";
  block_genesis = "GENESIS";
  block_tx_count = "# Transactions";
  block_fees = "Fees";
  block_burned = "Fees Burned";
  block_mined_by = "Mined By";
  
  difficulty = "Difficulty";
  network = "Network";
  height = "Height";
  timestamp = "Timestamp";
  size = "Size";
  transactions = "Transactions";
  total_sent = "Total Sent";
  total_received = "Total Received";
  confirmations = "Confirmations";
  total = "Total";
  bits = "Bits";
  nonce = "Nonce";
  new_coins = "New Coins";
  proof_of_stake = "PoS";
  initial_index_alert = "Indexing is currently incomplete; functionality is limited until index is up-to-date.";
  
  a_menu_showing = "Showing";
  a_menu_txs = "transactions";
  a_menu_all = "All";
  a_qr = "QR Code";
  
  rl_received_coins = "Top 100 - Received Coins";
  rl_current_balance = "Top 100 - Current Balance";
  rl_received = "Received";
  rl_balance = "Balance";
  rl_wealth = "Wealth Distribution";
  rl_top25 = "Top 1-25";
  rl_top50 = "Top 26-50";
  rl_top75 = "Top 51-75";
  rl_top100 = "Top 76-100";
  rl_hundredplus = "101+";
  
  net_addnodes = "Add Nodes";
  net_connections = "Connections";
  net_address = "Address";
  net_protocol = "Protocol";
  net_subversion = "Sub-version";
  net_country = "Country";
  net_warning = "This is simply a sub sample of the network based on wallets connected to this node.";
  
  api_title = "API Documentation";
  api_message = "The block explorer provides an API allowing users and/or applications to retrieve information from the network without the need for a local wallet.";
  api_calls = "API Calls";
  api_getnetworkhashps = "Returns the current network hashrate. (hash/s)";
  api_getdifficulty = "Returns the current difficulty.";
  api_getconnectioncount = "Returns the number of connections the block explorer has to other nodes.";
  api_getblockcount = "Returns the number of blocks currently in the block chain.";
  api_getblockhash = "Returns the hash of the block at ; index 0 is the genesis block.";
  api_getblock = "Returns information about the block with the given hash.";
  api_getrawtransaction = "Returns raw transaction representation for given transaction id. decrypt can be set to 0(false) or 1(true).";
  api_getmaxmoney = 'Returns the maximum possible money supply.';
  api_getmaxvote = 'Returns the maximum allowed vote for the current phase of voting.';
  api_getvote = 'Returns the current block reward vote setting.';
  api_getphase = 'Returns the current voting phase (\'Mint\'; \'Limit\' or \'Sustain\').';
  api_getreward = 'Returns the current block reward; which has been decided democratically in the previous round of block reward voting.';
  api_getsupply = 'Returns the current money supply.';
  api_getnextrewardestimate = 'Returns an estimate for the next block reward based on the current state of decentralized voting.';
  api_getnextrewardwhenstr =  'Returns string describing how long until the votes are tallied and the next block reward is computed.';
  
  // Markets view
  mkt_hours = "24 hours";
  mkt_view_chart = "View 24 hour summary";
  mkt_view_summary = "View 24 hour chart";
  mkt_no_chart = "Chart data is not available via markets API.";
  mkt_high = "High";
  mkt_low = "Low";
  mkt_volume = "Volume";
  mkt_top_bid = "Top Bid";
  mkt_top_ask = "Top Ask";
  mkt_last = "Last Price";
  mkt_yesterday = "Yesterday";
  mkt_change = "Change";
  mkt_sell_orders = "Sell Orders";
  mkt_buy_orders = "Buy Orders";
  mkt_price = "Price";
  mkt_amount = "Amount";
  mkt_total = "Total";
  mkt_trade_history = "Trade History";
  mkt_type = "Type";
  mkt_time_stamp = "Time Stamp";

  // Heavy
  heavy_vote = "Vote";
  heavy_title = "Reward/voting information";
  heavy_cap = "Coin Cap";
  heavy_phase = "Phase";
  heavy_maxvote = "Max Vote";
  heavy_reward = "Reward";
  heavy_current = "Current Reward";
  heavy_estnext = "Est. Next";
  heavy_changein = "Reward change in approximately";
  heavy_key = "Key";
  heavy_lastxvotes = "Last 20 votes";
  
  fides = "Fides-ex";
  poloniex = "Poloniex";
  bittrex = "Bittrex";
  altmarkets = "AltMarkets";
  bleutrade = "Bleutrade";
  yobit = "Yobit";
  cryptsy = "Cryptsy";
  exbitron = "Exbitron";
  empoex = "Empoex";
  ccex = "C-Cex";
  crex = "Crex24";
  tradesatoshi = "TradeSatoshi";

  reload = (locale: string) => {
    const localeFilename = `./${locale}`;
    try {
      const localeStr = fs.readFileSync(localeFilename).toString();
      const localeJsonminify = jsonminify(localeStr).replace(",]","]").replace(",}","}");
      const localeParsed = JSON.parse(localeJsonminify);
      for (const i in localeParsed) {
        // test if the setting start with a low character
        if(i.charAt(0).search("[a-z]") !== 0) {
          console.warn("Settings should start with a low character: '" + i + "'");
        }
        if (this[i]) {
          this[i] = localeParsed[i];
        }
      }
    } catch (e: any) {
      return console.warn('Locale file not found. Continuing using defaults!');
    }
  }
};
const locale = new Locale();
locale.reload(settings.locale);

export default locale;