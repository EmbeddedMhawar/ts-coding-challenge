import { Given, Then, When } from "@cucumber/cucumber";
import {
  AccountBalanceQuery,
  AccountId,
  Client,
  KeyList,
  PrivateKey,
  TopicCreateTransaction,
  TopicInfoQuery,
  TopicMessageQuery,
  TopicMessageSubmitTransaction
} from "@hashgraph/sdk";
import { accounts } from "../../src/config";
import assert from "node:assert";

// Pre-configured client for test network (testnet).
const client = Client.forTestnet();
client.setMirrorNetwork(["hcs.testnet.mirrornode.hedera.com:5600"]);

// Helper function to get accounts with balance > specified HBARs.
const getAccountsAboveThreshold = async (expectedBalance: number) => {
  const accountsAboveThreshold: Array<{ id: string, privateKey: string, balance: number }> = [];

  for (const account of accounts) {
    const accountId = AccountId.fromString(account.id);
    const txBalanceQuery = new AccountBalanceQuery().setAccountId(accountId);
    const balance = await txBalanceQuery.execute(client);
    const balanceNumber = balance.hbars.toBigNumber().toNumber();

    if (balanceNumber > expectedBalance) {
      accountsAboveThreshold.push({ id: account.id, privateKey: account.privateKey, balance: balanceNumber });
    }
  }
  return accountsAboveThreshold;
};

Given(/^a first account with more than (\d+) hbars$/, async function (expectedBalance: number) {
  const accountsAboveThreshold = await getAccountsAboveThreshold(expectedBalance);
  assert.ok(accountsAboveThreshold.length > 0, "No accounts found with balance > " + expectedBalance);

  const firstAccount = accountsAboveThreshold[0];
  this.firstAccount = firstAccount;
  const firstAccountId: AccountId = AccountId.fromString(firstAccount.id);
  this.firstAccountId = firstAccountId;
  const firstPrivateKey: PrivateKey = PrivateKey.fromStringED25519(firstAccount.privateKey);
  this.firstPrivateKey = firstPrivateKey;

  client.setOperator(this.firstAccountId, firstPrivateKey);

  assert.ok(firstAccount.balance > expectedBalance);

  console.log("\n-------------------------------- First Account Balance ------------------------------");
  console.log("First account id         :", firstAccountId.toString());
  console.log("HBAR account balance     :", firstAccount.balance.toString());
  console.log("-------------------------------------------------------------------------------------");
});

When(/^A topic is created with the memo "([^"]*)" with the first account as the submit key$/, async function (memo: string) {
  const txTopicCreation = await (new TopicCreateTransaction()
    .setSubmitKey(this.firstPrivateKey.publicKey)
    .setTopicMemo(memo)
    .execute(client));

  const txTopicCreationReceipt = await txTopicCreation.getReceipt(client);
  const topicId = txTopicCreationReceipt.topicId;
  this.topicId = topicId;

  assert.ok(topicId, "Topic ID should not be null");

  console.log("\n----------------------------- Topic ID: 1 ------------------------------");
  console.log("The topic ID : " + topicId.toString());
  console.log("------------------------------------------------------------------------");

  const topicInfo = await new TopicInfoQuery().setTopicId(topicId).execute(client);
  assert.ok(topicInfo.topicMemo === memo, "Topic memo is not the same as the memo configured");
});

When(/^The message "([^"]*)" is published to the topic$/, async function (message: string) {
  const txSubmitMessage = new TopicMessageSubmitTransaction()
    .setTopicId(this.topicId)
    .setMessage(message);

  const getMessage = txSubmitMessage.getMessage();

  const sendMessage = await txSubmitMessage.execute(client);
  const getReceipt = await sendMessage.getReceipt(client);
  const transactionStatus = getReceipt.status
  console.log("\n--------------------------- Message Status: ----------------------------");
  console.log("The message transaction status : " + transactionStatus.toString())
  console.log("------------------------------------------------------------------------");

  assert.ok(getMessage?.toString() === message, "Message to be sent is not the same as the message configured");
});

Then(/^The message "([^"]*)" is received by the topic and can be printed to the console$/, function (message: string) {
  console.log("\nSubscribing to topic ID:", this.topicId.toString());
  new TopicMessageQuery()
    .setTopicId(this.topicId)
    .subscribe(client,
      (msg) => {
        if (msg?.contents) {
          const receivedMessage = msg.contents.toString();
          assert.ok(receivedMessage === message, "Message received is not the same as the message sent");
          console.log(`Received message: ${receivedMessage}`);
        } else {
          console.log("Received message is undefined");
        }
      },
      (error) => console.log(`Error: ${error.toString()}`)
    );
});

Given(/^A second account with more than (\d+) hbars$/, async function (expectedBalance: number) {
  const accountsAboveThreshold = await getAccountsAboveThreshold(expectedBalance);
  assert.ok(accountsAboveThreshold.length > 1, "No more accounts found with balance > " + expectedBalance);

  const secondAccount = accountsAboveThreshold[1];
  this.secondAccount = secondAccount;
  const secondAccountId: AccountId = AccountId.fromString(secondAccount.id);
  this.secondAccountId = secondAccountId;
  const secondPrivateKey: PrivateKey = PrivateKey.fromStringED25519(secondAccount.privateKey);
  this.secondPrivateKey = secondPrivateKey;

  assert.ok(secondAccount.balance > expectedBalance);

  console.log("\n-------------------------------- Second Account Balance ------------------------------");
  console.log("Second account id         :", secondAccountId.toString());
  console.log("HBAR account balance     :", secondAccount.balance.toString());
  console.log("-------------------------------------------------------------------------------------");
});

Given(/^A (\d+) of (\d+) threshold key with the first and second account$/, function (threshold: number, total: number) {
  const key1 = PrivateKey.fromStringED25519(this.firstAccount.privateKey);
  const publicKey1 = key1.publicKey;

  const key2 = PrivateKey.fromStringED25519(this.secondAccount.privateKey);
  const publicKey2 = key2.publicKey;

  const keys = [publicKey1, publicKey2];
  const TOTAL_KEY_NUMBER = keys.length;

  this.thresholdKeys = new KeyList(keys, threshold);
  assert.ok(TOTAL_KEY_NUMBER === total, "The total keys required is: " + total.toString() + " | The total keys injected is " + TOTAL_KEY_NUMBER.toString());
});

When(/^A topic is created with the memo "([^"]*)" with the threshold key as the submit key$/, async function (memo: string) {
  const txTopicCreation = new TopicCreateTransaction()
    .setSubmitKey(this.thresholdKeys.publicKey)
    .setTopicMemo(memo);

  const topicMemo = txTopicCreation.getTopicMemo();
  const executeTx = await txTopicCreation.execute(client);

  const txTopicCreationReceipt = await executeTx.getReceipt(client);
  const topicId = txTopicCreationReceipt.topicId;
  this.topicId = topicId;

  assert.ok(topicId, "Topic ID should not be null");

  console.log("\n----------------------------- Topic ID: 2 ------------------------------");
  console.log("The topic ID : " + topicId.toString());
  console.log("Topic memo   : " + topicMemo);
  console.log("------------------------------------------------------------------------");

  assert.ok(topicMemo === memo, "The topic memo is not set yet or is not as expected");
});
