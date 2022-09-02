import * as lib from 'chronik-client'
import {
  Script,
  Address
} from '@abcpros/bitcore-lib-xpi';

export class Chronik {
  readonly client: lib.ChronikClient = null;

  constructor(chronikUrl: string) {
    this.client = new lib.ChronikClient(chronikUrl);
  };

  public getScriptType(
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
    return inputVal - outputVal;
  };

  private txGetInputAddress(
    vin: lib.TxInput
  ) {
    try {
      return Script.fromString(vin.inputScript).toAddress().toXAddress();
    } catch (e: any) {
      console.error(`tx_get_input_address: ${e.message}`);
      throw new Error(`tx_get_input_address: ${e.message}`);
    }
  };

  public txPrepareVin(
    tx: lib.Tx
  ) {
    for (const input of tx.inputs) {
      const inputAddress = this.txGetInputAddress(input);
    }
  };

  public txPrepareVout(
    vout: lib.TxOutput
  ) {

  };
};
