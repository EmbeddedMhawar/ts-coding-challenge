import { Given, Then, When } from "@cucumber/cucumber";
import {
  AccountBalanceQuery,
  AccountId,
  Client, KeyList,
  PrivateKey, RequestType,
  TopicCreateTransaction, TopicInfoQuery,
  TopicMessageQuery, TopicMessageSubmitTransaction
} from "@hashgraph/sdk";
import { accounts } from "../../src/config";
import assert from "node:assert";

// Config Topic memo and message
const config = {
    memo: "Taxi rides",
    message: "Ride from A to B"
    }

// Pre-configured client for test network (testnet)
const client = Client.forTestnet()

// Helper function to get accounts with balance > specified HBARs
const getAccountsAboveThreshold = async (expectedBalance: number) => {
  const accountsAboveThreshold: Array<typeof accounts[0]> = [];

  for (const account of accounts) {
    const accountId = AccountId.fromString(account.id);
    const query = new AccountBalanceQuery().setAccountId(accountId);
    const balance = await query.execute(client);

    if (balance.hbars.toBigNumber().toNumber() > expectedBalance) {
      accountsAboveThreshold.push(account);
    }
  }

  return accountsAboveThreshold;
};


Given(/^a first account with more than (\d+) hbars$/, async function (expectedBalance: number) {
// function to check the first account in accounts array that has more than 10 hbars
  const accountsAboveThreshold = await getAccountsAboveThreshold(expectedBalance);

  // Check if there is at least one account with balance > expectedBalance
  assert.ok(accountsAboveThreshold.length > 0, "No accounts found with balance > " + expectedBalance);

  const firstAccount = accountsAboveThreshold[0];
  this.firstAccount = firstAccount;
  const firstAccountId: AccountId = AccountId.fromString(firstAccount.id);
  this.firstAccountId = firstAccountId;
  const firstPrivateKey: PrivateKey = PrivateKey.fromStringED25519(firstAccount.privateKey);
  this.firstPrivateKey = firstPrivateKey;
  client.setOperator(this.firstAccountId, firstPrivateKey);

  // Create the query request for validating the account balance is greater than expectedBalance
  const query = new AccountBalanceQuery().setAccountId(firstAccountId);
  const balance = await query.execute(client);
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance);
  console.log("-------------------------------- Account Balance ------------------------------");
  console.log("First account id         :", firstAccountId.toString());
  console.log("HBAR account balance     :", balance.hbars.toString());
});

When(/^A topic is created with the memo "([^"]*)" with the first account as the submit key$/, async function (memo: string) {
  const topic = await (await new TopicCreateTransaction()
    .setSubmitKey(this.firstPrivateKey.publicKey)
    .setTopicMemo(config.memo)
    .execute(client))
    .getReceipt(client)

  this.topic = topic
  assert.ok(topic.topicId, "Topic ID should not be null");

  const topicInfo = await new TopicInfoQuery().setTopicId(topic.topicId).execute(client)
  assert.ok(topicInfo.topicMemo == memo, "Topic memo is not the same as the memo configured");
});

When(/^The message "([^"]*)" is published to the topic$/, async function (message: string) {
  const transaction = new TopicMessageSubmitTransaction().setTopicId(this.topic.topicId).setMessage(config.message);
  const getMessage = transaction.getMessage();
  assert.ok(getMessage?.toString() == message, "Message to be sent is not the same as the message configured");
});

Then(/^The message "([^"]*)" is received by the topic and can be printed to the console$/, function (message: string) {
   new TopicMessageQuery()
      .setTopicId(this.topic.topicId)
      .subscribe(
          client,
          (msg) => {
            assert.ok(msg?.contents.toString() == message, "Message received is not the same as the message sent");
            console.log(`Received message: ${msg?.contents.toString()}`)
          },
          (error) => console.log(`Error: ${error.toString()}`)
      );
});

Given(/^A second account with more than (\d+) hbars$/, async function (expectedBalance: number) {
  // function to check the second account in accounts array that has more than 10 hbars
    const accountsAboveThreshold = await getAccountsAboveThreshold(expectedBalance);

  // Check if there is at least one account with balance > expectedBalance
    assert.ok(accountsAboveThreshold.length > 1, "No more accounts found with balance > " + expectedBalance);
  // function to check the second account in accounts array that has more than 10 hbars
    const secondAccount = accountsAboveThreshold[1];
    this.secondAccount = secondAccount;

    const secondAccountId: AccountId = AccountId.fromString(secondAccount.id);
    this.secondAccountId = secondAccountId;

    const secondPrivateKey: PrivateKey = PrivateKey.fromStringED25519(secondAccount.privateKey);
    this.secondPrivateKey = secondPrivateKey;

    client.setOperator(this.secondAccountId, secondPrivateKey);
  
    // Create the query request
    const query = new AccountBalanceQuery().setAccountId(secondAccountId);
    const balance = await query.execute(client);

    assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance);

    console.log("-------------------------------- Account Balance ------------------------------");
    console.log("Second account id         :", secondAccountId.toString());
    console.log("HBAR account  balance     :", balance.hbars.toString());

});

Given(/^A (\d+) of (\d+) threshold key with the first and second account$/, function (threshold: number, total: number) {
  //Generate 2 keys
  const key1 = PrivateKey.fromStringED25519(this.firstAccount.privateKey);
  const publicKey1 = key1.publicKey;

  const key2 = PrivateKey.fromStringED25519(this.secondAccount.privateKey);
  const publicKey2 = key2.publicKey;

//Create a threshold key of 1/2
  this.thresholdKeys = new KeyList([publicKey1, publicKey2], 2);

});

When(/^A topic is created with the memo "([^"]*)" with the threshold key as the submit key$/, async function (memo: string) {
  const topic = await (await new TopicCreateTransaction().setTopicMemo(config.memo).setSubmitKey(this.thresholdKeys.publicKey).execute(client)).getReceipt(client)
  this.topic = topic
  assert.ok(topic.topicId, "Topic ID should not be null");
  const topicInfo = await new TopicInfoQuery().setTopicId(topic.topicId).execute(client)
  assert.ok(topicInfo.topicMemo == memo, "Topic memo is not the same as the memo configured");
});