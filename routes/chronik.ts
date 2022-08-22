import express from 'express';
import { ChronikClient } from 'chronik-client';
import { Script } from '@abcpros/bitcore-lib-xpi';
import { Explorer } from '../lib/explorer';

const lib = new Explorer()
  , chronikClient = new ChronikClient('http://172.16.10.89:7123');
const chronikRouter = express.Router();

chronikRouter.get('/utxos/:address', async (req, res) => {
  const { address } = req.params;
  try {
    const { isvalid } = await lib.validate_address(address);
    if (!isvalid) {
      throw new Error('address is invalid');
    }
    const decoded = Script.fromAddress(String(address));
    const pkh = decoded.getPublicKeyHash().toString('hex');
    const script = chronikClient.script('p2pkh', pkh);
    return res.send(await script.utxos());
  } catch (e: any) {
    console.log(`${req.url}: ${e.message}`);
    return res.send({ error: `failed to fetch UTXOs for ${address}` })
  }
});

export default chronikRouter;
