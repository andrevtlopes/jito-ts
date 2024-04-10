require('dotenv').config();

import {
  Keypair,
  Connection,
  PublicKey,
  VersionedTransaction,
  SystemProgram,
  TransactionMessage,
  VersionedMessage,
} from '@solana/web3.js';
import * as Fs from 'node:fs';

import {searcherClient} from '../../sdk/block-engine/searcher';
import {onBundleResult, onAccountUpdates} from './utils';
import {Bundle} from '../../sdk/block-engine/types';

const main = async () => {
  const blockEngineUrl = process.env.BLOCK_ENGINE_URL || '';
  console.log('BLOCK_ENGINE_URL:', blockEngineUrl);

  const authKeypairPath = process.env.AUTH_KEYPAIR_PATH || '';
  console.log('AUTH_KEYPAIR_PATH:', authKeypairPath);
  const decodedKey = new Uint8Array(
    JSON.parse(Fs.readFileSync(authKeypairPath).toString()) as number[]
  );
  const keypair = Keypair.fromSecretKey(decodedKey);

  const _accounts = (process.env.ACCOUNTS_OF_INTEREST || '').split(',');
  console.log('ACCOUNTS_OF_INTEREST:', _accounts);
  const accounts = _accounts.map(a => new PublicKey(a));

  const bundleTransactionLimit = Number.parseInt(
    process.env.BUNDLE_TRANSACTION_LIMIT || '0'
  );

  const client = searcherClient(blockEngineUrl, keypair);

  const rpcUrl = process.env.RPC_URL || '';
  console.log('RPC_URL:', rpcUrl);
  const conn = new Connection(rpcUrl, 'confirmed');

  let isLeaderSlot = false;

  const recentBlockhash = await conn.getLatestBlockhash('confirmed');

  while (!isLeaderSlot) {
    const nextLeader = await client.getNextScheduledLeader();
    const numSlots = nextLeader.nextLeaderSlot - nextLeader.currentSlot;
    isLeaderSlot = numSlots <= 2;
    console.log("next jito leader slot in", numSlots);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  const jitoTipTx = new VersionedTransaction(
    new TransactionMessage({
      payerKey: keypair.publicKey,
      recentBlockhash: recentBlockhash.blockhash,
      instructions: [
        SystemProgram.transfer({
          fromPubkey: keypair.publicKey,
          toPubkey: new PublicKey(
            'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe'
          ),
          lamports: 50000,
        }),
      ],
    }).compileToV0Message()
  );

  jitoTipTx.sign([keypair]);

  const bundle = new Bundle([jitoTipTx], bundleTransactionLimit);

  const bundleId = await client.sendBundle(bundle);
  console.log('Bundle ID:', bundleId);

  onBundleResult(client);
};

main()
  .then(() => {
    console.log('Back running:', process.env.ACCOUNTS_OF_INTEREST);
  })
  .catch(e => {
    throw e;
  });
