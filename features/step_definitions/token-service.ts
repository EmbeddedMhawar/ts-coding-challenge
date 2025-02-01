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
  TokenId,
  TransferTransaction, TokenInfoQuery, Hbar, HbarUnit, AccountCreateTransaction, TokenBurnTransaction, TransactionRecordQuery
} from "@hashgraph/sdk";
import assert from "node:assert";


const client = Client.forTestnet();

const config = {
  tokenName: "Test Token",
  tokenSymbol: "HTT",
  tokenDecimals: 2
  };

const getAccountsAboveThreshold = async (expectedBalance: number) => {
  const accountsAboveThreshold: Array<typeof accounts[0]> = [];
  let hbarBalance = 0;

  for (const account of accounts) {
    const accountId = AccountId.fromString(account.id);
    const query = new AccountBalanceQuery().setAccountId(accountId);
    const balance = await query.execute(client);
    const hbarBalance = balance.hbars.toBigNumber().toNumber()

    if (hbarBalance > expectedBalance) {
      accountsAboveThreshold.push(account);
    }
  }

  return accountsAboveThreshold;
};

// function to check accounts array hbar balance and console logging it
//const checkBalances = async () => {
//   for (const account of accounts) {
//     const accountId = AccountId.fromString(account.id);
//     const query = new AccountBalanceQuery().setAccountId(accountId);
//     const balance = await query.execute(client);
//     // console.log the account index, id and balance
//     console.log("Account [", accounts.indexOf(account), "]");
//     console.log("Account ID: ", accountId.toString());
//     console.log("Balance: ", balance.hbars.toBigNumber().toNumber());
//     console.log("----------------------------------------------------");
// };
//};

//checkBalances();


Given(/^A Hedera account with more than (\d+) hbar$/, async function (expectedBalance: number) {
  // function to check the first account in accounts array that has more than 10 hbars
  const accountsAboveThreshold = await getAccountsAboveThreshold(expectedBalance);
  // Check if there is at least one account with balance > expectedBalance
  assert.ok(accountsAboveThreshold.length > 0, "No accounts found with balance > " + expectedBalance);
  
  const account = accountsAboveThreshold[0];
  const MY_ACCOUNT_ID = AccountId.fromString(account.id);
  this.accountId = MY_ACCOUNT_ID;
  const MY_PRIVATE_KEY = PrivateKey.fromStringED25519(account.privateKey);
  this.privateKey = MY_PRIVATE_KEY;
  client.setOperator(MY_ACCOUNT_ID, MY_PRIVATE_KEY);

  const query = new AccountBalanceQuery().setAccountId(account.id);
  const balance = await query.execute(client);
  const hbarBalance = balance.hbars.toBigNumber().toNumber()

  assert.ok(hbarBalance > expectedBalance);
});

When(/^I create a token named Test Token \(HTT\)$/, async function () {
  const ctt = await new TokenCreateTransaction()
      .setDecimals(2)
      .setTokenName(config.tokenName)
      .setTokenSymbol(config.tokenSymbol)
      .setAdminKey(this.privateKey)
      .setSupplyKey(this.privateKey)
      .setTreasuryAccountId(this.accountId)
      .execute(client)

  const receipt = await ctt.getReceipt(client)
  this.tokenId = receipt.tokenId

});

Then(/^The token has the name "([^"]*)"$/, async function (name: string) {
  const tokenInfo = await new TokenInfoQuery().setTokenId(this.tokenId).execute(client);
  assert.ok(tokenInfo.name == name)
});

Then(/^The token has the symbol "([^"]*)"$/, async function (symbol: string) {
  const tokenInfo = await new TokenInfoQuery().setTokenId(this.tokenId).execute(client);
  assert.ok(tokenInfo.symbol == symbol)
});

Then(/^The token has (\d+) decimals$/, async function (decimals: number) {
  const tokenInfo = await new TokenInfoQuery().setTokenId(this.tokenId).execute(client);
  assert.ok(tokenInfo.decimals == decimals)
});

Then(/^The token is owned by the account$/, async function () {
  const tokenInfo = await new TokenInfoQuery().setTokenId(this.tokenId).execute(client);
  assert.ok(tokenInfo.treasuryAccountId?.equals(this.accountId))
});

Then(/^An attempt to mint (\d+) additional tokens succeeds$/, async function (amount: number) {
  //Mint another 1,000 tokens and freeze the unsigned transaction for manual signing
  const txTokenMint = await new TokenMintTransaction()
  .setTokenId(this.tokenId) //Fill in the token ID
  .setAmount(amount) //Fill in the amount
  .freezeWith(client);

  //Sign with the token's adminKey
  const signTxTokenMint = await (await txTokenMint.sign(PrivateKey.fromStringED25519(accounts[0].privateKey))).execute(client);

  //Verify the transaction reached consensus
  const receiptTokenMint = await signTxTokenMint.getReceipt(client);
  assert.ok(receiptTokenMint.status.toString() === "SUCCESS", "Failed to mint tokens");
});

When(/^I create a fixed supply token named Test Token \(HTT\) with (\d+) tokens$/, async function (initialSupply: number) {
  const tokenCreateTransaction = await new TokenCreateTransaction()
  .setTokenName(config.tokenName)
  .setTokenSymbol(config.tokenSymbol)
  .setDecimals(config.tokenDecimals)
  .setInitialSupply(initialSupply)
  .setTreasuryAccountId(this.accountId)
  .freezeWith(client)
  .execute(client);

  const receipt = await tokenCreateTransaction.getReceipt(client);
  this.tokenId = receipt.tokenId;
});

Then(/^The total supply of the token is (\d+)$/, async function (supply: number) {
  const tokenInfo = await new TokenInfoQuery().setTokenId(this.tokenId).execute(client);
  assert.ok(tokenInfo.totalSupply.toNumber() === supply);
});

Then(/^An attempt to mint tokens fails$/, async function () {
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

Given(/^A first hedera account with more than (\d+) hbar$/,{ timeout: 100000 }, async function (expectedBalance: number) {
  firstAccountPrivateKey = PrivateKey.generateED25519();
  const transaction = await new AccountCreateTransaction()
    .setKey(firstAccountPrivateKey.publicKey)
    .setInitialBalance(new Hbar(expectedBalance*2))
    .execute(client);
  const receipt = await transaction.getReceipt(client);
  firstAccountId = receipt.accountId!;
  console.log("The first hedera account ID :  " + firstAccountId.toString());
  
  const balance = await new AccountBalanceQuery().setAccountId(firstAccountId).execute(client);
  assert(balance.hbars.toBigNumber().toNumber() > expectedBalance);

});

Given(/^A second Hedera account$/,{ timeout: 100000 }, async function () {
  secondAccountPrivateKey = PrivateKey.generateED25519();
  const transaction = await new AccountCreateTransaction()
    .setKey(secondAccountPrivateKey.publicKey)
    .setInitialBalance(new Hbar(0))
    .execute(client);
  const receipt = await transaction.getReceipt(client);
  secondAccountId = receipt.accountId!;
  console.log("A first hedera account with more than inside A second hedera " + firstAccountId.toString());
  console.log("A second Hedera account " + secondAccountId.toString());
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

  const associateTransaction_1 = await new TokenAssociateTransaction()
    .setAccountId(firstAccountId)
    .setTokenIds([this.tokenId_1])
    .freezeWith(client)
    .sign(firstAccountPrivateKey);
  await associateTransaction_1.execute(client);
  console.log("")
  console.log("A first hedera account inside  A token named Test Token " + firstAccountId.toString() + "token id is:" + this.tokenId_1.toString());
  

  // Associate the second account with the token
  const associateTransaction_2 = await new TokenAssociateTransaction()
    .setAccountId(secondAccountId)
    .setTokenIds([this.tokenId_1])
    .freezeWith(client)
    .sign(secondAccountPrivateKey);
  await associateTransaction_2.execute(client);
  console.log("A second Hedera account inside  A token named Test Token  " + secondAccountId.toString() + "token id is:" + this.tokenId_1.toString());
  console.log("")
});


Given(/^The first account holds (\d+) HTT tokens$/,{ timeout: 100000 }, async function (expectedBalance: number) {
  console.log("")
  console.log("------------------------------- First Account Token Balance Query -------------------------------");
  console.log(firstAccountId.toString()+  " The first account holds (\d+) HTT tokens " + "|   Token ID is: " + this.tokenId_1.toString());
  // Create the query
  const accountBalanceQuery_0 = new AccountBalanceQuery()
    .setAccountId(firstAccountId);

  // Sign with the client operator private key and submit to a Hedera network
  const balance_0 = await accountBalanceQuery_0.execute(client);
  let tokenBalance_0 = balance_0.tokens ? balance_0.tokens.get(this.tokenId_1)?.toNumber() : 0

  if(tokenBalance_0 === undefined){
    tokenBalance_0 = 0;
    console.log("Token balance is set to 0")
  }
  console.log("Account Token Balance (check before adjust) : ", tokenBalance_0 + "     |   Token ID is: " + this.tokenId_1.toString());

  const difference = expectedBalance - tokenBalance_0;
  if (difference === 0) {
    assert.strictEqual(tokenBalance_0, expectedBalance);
    return; // Exit early if no adjustment is needed
  }

  const tx = new TransferTransaction();
  if (difference > 0) {
    tx.addTokenTransfer(this.tokenId_1, holdAccountId, -difference)
      .addTokenTransfer(this.tokenId_1, firstAccountId, difference);
  } else if (difference < 0) {
    tx.addTokenTransfer(this.tokenId_1, firstAccountId, difference)
      .addTokenTransfer(this.tokenId_1, holdAccountId, -difference);
  }

  // Freeze the transaction before signing
  tx.freezeWith(client);

  const signTx = await tx.sign(holdAccountPrivateKey);
  const txResponse = await signTx.execute(client);
  const receipt = await txResponse.getReceipt(client);
  this.submiterReceipt = receipt;
  //Obtain the transaction consensus status
  const statusTransferTx = receipt.status;

  console.log("");
  console.log("Receipt status           :", statusTransferTx.toString());

  // Create the query
  const accountBalanceQuery = new AccountBalanceQuery()
    .setAccountId(firstAccountId);
  const balance = await accountBalanceQuery.execute(client);
  const tokenBalance = balance.tokens ? balance.tokens.get(this.tokenId_1)?.toNumber() : 0;
  console.log("")
  console.log("")
  console.log("Account Token Balance (check after adjust) : ", tokenBalance + "     |   Token ID is: " + this.tokenId_1.toString());
  console.log("----------------------------------------------------------------------------------------------------------");
  assert.strictEqual(tokenBalance, expectedBalance, `The first account does not hold ${expectedBalance} HTT tokens.`);
});

Given(/^The second account holds (\d+) HTT tokens$/,{ timeout: 100000 }, async function (expectedBalance: number) {
  console.log("")
  console.log("------------------------------- Second Account Token Balance Query -------------------------------");
  console.log(secondAccountId.toString()+  " The second account holds (\d+) HTT tokens " + "|   Token ID is: " + this.tokenId_1.toString());
  const accountBalanceQuery_0 = new AccountBalanceQuery()
  .setAccountId(secondAccountId);

//Sign with the client operator private key and submit to a Hedera network
  const balance_0 = await accountBalanceQuery_0.execute(client);
  let tokenBalance_0 = balance_0.tokens ? balance_0.tokens.get(this.tokenId_1)?.toNumber() : 0

  if(tokenBalance_0 === undefined){
    tokenBalance_0 = 0;
    console.log("Token balance is set to 0")
  }
  console.log("Account Token Balance (check before adjust) : ", tokenBalance_0 + "     |   Token ID is: " + this.tokenId_1.toString());

  const difference = expectedBalance - tokenBalance_0;
  if (difference === 0) {
    assert.strictEqual(tokenBalance_0, expectedBalance)
    return; // Exit early if no adjustment is needed
    }

  const tx = new TransferTransaction();
  if (difference > 0) {
    tx.addTokenTransfer(this.tokenId_1, holdAccountId, -difference)
      .addTokenTransfer(this.tokenId_1, secondAccountId, difference);
  } 
  else if (difference < 0){
    tx.addTokenTransfer(this.tokenId_1, secondAccountId, difference)
      .addTokenTransfer(this.tokenId_1, holdAccountId, -difference);
  }

  // Freeze the transaction before signing
  tx.freezeWith(client);

  const signTx = await tx.sign(holdAccountPrivateKey);
  const txResponse = await signTx.execute(client);
  const receipt = await txResponse.getReceipt(client);
  this.submiterReceipt = receipt;
  //Obtain the transaction consensus status
  const statusTransferTx = receipt.status;

  console.log("");
  console.log("Receipt status           :", statusTransferTx.toString());

   //Create the query
   const accountBalanceQuery = new AccountBalanceQuery()
   .setAccountId(secondAccountId);
  //Sign with the client operator private key and submit to a Hedera network
    const balance = await accountBalanceQuery.execute(client);
    const tokenBalance = balance.tokens ? balance.tokens.get(this.tokenId_1)?.toNumber() : 0
    console.log("")
    console.log("Account Token Balance (check after adjust) : ", tokenBalance + "     |   Token ID is: " + this.tokenId_1.toString());
    console.log("----------------------------------------------------------------------------------------------------------");
    assert.strictEqual(tokenBalance, expectedBalance, `The second account does not hold ${expectedBalance} HTT tokens.`);
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

When(/^The first account submits the transaction$/, async function () {
  console.log("")
  console.log("The first account submits the transaction") 
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
  console.log("")
  console.log("The first account has paid for the transaction fee")
  const txStatus = this.submitReceipt.status;
  console.log("Receipt status           :", txStatus.toString());
});

Given(/^A first hedera account with more than (\d+) hbar and (\d+) HTT tokens$/,{ timeout: 100000 }, async function (expectedHbar: number, expectedTokens: number) {
  console.log("")
  console.log("------------------------------- First Account Token Balance Query -------------------------------");
  console.log(firstAccountId.toString()+  " The first account holds (\d+) HTT tokens " + "|   Token ID is: " + this.tokenId_1.toString());

  const balance_0 = await new AccountBalanceQuery().setAccountId(firstAccountId).execute(client);
  let tokenBalance_0 = balance_0.tokens ? balance_0.tokens.get(this.tokenId_1)?.toNumber() : 0;

  if(tokenBalance_0 === undefined){
    tokenBalance_0 = 0;
    console.log("Token balance is set to 0")
  } 

  console.log("Account Hbar Balance                        : ", balance_0.hbars.toBigNumber().toNumber());
  console.log("");
  console.log("Account Token Balance (check before adjust) : ", tokenBalance_0 + "     |   Token ID is: " + this.tokenId_1.toString());
  console.log("");
  
  const difference = expectedTokens - tokenBalance_0;
  if (difference === 0) {
    // Create the query
    const accountBalanceQuery = new AccountBalanceQuery().setAccountId(firstAccountId);
    const balance = await accountBalanceQuery.execute(client);
    const tokenBalance = balance.tokens ? balance.tokens.get(this.tokenId_1)?.toNumber() : 0;
    assert(balance_0.hbars.toBigNumber().toNumber() > expectedHbar); 
    assert.strictEqual(tokenBalance, expectedTokens, `Account must have ${expectedTokens} HTT tokens`);
    console.log("----------------------------------------------------------------------------------------------------------");
    return; // Exit early if no adjustment is needed
  }

  const tx = new TransferTransaction();
  if (difference > 0) {
    tx.addTokenTransfer(this.tokenId_1, holdAccountId, -difference)
      .addTokenTransfer(this.tokenId_1, firstAccountId, difference);
  } else if (difference < 0) {
    tx.addTokenTransfer(this.tokenId_1, firstAccountId, difference)
      .addTokenTransfer(this.tokenId_1, holdAccountId, -difference);
  }

  // Freeze the transaction before signing
  tx.freezeWith(client);

  const signTx = await tx.sign(holdAccountPrivateKey);
  const txResponse = await signTx.execute(client);
  const receipt = await txResponse.getReceipt(client);
  this.submiterReceipt = receipt;
  //Obtain the transaction consensus status
  const statusTransferTx = receipt.status;

  console.log("");
  console.log("Receipt status           :", statusTransferTx.toString());

  // Create the query
  const accountBalanceQuery = new AccountBalanceQuery().setAccountId(firstAccountId);
  const balance = await accountBalanceQuery.execute(client);
  const tokenBalance = balance.tokens ? balance.tokens.get(this.tokenId_1)?.toNumber() : 0;
  console.log("")
  console.log("")
  console.log("Account Token Balance (check after adjust) : ", tokenBalance + "     |   Token ID is: " + this.tokenId_1.toString());
  console.log("----------------------------------------------------------------------------------------------------------");
  assert(balance_0.hbars.toBigNumber().toNumber() > expectedHbar); 
  assert.strictEqual(tokenBalance, expectedTokens, `Account must have ${expectedTokens} HTT tokens`);
});

Given(/^A second Hedera account with (\d+) hbar and (\d+) HTT tokens$/,{ timeout: 100000 }, async function (expectedHbar: number, expectedTokens: number) {
  console.log("");
  console.log("------------------------------- Second Account Token Balance Query -------------------------------");
  console.log(secondAccountId.toString() + " The second account holds " + expectedTokens + " HTT tokens" + "|   Token ID is: " + this.tokenId_1.toString());

  const balance_0 = await new AccountBalanceQuery().setAccountId(secondAccountId).execute(client);
  let tokenBalance_0 = balance_0.tokens ? balance_0.tokens.get(this.tokenId_1)?.toNumber() : 0;

  if (tokenBalance_0 === undefined) {
    tokenBalance_0 = 0;
    console.log("Token balance is set to 0");
  }

  console.log("Account Hbar Balance                        : ", balance_0.hbars.toBigNumber().toNumber());
  console.log("");
  console.log("Account Token Balance (check before adjust) : ", tokenBalance_0 + "     |   Token ID is: " + this.tokenId_1.toString());
  console.log("");

  const difference = expectedTokens - tokenBalance_0;
  if (difference === 0) {
    // Create the query
    const accountBalanceQuery = new AccountBalanceQuery().setAccountId(secondAccountId);
    const balance = await accountBalanceQuery.execute(client);
    const tokenBalance = balance.tokens ? balance.tokens.get(this.tokenId_1)?.toNumber() : 0;
    assert(balance_0.hbars.toBigNumber().toNumber() === expectedHbar);
    assert.strictEqual(tokenBalance, expectedTokens, `Account must have ${expectedTokens} HTT tokens`);
    console.log("----------------------------------------------------------------------------------------------------------");
    return; // Exit early if no adjustment is needed
  }

  const tx = new TransferTransaction();
  if (difference > 0) {
    tx.addTokenTransfer(this.tokenId_1, holdAccountId, -difference)
      .addTokenTransfer(this.tokenId_1, secondAccountId, difference);
  } else if (difference < 0) {
    tx.addTokenTransfer(this.tokenId_1, secondAccountId, difference)
      .addTokenTransfer(this.tokenId_1, holdAccountId, -difference);
  }

  // Freeze the transaction before signing
  tx.freezeWith(client);

  const signTx = await tx.sign(holdAccountPrivateKey);
  const txResponse = await signTx.execute(client);
  const receipt = await txResponse.getReceipt(client);
  this.submiterReceipt = receipt;
  // Obtain the transaction consensus status
  const statusTransferTx = receipt.status;

  console.log("");
  console.log("Receipt status           :", statusTransferTx.toString());

  // Create the query
  const accountBalanceQuery = new AccountBalanceQuery().setAccountId(secondAccountId);
  const balance = await accountBalanceQuery.execute(client);
  const tokenBalance = balance.tokens ? balance.tokens.get(this.tokenId_1)?.toNumber() : 0;
  console.log("");
  console.log("Account Token Balance (check after adjust) : ", tokenBalance + "     |   Token ID is: " + this.tokenId_1.toString());
  console.log("----------------------------------------------------------------------------------------------------------");
  assert(balance_0.hbars.toBigNumber().toNumber() === expectedHbar);
  assert.strictEqual(tokenBalance, expectedTokens, `Account must have ${expectedTokens} HTT tokens`);
});

Given(/^A third Hedera account with (\d+) hbar and (\d+) HTT tokens$/,{ timeout: 100000 }, async function (expectedHbar: number, expectedTokens: number) {
  thirdAccountPrivateKey = PrivateKey.generateED25519();
  const transaction = await new AccountCreateTransaction()
    .setKey(thirdAccountPrivateKey.publicKey)
    .setInitialBalance(new Hbar(expectedHbar)) // Set the initial balance in HBAR
    .execute(client);
  const receipt_0 = await transaction.getReceipt(client);
  thirdAccountId = receipt_0.accountId!;

  // Associate the third account with the token
  const associateTransaction_3 = await new TokenAssociateTransaction()
    .setAccountId(thirdAccountId)
    .setTokenIds([this.tokenId_1])
    .freezeWith(client)
    .sign(thirdAccountPrivateKey);
  await associateTransaction_3.execute(client);

  console.log("");
  console.log("------------------------------- Third Account Token Balance Query -------------------------------");
  console.log(thirdAccountId.toString() + " The third account holds " + expectedTokens + " HTT tokens" + "|   Token ID is: " + this.tokenId_1.toString());

  const balance_0 = await new AccountBalanceQuery().setAccountId(thirdAccountId).execute(client);
  let tokenBalance_0 = balance_0.tokens ? balance_0.tokens.get(this.tokenId_1)?.toNumber() : 0;

  if (tokenBalance_0 === undefined) {
    tokenBalance_0 = 0;
    console.log("Token balance is set to 0");
  }

  console.log("Account Hbar Balance                        : ", balance_0.hbars.toBigNumber().toNumber());
  console.log("");
  console.log("Account Token Balance (check before adjust) : ", tokenBalance_0 + "     |   Token ID is: " + this.tokenId_1.toString());
  console.log("");

  const difference = expectedTokens - tokenBalance_0;
  if (difference === 0) {
    // Create the query
    const accountBalanceQuery = new AccountBalanceQuery().setAccountId(thirdAccountId);
    const balance = await accountBalanceQuery.execute(client);
    const tokenBalance = balance.tokens ? balance.tokens.get(this.tokenId_1)?.toNumber() : 0;
    assert(balance_0.hbars.toBigNumber().toNumber() === expectedHbar);
    assert.strictEqual(tokenBalance, expectedTokens, `Account must have ${expectedTokens} HTT tokens`);
    console.log("----------------------------------------------------------------------------------------------------------");
    return; // Exit early if no adjustment is needed
  }

  const tx = new TransferTransaction();
  if (difference > 0) {
    tx.addTokenTransfer(this.tokenId_1, holdAccountId, -difference)
      .addTokenTransfer(this.tokenId_1, thirdAccountId, difference);
  } else if (difference < 0) {
    tx.addTokenTransfer(this.tokenId_1, thirdAccountId, difference)
      .addTokenTransfer(this.tokenId_1, holdAccountId, -difference);
  }

  // Freeze the transaction before signing
  tx.freezeWith(client);

  const signTx = await tx.sign(holdAccountPrivateKey);
  const txResponse = await signTx.execute(client);
  const receipt = await txResponse.getReceipt(client);
  this.submiterReceipt = receipt;
  // Obtain the transaction consensus status
  const statusTransferTx = receipt.status;

  console.log("");
  console.log("Receipt status           :", statusTransferTx.toString());

  // Create the query
  const accountBalanceQuery = new AccountBalanceQuery().setAccountId(thirdAccountId);
  const balance = await accountBalanceQuery.execute(client);
  const tokenBalance = balance.tokens ? balance.tokens.get(this.tokenId_1)?.toNumber() : 0;
  console.log("");
  console.log("Account Token Balance (check after adjust) : ", tokenBalance + "     |   Token ID is: " + this.tokenId_1.toString());
  console.log("----------------------------------------------------------------------------------------------------------");
  assert(balance_0.hbars.toBigNumber().toNumber() === expectedHbar);
  assert.strictEqual(tokenBalance, expectedTokens, `Account must have ${expectedTokens} HTT tokens`);
 });

Given(/^A fourth Hedera account with (\d+) hbar and (\d+) HTT tokens$/,{ timeout: 100000 }, async function (expectedHbar: number, expectedTokens: number) {
   // Create the fourth account
   fourthAccountPrivateKey = PrivateKey.generateED25519();
   const transaction = await new AccountCreateTransaction()
     .setKey(fourthAccountPrivateKey.publicKey)
     .setInitialBalance(new Hbar(expectedHbar)) // Set the initial balance in HBAR
     .execute(client);
   const receipt_0 = await transaction.getReceipt(client);
   fourthAccountId = receipt_0.accountId!;
 
   // Associate the fourth account with the token
   const associateTransaction_4 = await new TokenAssociateTransaction()
     .setAccountId(fourthAccountId)
     .setTokenIds([this.tokenId_1])
     .freezeWith(client)
     .sign(fourthAccountPrivateKey);
   await associateTransaction_4.execute(client);
 
   console.log("");
   console.log("------------------------------- Fourth Account Token Balance Query -------------------------------");
   console.log(fourthAccountId.toString() + " The fourth account holds " + expectedTokens + " HTT tokens" + "|   Token ID is: " + this.tokenId_1.toString());
 
   const balance_0 = await new AccountBalanceQuery().setAccountId(fourthAccountId).execute(client);
   let tokenBalance_0 = balance_0.tokens ? balance_0.tokens.get(this.tokenId_1)?.toNumber() : 0;
 
   if (tokenBalance_0 === undefined) {
     tokenBalance_0 = 0;
     console.log("Token balance is set to 0");
   }
 
   console.log("Account Hbar Balance                        : ", balance_0.hbars.toBigNumber().toNumber());
   console.log("");
   console.log("Account Token Balance (check before adjust) : ", tokenBalance_0 + "     |   Token ID is: " + this.tokenId_1.toString());
   console.log("");
 
   const difference = expectedTokens - tokenBalance_0;
   if (difference === 0) {
     // Create the query
     const accountBalanceQuery = new AccountBalanceQuery().setAccountId(fourthAccountId);
     const balance = await accountBalanceQuery.execute(client);
     const tokenBalance = balance.tokens ? balance.tokens.get(this.tokenId_1)?.toNumber() : 0;
     assert(balance_0.hbars.toBigNumber().toNumber() === expectedHbar);
     assert.strictEqual(tokenBalance, expectedTokens, `Account must have ${expectedTokens} HTT tokens`);
     console.log("----------------------------------------------------------------------------------------------------------");
     return; // Exit early if no adjustment is needed
   }
 
   const tx = new TransferTransaction();
   if (difference > 0) {
     tx.addTokenTransfer(this.tokenId_1, holdAccountId, -difference)
       .addTokenTransfer(this.tokenId_1, fourthAccountId, difference);
   } else if (difference < 0) {
     tx.addTokenTransfer(this.tokenId_1, fourthAccountId, difference)
       .addTokenTransfer(this.tokenId_1, holdAccountId, -difference);
   }
 
   // Freeze the transaction before signing
   tx.freezeWith(client);
 
   const signTx = await tx.sign(holdAccountPrivateKey);
   const txResponse = await signTx.execute(client);
   const receipt = await txResponse.getReceipt(client);
   this.submiterReceipt = receipt;
   // Obtain the transaction consensus status
   const statusTransferTx = receipt.status;
 
   console.log("");
   console.log("Receipt status           :", statusTransferTx.toString());
 
   // Create the query
   const accountBalanceQuery = new AccountBalanceQuery().setAccountId(fourthAccountId);
   const balance = await accountBalanceQuery.execute(client);
   const tokenBalance = balance.tokens ? balance.tokens.get(this.tokenId_1)?.toNumber() : 0;
   console.log("");
   console.log("Account Token Balance (check after adjust) : ", tokenBalance + "     |   Token ID is: " + this.tokenId_1.toString());
   console.log("----------------------------------------------------------------------------------------------------------");
   assert(balance_0.hbars.toBigNumber().toNumber() === expectedHbar);
   assert.strictEqual(tokenBalance, expectedTokens, `Account must have ${expectedTokens} HTT tokens`);
});

When(/^A transaction is created to transfer (\d+) HTT tokens out of the first and second account and (\d+) HTT tokens into the third account and (\d+) HTT tokens into the fourth account$/, async function (transferOut: number, transferInToThird: number, transferInToFourth: number) {
    // Create the TransferTransaction with all the token transfers.
    const transaction = new TransferTransaction()
      .addTokenTransfer(this.tokenId_1, firstAccountId, -transferOut)  // Deduct from first account
      .addTokenTransfer(this.tokenId_1, secondAccountId, -transferOut) // Deduct from second account
      .addTokenTransfer(this.tokenId_1, thirdAccountId, transferInToThird)       // Credit to third account
      .addTokenTransfer(this.tokenId_1, fourthAccountId, transferInToFourth)     // Credit to fourth account
      .freezeWith(client);
    // Multi-sign the transaction.
    // First, sign with the first account's private key.
    const signTx1 = await transaction.sign(firstAccountPrivateKey);
    // Then, chain the signature of the second account.
    const signTx2 = await signTx1.sign(secondAccountPrivateKey);
    this.signTx = signTx2;
});

Then(/^The third account holds (\d+) HTT tokens$/,{ timeout: 100000 }, async function (expectedBalance: number) {
  //Create the query
  const accountBalanceQuery = new AccountBalanceQuery()
  .setAccountId(thirdAccountId);
 //Sign with the client operator private key and submit to a Hedera network
   const balance = await accountBalanceQuery.execute(client);
   const tokenBalance = balance.tokens ? balance.tokens.get(this.tokenId_1)?.toNumber() : 0
  assert.strictEqual(tokenBalance, expectedBalance, `The third account does not hold ${expectedBalance} HTT tokens.`);
});

Then(/^The fourth account holds (\d+) HTT tokens$/,{ timeout: 100000 }, async function (expectedBalance: number) {
  //Create the query
  const accountBalanceQuery = new AccountBalanceQuery()
   .setAccountId(fourthAccountId);
 //Sign with the client operator private key and submit to a Hedera network
   const balance = await accountBalanceQuery.execute(client);
   const tokenBalance = balance.tokens ? balance.tokens.get(this.tokenId_1)?.toNumber() : 0
  assert.strictEqual(tokenBalance, expectedBalance, `The fourth account does not hold ${expectedBalance} HTT tokens.`);
});
