import Address from '../models/address';
import Block from '../models/block';
import Tx from '../models/tx';
import BitcoinRpc from 'bitcoin-rpc-promise';

export type AddressDocument = {
  a_id: string,
  balance: number,
  received: number,
  sent: number,
};
export type TransactionDocument = {
  txid: string,
  size: number,
  fee: number,
  vin: Array<{
    addresses: string,
    amount: number,
    num_inputs: number
  }>,
  vout: Array<{
    addresses: string,
    amount: number,
    asm?: string,
  }>,
  total?: number,
  timestamp: number,
  localeTimestamp?: string,
  blockhash: string,
  blockindex: number,
  balance?: number,
};
export type BlockDocument = {
  height: number,
  minedby: string,
  timestamp: number,
  localeTimestamp: string,
  difficulty: number,
  size: number,
  fees: number,
  burned: number,
  txcount: number,
};
export type BlockInfo = {
  hash: string,
  confirmations: number,
  size: number,
  height: number,
  tx: Array<string>,
  time: number,
  difficulty: number,
  nTx: number,
  previousblockhash: string,
  nextblockhash: string,
};
export type MempoolInfo = {
  size: number,
  bytes: number,
};
export type MiningInfo = {
  networkhashps: number,
};
export type PeerInfo = {
  addr: string,
  version: number,
  subver: string,

};
export type TransactionInput = {
  txid: string,
  vout: number,
  coinbase?: string,
};
export type TransactionOutput = {
  value: number,
  scriptPubKey: {
    addresses: Array<string>,
    type: string,
    asm: string
  },
};
export type RawTransaction = {
  txid: string,
  size: number,
  confirmations: number,
  vin: TransactionInput[],
  vout: TransactionOutput[],
  time: number,
  blocktime: number,
  blockhash: string,
};
export type PreparedTransactionInputs = TransactionDocument['vin'];
export type PreparedTransactionOutputs = TransactionDocument['vout'];

const settings = require('./settings')
  , XPI_DIVISOR = 1000000
  , rpc = new BitcoinRpc('http://'
  + `${settings.wallet.username}:`
  + `${settings.wallet.password}@`
  + `${settings.wallet.host}:`
  + `${settings.wallet.port}`);
/**
 * Run command with params against Lotus RPC daemon
 * @param command - RPC command
 * @param params  - RPC command parameters
 * @returns {Promise<any>} Command result
 */
const rpcCommand = async (
  command: string,
  ...params: Array<string | number | boolean>
): Promise<any> => {
  try {
    return await rpc.call(command, params);
  } catch (e: any) {
    return new Error(`RPC error: ${e.message}`);
  }
};

export class Explorer {
  /**
   * Converts XPI units into satoshi units
   * @param amount - Amount of XPI
   * @returns {number} Satoshi units
   */
  convert_to_satoshi(amount: number): number {
    // Lotus has only 6 decimal places
    const fixed = amount.toFixed(6).toString();
    // remove decimal (.) and return integer
    return parseInt(fixed.replace('.', ''));
  };
  /**
   * Converts satoshi units into XPI units
   * @param sats - Amount of satoshis
   * @returns {number} XPI units
   */
  convert_to_xpi(sats: number): number {
    return sats / XPI_DIVISOR;
  }
  /*
  get_peerinfo: function(cb) {
    // RPC call goes here
  },
  */
  /**
   * RPC command - `getdifficulty`
   * @returns {Promise<number>} Raw difficulty
   */
  async get_difficulty(): Promise<number> {
    return await rpcCommand('getdifficulty');
  };
  /**
   * RPC command - `getconnectioncount`
   * @returns {Promise<number>} Raw connection count
   */
  async get_connectioncount(): Promise<number> {
    return await rpcCommand('getconnectioncount');
  };
  /**
   * RPC command - `getmempoolinfo`
   * @returns {Promise<MempoolInfo>} Raw mempool info
   */
  async get_mempoolinfo(): Promise<MempoolInfo> {
    return await rpcCommand('getmempoolinfo');
  };
  /**
   * RPC command - `getrawmempool`
   * @returns {Promise<string[]>} Array of txids
   */
  async get_rawmempool(): Promise<string[]> {
    return await rpcCommand('getrawmempool', true);
  };
  /**
   * RPC command - `getblockcount`
   * @returns {Promise<number>} Raw block count
   */
  async get_blockcount(): Promise<number> {
    return await rpcCommand('getblockcount');
  };
  /**
   * RPC command - `getblockhash`
   * @param height - Block height
   * @returns {Promise<string>} Raw block hash
   */
  async get_blockhash(height: number): Promise<string> {
    return await rpcCommand('getblockhash', height);
  };
  /**
   * RPC command - `getblock`
   * @param hash - Raw block hash
   * @returns {Promise<BlockInfo>} Raw block info
   */
  async get_block(hash: string): Promise<BlockInfo> {
    return await rpcCommand('getblock', hash);
  };
  /**
   * RPC command - `getrawtransaction`
   * @param txid - Raw transaction ID
   * @returns {Promise<RawTransaction} Raw transaction info
   */
  async get_rawtransaction(txid: string): Promise<RawTransaction> {
    return await rpcCommand('getrawtransaction', txid, true);
  };
  /**
   * RPC command - `getmininginfo`
   * 
   * Get hashrate in configured unit from RPC daemon
   * @returns {Promise<string | number>} Converted hashrate, or `-` if configured to not display
   */
  async get_hashrate(): Promise<string | number> {
    if (settings.index.show_hashrate == false) {
      return '-';
    }
    const response: MiningInfo = await rpcCommand('getmininginfo');
    if (response.networkhashps) {
      switch (settings.nethash_units) {
        case 'K':
          return (response.networkhashps / 1000);
        case 'M':
          return (response.networkhashps / 1000000);
        case 'G':
          return (response.networkhashps / 1000000000);
        case 'T':
          return (response.networkhashps / 1000000000000);
        case 'P':
          return (response.networkhashps / 1000000000000000);
        default:
          return response.networkhashps;
      }
    }
    return 0;
  };
  async get_peerinfo(): Promise<PeerInfo[]> {
    return await rpcCommand('getpeerinfo');
  };
  /**
   * Fetch all address balances from database and calculate available supply
   * @returns {Promise<number>} Sum of all address balances in satoshis
   */
  async balance_supply(): Promise<number> {
    const data = { totalBalance: 0 };
    const docs: AddressDocument[] = await Address.aggregate([
      { $match: { balance: { $gt: 0 }}}
    ]);
    docs.forEach(doc => data.totalBalance += doc.balance);
    return data.totalBalance;
  };
  /**
   * Fetch all transactions from specified block from database and calculate fees paid/burned
   * @param height - Block height
   * @returns Object containing blockFees and blockFeesBurned in satoshis
   */
  async get_block_fees(height: number): Promise<{
    blockFees: number,
    blockFeesBurned: number,
  }> {
    const data = { blockFees: 0, blockFeesBurned: 0 };
    const docs: TransactionDocument[] = await Tx.find({ 'blockindex': height }, 'fee');
    docs.forEach(doc => data.blockFees += doc.fee);
    data.blockFeesBurned = Math.round(data.blockFees / 2);
    return data;
  };
  /**
   * Fetch all blocks from database and calculate burned supply
   * @returns {Promise<number>} Total burned supply in satoshis
   */
  async get_burned_supply(): Promise<number> {
    const data = { totalBurned: 0 };
    const docs: BlockDocument[] = await Block.aggregate([
      { $match: { burned: { $gt: 0 }}}
    ]);
    docs.forEach(doc => data.totalBurned += doc.burned);
    return data.totalBurned;
  };
  /**
   * Fetch the available supply
   * @returns {Promise<number>} Total supply in XPI
   */
  async get_supply(): Promise<number> {
    // only supports BALANCE supply
    const supply = await this.balance_supply();
    return supply;
  };
  /**
   * Check if block at specified height has been orphaned by the network
   * 
   * If block orphaned, check previous blocks to find most recent, non-orphaned block
   * @param height - Block height
   * @returns {Promise<number>} Block height of non-orphaned block
   */
  async is_block_orphaned(height: number): Promise<number> {
    const blockhash = await this.get_blockhash(height);
    const block = await this.get_block(blockhash);
    // if confirmations is -1, then this block is orphaned!
    return block.confirmations === -1
      // check previous block height too to make sure no orphan
      ? await this.is_block_orphaned(height--)
      // block at this height is not orphaned; return this good height
      // calling will determine if processing for orphaned blocks is required
      : height;
  };
  /**
   * Calculate total input/output value
   * @param array - Prepared inputs or outputs
   * @returns {Promise<number>} Total amount in satoshis
   */
  async calculate_total(
    array: PreparedTransactionInputs | PreparedTransactionOutputs
  ): Promise<number> {
    const data = { total: 0 };
    array.forEach((entry: any) => data.total += entry.amount)
    return data.total;
  };

  /**
   * Calculate transaction fee
   * @param vout - Prepared outputs
   * @param vin - Prepared inputs
   * @returns {Promise<number>} Total transaction fee in satoshis
   */
  async calculate_fee(
    vout: PreparedTransactionOutputs,
    vin: PreparedTransactionInputs
  ): Promise<number> {
    const totalVin = await this.calculate_total(vin);
    const totalVout = await this.calculate_total(vout);
    return (totalVin - totalVout);
  };
  /**
   * Prepare raw vout for database storage
   * @param vout - Raw transaction `vout` array
   * @returns Prepared outputs
   */
  async prepare_vout(vout: TransactionOutput[]) {
    const data: {
      vout: PreparedTransactionOutputs,
      burned: number
    } = { vout: [], burned: 0 };

    for (const output of vout) {
      const amount = this.convert_to_satoshi(output.value);
      const { addresses, type } = output.scriptPubKey;
      switch (type) {
        case 'nonstandard':
          continue;
        case 'nulldata':
          data.burned += amount;
      }
      const address = type == 'nulldata'
        ? "OP_RETURN"
        : addresses[0];
      const index = data.vout.findIndex(vout => vout.addresses == address);
      index < 0
        ? data.vout.push({
            addresses: address,
            amount
          })
        : data.vout[index].amount += amount;
    }

    return data;
  };
  /**
   * Prepare raw vin for database storage
   * @param tx - Raw transaction info
   * @returns Prepared inputs
   */
  async prepare_vin(tx: RawTransaction) {
    const { vin, vout } = tx;
    const data: {
      vin: PreparedTransactionInputs,
    } = { vin: [] };

    for (const input of vin) {
      const inputAddresses = await this.get_input_addresses(input, vout);
      const [ { hash, amount } ] = inputAddresses;
      const index = data.vin.findIndex(vin => vin.addresses == hash)
      if (index < 0) {
        data.vin.push({ addresses: hash, amount: amount, num_inputs: 1 });
      } else {
        data.vin[index].amount += amount;
        data.vin[index].num_inputs += 1;
      }
    }

    return data;
  };
  /**
   * Gather the address/amount used by vin
   * @param vin - Raw vin
   * @param vouts - Raw vout
   * @returns Array of input addresses
   */
  private async get_input_addresses(
    vin: TransactionInput,
    vouts: TransactionOutput[]
  ) {
    const data: {
      addresses: Array<{
        hash: string,
        amount: number
      }>
    } = { addresses: [] };

    if (vin.coinbase) {
      const amount = vouts.reduce((a, b) => a + b.value, vouts[0].value);
      const sats = this.convert_to_satoshi(amount);
      data.addresses.push({ hash: 'coinbase', amount: sats });
    } else {
      const tx = await this.get_rawtransaction(vin.txid);
      const vout = tx.vout[vin.vout];
      const sats = this.convert_to_satoshi(vout.value);
      data.addresses.push({ hash: vout.scriptPubKey.addresses[0], amount: sats });
    }

    return data.addresses;
  };
};