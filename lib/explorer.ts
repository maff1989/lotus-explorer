const settings = require('./settings');
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
  total: number,
  timestamp: number,
  localeTimestamp: string,
  blockhash: string,
  blockindex: number,
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

const XPI_DIVISOR = 1000000;
const rpc = new BitcoinRpc('http://'
  + `${settings.wallet.username}:`
  + `${settings.wallet.password}@`
  + `${settings.wallet.host}:`
  + `${settings.wallet.port}`);

const rpcCommand = async (command: string, params: Array<string | number | boolean> = []) => {
  try {
    return await rpc.call(command, ...params);
  } catch (e: any) {
    return new Error(`RPC error: ${e.message}`);
  }
};

export class Explorer {

  convert_to_satoshi(amount: number): number {
    // Lotus has only 6 decimal places
    const fixed = amount.toFixed(6).toString();
    // remove decimal (.) and return integer
    return parseInt(fixed.replace('.', ''));
  };

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
  /*
  get_peerinfo: function(cb) {
    // RPC call goes here
  },
  */

  async get_difficulty(): Promise<number> {
    return await rpcCommand('getdifficulty');
  };

  async get_connectioncount(): Promise<number> {
    return await rpcCommand('getconnectioncount');
  };

  // get basic information about the mempool
  async get_mempoolinfo(): Promise<MempoolInfo> {
    return await rpcCommand('getmempoolinfo');
  };

  // get all transactions in the mempool
  async get_rawmempool(): Promise<string[]> {
    return await rpcCommand('getrawmempool', [ true ]);
  };

  async get_blockcount(): Promise<number> {
    return await rpcCommand('getblockcount');
  };

  async get_blockhash(height: number): Promise<string> {
    return await rpcCommand('getblockhash', [ height ]);
  };

  async get_block(hash: string): Promise<BlockInfo> {
    return await rpcCommand('getblock', [ hash ]);
  };

  async get_rawtransaction(hash: string): Promise<RawTransaction> {
    return await rpcCommand('getrawtransaction', [ hash, true ]);
  };

  async balance_supply(): Promise<number> {
    const data = { totalBalance: 0 };
    const docs: AddressDocument[] = await Address.find({}, 'balance').where('balance').gt(0);
    docs.forEach(doc => data.totalBalance += doc.balance);
    return data.totalBalance;
  };

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

  // return burned supply in XPI
  async get_burned_supply(): Promise<number> {
    const data = { totalBurned: 0 };
    const docs: BlockDocument[] = await Block.find({}, 'burned').where('burned').gt(0);
    docs.forEach(doc => data.totalBurned += doc.burned);
    return data.totalBurned;
  };

  async get_supply(): Promise<number> {
    // only supports BALANCE supply
    const supply = await this.balance_supply();
    return (supply / XPI_DIVISOR);
  };

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

  async calculate_total(
    array: PreparedTransactionInputs | PreparedTransactionOutputs
  ): Promise<number> {
    const data = { total: 0 };
    array.forEach((entry: any) => data.total += entry.amount)
    return data.total;
  };

  // get the fee rate of the tx in satoshis per byte (3 decimal places accuracy)
  // use vout and vin from prepare_vout() and prepare_vin()
  async calculate_fee(
    vout: PreparedTransactionOutputs,
    vin: PreparedTransactionInputs
  ): Promise<number> {
    const totalVin = await this.calculate_total(vin);
    const totalVout = await this.calculate_total(vout);
    return (totalVin - totalVout);
  };

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
      const index = data.vout.findIndex(vout => vout.addresses == addresses[0]);
      index < 0
        ? data.vout.push({
            addresses: type == 'nulldata' ? "OP_RETURN": addresses[0],
            amount
          })
        : data.vout[index].amount += amount;
    }

    return data;
  };

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