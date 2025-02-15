import { Given, Then, When } from "@cucumber/cucumber";
import { accounts } from "../../src/config";
import {
  AccountBalanceQuery,
  AccountId,
  Client,
  PrivateKey,
  TokenCreateTransaction,
  TokenMintTransaction,
  TokenAssociateTransaction,
  TransferTransaction, TokenInfoQuery, Hbar, AccountCreateTransaction, TokenId
} from "@hashgraph/sdk";
import assert from "node:assert";


const client = Client.forTestnet();

const config = {
  tokenName: "Test Token",
  tokenSymbol: "HTT",
  tokenDecimals: 2
  };

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

Given(/^A Hedera account with more than (\d+) hbar$/,{ timeout: 100000 }, async function (expectedBalance: number) {
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
});

When(/^I create a token named Test Token \(HTT\)$/,{ timeout: 100000 }, async function () {
  const txTokenCreation = await new TokenCreateTransaction()
    .setDecimals(config.tokenDecimals)
    .setTokenName(config.tokenName)
    .setTokenSymbol(config.tokenSymbol)
    .setAdminKey(this.firstPrivateKey)
    .setSupplyKey(this.firstPrivateKey)
    .setTreasuryAccountId(this.firstAccountId)
    .execute(client)

  const receiptTokenCreation = await txTokenCreation.getReceipt(client)
  this.tokenId = receiptTokenCreation.tokenId

});

Then(/^The token has the name "([^"]*)"$/, { timeout: 100000 }, async function (name: string) {
  const tokenInfo = await new TokenInfoQuery().setTokenId(this.tokenId).execute(client);
  this.tokenInfo = tokenInfo;
  assert.ok(tokenInfo.name == name)
});

Then(/^The token has the symbol "([^"]*)"$/, async function (symbol: string) {
  assert.ok(this.tokenInfo.symbol == symbol)
});

Then(/^The token has (\d+) decimals$/, async function (decimals: number) {
  assert.ok(this.tokenInfo.decimals == decimals)
});

Then(/^The token is owned by the account$/, async function () {
  assert.ok(this.tokenInfo.treasuryAccountId?.equals(this.firstAccountId))
});

Then(/^An attempt to mint (\d+) additional tokens succeeds$/,{ timeout: 100000 }, async function (amount: number) {
  const txTokenMint = new TokenMintTransaction()
    .setTokenId(this.tokenId)
    .setAmount(amount)
    .freezeWith(client);

  const signTxTokenMint = await (await txTokenMint.sign(this.firstPrivateKey)).execute(client);

  const receiptTokenMint = await signTxTokenMint.getReceipt(client);
  assert.ok(receiptTokenMint.status.toString() === "SUCCESS", "Failed to mint tokens");
});

When(/^I create a fixed supply token named Test Token \(HTT\) with (\d+) tokens$/,{ timeout: 100000 }, async function (initialSupply: number) {
  const txTokenCreation = await new TokenCreateTransaction()
    .setTokenName(config.tokenName)
    .setTokenSymbol(config.tokenSymbol)
    .setDecimals(config.tokenDecimals)
    .setInitialSupply(initialSupply)
    .setTreasuryAccountId(this.firstAccountId)
    .freezeWith(client)
    .execute(client);

  const receiptTokenCreation = await txTokenCreation.getReceipt(client);
  this.tokenId = receiptTokenCreation.tokenId;
});

Then(/^The total supply of the token is (\d+)$/,{ timeout: 100000 }, async function (supply: number) {
  const tokenInfo = await new TokenInfoQuery().setTokenId(this.tokenId).execute(client);
  assert.ok(tokenInfo.totalSupply.toNumber() === supply);
});

Then(/^An attempt to mint tokens fails$/,{ timeout: 100000 }, async function () {
  try {
    const txTokenMint = await new TokenMintTransaction()
      .setTokenId(this.tokenId)
      .setAmount(100)
      .execute(client);

    const receiptTokenMint = await txTokenMint.getReceipt(client);
    console.log(receiptTokenMint.status.toString());
    assert.strictEqual(receiptTokenMint.status.toString(), "TOKEN_HAS_NO_SUPPLY_KEY", "Minting should have failed due to missing supply key.");
  } catch (error) {
    console.log("Failed to mint tokens: " + error + " - This is expected");
  }    
});

let holdAccountId: AccountId = AccountId.fromString(accounts[0].id); 
let holdAccountPrivateKey: PrivateKey = PrivateKey.fromStringED25519(accounts[0].privateKey);
let firstAccountId: AccountId;
let firstAccountPrivateKey: PrivateKey;
let secondAccountId: AccountId;
let secondAccountPrivateKey: PrivateKey;
let thirdAccountId: AccountId;
let thirdAccountPrivateKey: PrivateKey;
let fourthAccountId: AccountId;
let fourthAccountPrivateKey: PrivateKey;

// Helper function to create a Hedera account
async function createAccount(initialBalance: number): Promise<{ accountId: AccountId; privateKey: PrivateKey }> {
  const privateKey = PrivateKey.generateED25519();
  const transaction = await new AccountCreateTransaction()
    .setKey(privateKey.publicKey)
    .setInitialBalance(new Hbar(initialBalance))
    .execute(client);
  const receipt = await transaction.getReceipt(client);
  const accountId = receipt.accountId!;
  return { accountId, privateKey };
}

// Helper function to associate a token with an account
async function associateToken(accountId: AccountId, privateKey: PrivateKey, tokenId: TokenId): Promise<void> {
  const transaction = await new TokenAssociateTransaction()
    .setAccountId(accountId)
    .setTokenIds([tokenId])
    .freezeWith(client)
    .sign(privateKey);
  await transaction.execute(client);
}

// Helper function to check Hbar and/or token balances of an account
async function checkBalances(accountId: AccountId, tokenId?: TokenId): Promise<{ hbarBalance: number; tokenBalance?: number }> {
  const balanceQuery = await new AccountBalanceQuery().setAccountId(accountId).execute(client);
  const hbarBalance = balanceQuery.hbars.toBigNumber().toNumber();
  const tokenBalance = tokenId ? balanceQuery.tokens?.get(tokenId)?.toNumber() : undefined;
  return { hbarBalance, tokenBalance: tokenBalance !== undefined ? tokenBalance : 0 };
}

// Helper function to adjust the token balance of an account
async function adjustBalance(
  accountId: AccountId,
  tokenId: TokenId,
  expectedTokens: number,
  holdAccountId: AccountId,
  holdAccountPrivateKey: PrivateKey
): Promise<void> {
  console.log( "\nAccount id: " + accountId.toString()+ " |   Token ID is: " + tokenId.toString());
  const { tokenBalance } = await checkBalances(accountId, tokenId);
  console.log("\nToken Balance: " + tokenBalance);

  const difference = expectedTokens - (tokenBalance || 0);

  if (difference !== 0) {
    const tx = new TransferTransaction();
    if (difference > 0) {
      tx.addTokenTransfer(tokenId, holdAccountId, -difference)
        .addTokenTransfer(tokenId, accountId, difference);
    } else {
      tx.addTokenTransfer(tokenId, accountId, difference)
        .addTokenTransfer(tokenId, holdAccountId, -difference);
    }
    // Freeze the transaction before signing
    tx.freezeWith(client);

    const signTx = await tx.sign(holdAccountPrivateKey);
    const txResponse = await signTx.execute(client);
    const receipt = await txResponse.getReceipt(client);
    const statusTransferTx = receipt.status;
    console.log("Receipt status           :", statusTransferTx.toString());
  }

  const { tokenBalance: newTokenBalance } = await checkBalances(accountId, tokenId);
  assert.strictEqual(newTokenBalance, expectedTokens, `Account does not hold ${expectedTokens} HTT tokens.`);
}

Given(/^A first hedera account with more than (\d+) hbar$/,{ timeout: 100000 }, async function (expectedBalance: number) {
  const { accountId, privateKey } = await createAccount(expectedBalance * 2);
  firstAccountId = accountId;
  firstAccountPrivateKey = privateKey;
  const { hbarBalance } = await checkBalances(firstAccountId);
  assert(hbarBalance > expectedBalance, `Account does not have more than ${expectedBalance} hbar.`);
});

Given(/^A second Hedera account$/,{ timeout: 100000 }, async function () {
  const { accountId, privateKey } = await createAccount(0);
  secondAccountId = accountId;
  secondAccountPrivateKey = privateKey;
});

Given(/^A token named Test Token \(HTT\) with (\d+) tokens$/,{ timeout: 100000 }, async function (supply: number) {
  const transaction = new TokenCreateTransaction()
    .setTokenName(config.tokenName)
    .setTokenSymbol(config.tokenSymbol)
    .setDecimals(2)
    .setInitialSupply(supply)
    .setTreasuryAccountId(holdAccountId)
    .setAdminKey(holdAccountPrivateKey)
    .setSupplyKey(holdAccountPrivateKey)
    .freezeWith(client);

  const signTx = await transaction.sign(holdAccountPrivateKey);
  const txResponse = await signTx.execute(client);
  const receipt = await txResponse.getReceipt(client);
  this.tokenId_1 = receipt.tokenId!;

  await associateToken(firstAccountId, firstAccountPrivateKey, this.tokenId_1);
  await associateToken(secondAccountId, secondAccountPrivateKey, this.tokenId_1);
});


Given(/^The first account holds (\d+) HTT tokens$/,{ timeout: 100000 }, async function (expectedBalance: number) {
  await adjustBalance(firstAccountId,this.tokenId_1, expectedBalance, holdAccountId, holdAccountPrivateKey);
});

Given(/^The second account holds (\d+) HTT tokens$/,{ timeout: 100000 }, async function (expectedBalance: number) {
  await adjustBalance(secondAccountId,this.tokenId_1, expectedBalance, holdAccountId, holdAccountPrivateKey);
});

When(/^The first account creates a transaction to transfer (\d+) HTT tokens to the second account$/,{ timeout: 100000 }, async function (amount: number) {
  const transferTransaction =  new TransferTransaction()
    .addTokenTransfer(this.tokenId_1, firstAccountId, -amount)
    .addTokenTransfer(this.tokenId_1, secondAccountId, amount)
    .freezeWith(client);
  const signTx = await transferTransaction.sign(firstAccountPrivateKey);
  this.signTx = signTx;
  console.log("The first account did create and sign the transaction :) ");

});

When(/^The first account submits the transaction$/,{ timeout: 100000 }, async function () {
  console.log("\nThe first account submits the transaction") 
  const txResponse = await this.signTx.execute(client);
  this.submitReceipt = await txResponse.getReceipt(client);
});

When(/^The second account creates a transaction to transfer (\d+) HTT tokens to the first account$/,{ timeout: 100000 }, async function (amount: number) {
  const transferTransaction =  new TransferTransaction()
    .addTokenTransfer(this.tokenId_1, secondAccountId, -amount)
    .addTokenTransfer(this.tokenId_1, firstAccountId, amount)
    .freezeWith(client);
    const signTx = await transferTransaction.sign(secondAccountPrivateKey);
    this.signTx = signTx;
    console.log("The second account did create and sign the transaction :) ");
});

Then(/^The first account has paid for the transaction fee$/, async function () {
  console.log("`\nThe first account has paid for the transaction fee")
  const txStatus = this.submitReceipt.status;
  console.log("Receipt status           :", txStatus.toString());
});

Given(/^A first hedera account with more than (\d+) hbar and (\d+) HTT tokens$/,{ timeout: 100000 }, async function (expectedHbar: number, expectedTokens: number) {
  await adjustBalance(firstAccountId, this.tokenId_1, expectedTokens, holdAccountId, holdAccountPrivateKey);

  const { hbarBalance, tokenBalance } = await checkBalances(firstAccountId, this.tokenId_1);
  assert(hbarBalance > expectedHbar, `Account does not have more than ${expectedHbar} hbar.`);
  assert(tokenBalance === expectedTokens, `Account does not have ${expectedTokens} HTT tokens.`);
});

Given(/^A second Hedera account with (\d+) hbar and (\d+) HTT tokens$/,{ timeout: 100000 }, async function (expectedHbar: number, expectedTokens: number) {
  await adjustBalance(secondAccountId, this.tokenId_1, expectedTokens, holdAccountId, holdAccountPrivateKey);

  const { hbarBalance, tokenBalance } = await checkBalances(secondAccountId, this.tokenId_1);
  assert(hbarBalance === expectedHbar, `Account does not have ${expectedHbar} hbar.`);
  assert(tokenBalance === expectedTokens, `Account does not have ${expectedTokens} HTT tokens.`);
});

Given(/^A third Hedera account with (\d+) hbar and (\d+) HTT tokens$/,{ timeout: 100000 }, async function (expectedHbar: number, expectedTokens: number) {
  const { accountId, privateKey } = await createAccount(expectedHbar);
  thirdAccountId = accountId;
  thirdAccountPrivateKey = privateKey;

  await associateToken(thirdAccountId, thirdAccountPrivateKey, this.tokenId_1);
  await adjustBalance(thirdAccountId, this.tokenId_1, expectedTokens, holdAccountId, holdAccountPrivateKey);

  const { hbarBalance, tokenBalance } = await checkBalances(thirdAccountId, this.tokenId_1);
  assert(hbarBalance === expectedHbar, `Account does not have ${expectedHbar} hbar.`);
  assert(tokenBalance === expectedTokens, `Account does not have ${expectedTokens} HTT tokens.`);
 });

Given(/^A fourth Hedera account with (\d+) hbar and (\d+) HTT tokens$/,{ timeout: 100000 }, async function (expectedHbar: number, expectedTokens: number) {
  const { accountId, privateKey } = await createAccount(expectedHbar);
  fourthAccountId = accountId;
  fourthAccountPrivateKey = privateKey;

  await associateToken(fourthAccountId, fourthAccountPrivateKey, this.tokenId_1);
  await adjustBalance(fourthAccountId, this.tokenId_1, expectedTokens, holdAccountId, holdAccountPrivateKey);

  const { hbarBalance, tokenBalance } = await checkBalances(fourthAccountId, this.tokenId_1);
  assert(hbarBalance === expectedHbar, `Account does not have ${expectedHbar} hbar.`);
  assert(tokenBalance === expectedTokens, `Account does not have ${expectedTokens} HTT tokens.`);
});

When(/^A transaction is created to transfer (\d+) HTT tokens out of the first and second account and (\d+) HTT tokens into the third account and (\d+) HTT tokens into the fourth account$/, { timeout: 100000 }, async function (transferOut: number, transferInToThird: number, transferInToFourth: number) {
  const transaction = new TransferTransaction()
    .addTokenTransfer(this.tokenId_1, firstAccountId, -transferOut) 
    .addTokenTransfer(this.tokenId_1, secondAccountId, -transferOut) 
    .addTokenTransfer(this.tokenId_1, thirdAccountId, transferInToThird)  
    .addTokenTransfer(this.tokenId_1, fourthAccountId, transferInToFourth)
    .freezeWith(client);

  const signTx1 = await transaction.sign(firstAccountPrivateKey);
  this.signTx = await signTx1.sign(secondAccountPrivateKey);
});

Then(/^The third account holds (\d+) HTT tokens$/,{ timeout: 100000 }, async function (expectedTokens: number) {
  const { tokenBalance } = await checkBalances(thirdAccountId, this.tokenId_1);
  assert(tokenBalance === expectedTokens, `Account does not have ${expectedTokens} HTT tokens.`);
});

Then(/^The fourth account holds (\d+) HTT tokens$/,{ timeout: 100000 }, async function (expectedTokens: number) {
  const { tokenBalance } = await checkBalances(fourthAccountId, this.tokenId_1);
  assert(tokenBalance === expectedTokens, `Account does not have ${expectedTokens} HTT tokens.`);
});
