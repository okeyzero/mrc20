import Logger from "@youpaichris/logger";
const logger = new Logger();
import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import { getFullnodeUrl, SuiClient } from "@mysten/sui.js/client";
import { fromHEX } from "@mysten/sui.js/utils";
class worker {
  #trg;
  #provider;
  #keyPair;
  #address;
  #total;
  #TickRecordId;
  #TICK;
  constructor(privateKey, rpc, total) {
    this.#provider = new SuiClient({ url: rpc });
    this.#total = total;
    this.#trg = `0xebbba763f5fc01d90c2791c03536a373791b634600e81d4e08b85f275f1274fa::movescription::mint`;
    this.#TickRecordId =
      "0xd175b8579ed3ecb823a54aaa52506703b6c18a7fb7ed0a48ae7c14c6d2f5563a";
    this.#TICK = "SUIS";
    this.#keyPair = Ed25519Keypair.fromSecretKey(fromHEX(privateKey));
    this.#address = this.#keyPair.getPublicKey().toSuiAddress();
  }

  async getCoin(ownerAddress, coinType, amountIn) {
    let o = [],
      i = 0n;

    let bal = await this.#provider.getCoins({
      owner: ownerAddress,
      coinType: coinType,
    });
    for (const e of bal.data)
      if (
        (o.push(e.coinObjectId),
        (i += BigInt(e.balance)),
        i >= BigInt(amountIn))
      )
        return {
          success: !0,
          coins: o,
          totalAmount: i,
        };
    if (!bal.hasNextPage)
      return {
        success: !1,
        coins: o,
        totalAmount: i,
      };
  }

  async get_current_epoch() {
    const tick_record = await this.#provider.getObject({
      id: this.#TickRecordId,
      options: { showContent: true, showDisplay: true },
    });
    return parseInt(tick_record.data.content.fields.current_epoch);
  }

  async work() {
    const bal = await this.#provider.getBalance({
      owner: this.#address,
      coinType: "0x2::sui::SUI",
    });
    process.send(`${this.#address} 当前余额: ${bal.totalBalance}`);

    if (bal.totalBalance < 4000000) {
      // throw new Error(`Insufficient balance`);
      logger.error(`${this.#address} Insufficient balance`);
      return;
    }

    let count = 0;
    let last_epochs = -1;
    while (count < this.#total) {
      let current_epoch = await this.get_current_epoch();
      if (last_epochs == current_epoch) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      const tx = await this.mintNft();
      if (tx.digest == undefined) {
        // throw new Error("Unable to submit a transaction");
        continue;
      }
      last_epochs = current_epoch;
      process.send(
        `${this.#address} mint success, hash:${
          tx.digest
        } current_epoch:${current_epoch} successCount:${count}`
      );
      count++;
    }
  }

  async mintNft() {
    //const fee = 900 * Math.pow(10, 9);
    try {
      const txb = new TransactionBlock();
      let fee = 0n;
      const [l] = txb.splitCoins(txb.gas, [txb.pure(fee)]);
      const f = txb.moveCall({
        target: this.#trg,
        arguments: [
          txb.object(this.#TickRecordId),
          txb.pure(this.#TICK),
          l,
          txb.object("0x6"),
        ],
        typeArguments: [],
      });
      return await this.#provider.signAndExecuteTransactionBlock({
        signer: this.#keyPair,
        transactionBlock: txb,
      });
    } catch (error) {
      logger.warn(`${this.#address} mint error: ${error.message}`);
      return error;
    }
  }
}

export default worker;
