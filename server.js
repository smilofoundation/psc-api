const Web3 = require('web3');
const fs = require('fs');

let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:22000"));

let abiDefinition = fs.readFileSync('./simplestorage_sol_SimpleStorage.abi').toString();
abiDefinition = JSON.parse(abiDefinition);

const lastBlockStr = process.env.LASTBLOCK || "0";
let lastBlock = parseInt(lastBlockStr);


function parseBlock(i, b, cb) {
    if (i < b.transactions.length) {
        // for (let i = 0; i < b.transactions.length; i++) {
        const txTarget = b.transactions[i];
        i = i + 1;

        web3.eth.getTransaction(txTarget).then(function (tx) {
            // check if private
            if (tx.v == 37 || tx.v == 38) {
                console.log("Got a private transaction", tx);
            } else {
                return parseBlock(i, b, cb); // skip public transactions
            }

            //load smart contract
            console.log("Found a private contract, will load receipt");
            web3.eth.getTransactionReceipt(tx.hash, function (err, receipt) {
                if (err) {
                    console.log("Coult not getTransactionReceipt, ", err);
                    return parseBlock(i, b, cb);
                }
                console.log("Found a private contract, will load it using receipt");
                const contract = new web3.eth.Contract(abiDefinition, receipt.contractAddress);

                contract.methods.get().call().then(function (val) {
                    console.log("****** Got a val from private contract, ", val);
                    return parseBlock(i, b, cb);
                }).catch(function (err) {
                    console.log("Could not load this contract, probably not the right one");
                    return parseBlock(i, b, cb);
                });
            }).catch(function (err) {
                console.log("Could not load getTransactionReceipt");
                return parseBlock(i, b, cb);
            });

        }).catch(function (err) {
            console.log("Could not load getTransaction");
            return parseBlock(i, b, cb);
        });
    } else {
        console.log("Finished processing block ", b.number);
        return cb();
    }

    // }
}

function scanBlock(blockNumber, cb) {
    web3.eth.getBlock(blockNumber).then(function (b) {

        parseBlock(0, b, function () {
            return cb()
        })
    }).catch(function (err) {
        console.log("Could not load getBlock");
        return cb();
    });

}


function doJob() {

    web3.eth.getBlockNumber().then(function (blockNumber) {
        if (!blockNumber) {
            console.log("Could not get blockNumber, are you connected ?", web3.eth);
        } else {
            if (lastBlock <= blockNumber) {
                processTransactions(blockNumber);
            }

            console.log("restarting, ", "blockNumber", blockNumber, "lastBlock", lastBlock);

            setTimeout(function () {
                doJob();
            }, 5000);

        }
    }).catch(function (err) {
        console.log("Could not load doJob, getBlockNumber");
        return
    });
}

function processTransactions(blockNumber) {
    if (lastBlock <= blockNumber) {
        console.log("Scanning blockNumber, ", lastBlock);
        scanBlock(lastBlock, function () {

            lastBlock = lastBlock + 1;

            processTransactions(blockNumber);
        });
    }
}


//first run
doJob();

