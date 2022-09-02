import express from 'express';
import { Script, Address } from '@abcpros/bitcore-lib-xpi';
import { Chronik } from '../lib/chronik';
import settings from '../lib/settings';

const chronik = new Chronik(
  `http://${settings.chronik.host}:` +
  `${settings.chronik.port}` +
  `${settings.chronik.uri}`
);

const chronikRouter = express.Router();
chronikRouter.get('/utxos/:address', async (req, res) => {
  const address = String(req.params.address);
  try {
    if (!Address.isValid(address)) {
      throw new Error('address is invalid');
    }
    const script = Script.fromAddress(address);
    const scriptType = chronik.getScriptType(script.toAddress());
    const utxos = await chronik.client
      .script(scriptType, script.getData().toString('hex'))
      .utxos();
    return res.send(utxos);
  } catch (e: any) {
    console.log(`${req.url}: ${e.message}`);
    return res.send({ error: `failed to fetch UTXOs for ${address}` });
  }
});
chronikRouter.get('/block/:hashOrHeight', async (req, res) => {
  const { hashOrHeight } = req.params;
  try {
    const block = await chronik.client.block(
      isNaN(Number(hashOrHeight))
        ? hashOrHeight
        : Number(hashOrHeight));
    return res.send(block);
  } catch (e: any) {
    console.log(`${req.url}: ${e.message}`);
    return res.send({ error: `failed to fetch block for ${hashOrHeight}` });
  }
});
chronikRouter.get('sendtx/:rawTx', async (req, res) => {
  const rawTx = String(req.params.rawTx);
  const skipSlpCheck = true;
  try {
    const { txid } = await chronik.client.broadcastTx(rawTx, skipSlpCheck);
    return res.send(txid);
  } catch (e: any) {
    console.log(`${req.url}: ${e.message}`);
    return res.send({ error: `failed to send rawTx ${rawTx}` });
  }
});
chronikRouter.get('/tx/:txid', async (req, res) => {
  const txid = String(req.params.txid);
  try {
    const tx = await chronik.client.tx(txid);
    return res.send(tx);
  } catch (e: any) {
    console.log(`${req.url}: ${e.message}`);
    return res.send({ error: `failed to fetch transaction for ${txid}` });
  }
});

export default chronikRouter;
