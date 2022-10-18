import * as lib from 'chronik-client'
import {
  Script,
  Address,
} from '@abcpros/bitcore-lib-xpi';
import * as Tx from '../models/tx';

export class Chronik {
  readonly client: lib.ChronikClient = null;

  constructor(chronikUrl: string) {
    this.client = new lib.ChronikClient(chronikUrl);
  };

  public async addressGetHistory(
    address: string,
    page: number,
    pageSize: number
  ) {
    try {
      const script = this.getScriptEndpoint(address);
      return await script.history(page, pageSize);
    } catch (e: any) {
      throw new Error(`addressGetHistory: ${e.message}`);
    }
  };

  public async addressGetUtxos(
    address: string
  ) {
    try {
      const script = this.getScriptEndpoint(address);
      return await script.utxos();
    } catch (e: any) {
      throw new Error(`addressGetUtxos: ${e.message}`);
    }
  };

  public async txFetch(
    txid: string
  ) {
    try {
      return await this.client.tx(txid);
    } catch (e: any) {
      throw new Error(`txFetch: ${e.message}`);
    }
  };

  private getScriptEndpoint(
    address: string
  ) {
    try {
      const { scriptHex, scriptType } = this.getScriptFromAddress(address);
      return this.client.script(scriptType, scriptHex);
    } catch (e: any) {
      throw new Error(`chronikGetScript: ${e.message}`);
    }
  };

  private getAddressFromScript(
    scriptHex: string
  ) {
    try {
      const script = Script.fromHex(scriptHex);
      // assume coinbase input if classified as Unknown
      if (script.classify() == 'Unknown') {
        return 'coinbase';
      }
      const address = script.toAddress();
      return address.toXAddress()
    } catch (e: any) {
      throw new Error(`txGetInputAddress: ${e.message}`);
    }
  };

  private getScriptFromAddress(
    address: string
  ): {
    scriptHex: string,
    scriptType: lib.ScriptType
  } {
    try {
      if (!Address.isValid(address)) {
        throw new Error('address is invalid');
      }
      const script = Script.fromAddress(address);
      const scriptHex = script.getData().toString('hex');
      const scriptType = this.getScriptType(script.toAddress());
      return { scriptHex, scriptType };
    } catch (e: any) {
      throw new Error(`addressToScript: ${e.message}`);
    }
  };

  private getScriptType(
    scriptToAddress: Address
  ) {
    switch (true) {
      case scriptToAddress.isPayToPublicKeyHash():
        return 'p2pkh';
      case scriptToAddress.isPayToScriptHash():
        return 'p2sh';
      default:
        return 'other';
    };
  };

  public txCalculateFee(
    inputs: lib.TxInput[],
    outputs: lib.TxOutput[]
  ) {
    const inputVal = inputs.reduce((a, b) => a + Number(b.value), 0);
    const outputVal = outputs.reduce((a, b) => a + Number(b.value), 0);
    return Math.round(inputVal - outputVal);
  };

  public txPrepareVin(
    inputs: lib.TxInput[]
  ) {
    const data: {
      vin: Tx.Document['vin']
    } = { vin: [] };
    for (const input of inputs) {
      const { value, inputScript } = input;
      const amount = Number(value);
      try {
        const inputAddress = this.getAddressFromScript(inputScript);
        const index = data.vin.findIndex(vin => vin.addresses == inputAddress);
        if (index < 0) {
          data.vin.push({
            addresses: inputAddress,
            amount: amount,
            num_inputs: 1
          })
        } else {
          data.vin[index].amount += amount;
          data.vin[index].num_inputs += 1;
        }
      } catch (e: any) {
        throw new Error(`txPrepareVin: ${e.message}`);
      }
    }
    return data;
  };

  public txPrepareVout(
    outputs: lib.TxOutput[]
  ) {
    const data: {
      vout: Tx.Document['vout'],
      burned: number
    } = { vout: [], burned: 0 };
    for (const output of outputs) {
      const { value, outputScript } = output;
      const amount = Number(value);
      const script = Script.fromHex(outputScript);
      const type = script.classify();
      switch (type) {
        case 'Unknown':
          continue;
        // OP_RETURN
        case 'Data push':
          data.burned += amount;
          if (amount > 0) {
            data.vout.push({
              addresses: "OP_RETURN",
              amount,
              asm: script.toASM()
            });
          }
          continue;
      }
      const address = script.toAddress().toXAddress();
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
};
