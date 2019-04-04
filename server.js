const Web3 = require('web3');
const fs = require('fs');

let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:22000"));

const abiDefinition = fs.readFileSync('./simplestorage_sol_SimpleStorage.abi').toString();

const lastBlockStr = process.env.LASTBLOCK || "0";
let lastBlock = parseInt(lastBlockStr);

function scanBlock(blockNumber) {
    web3.eth.getBlock(blockNumber).then(function (b) {
        for (let i = 0; i < b.transactions.length; i++) {
            web3.eth.getTransaction(b.transactions[i]).then(function (tx) {
                // let code;
                if (tx.v == 37 || tx.v == 38) { // private
                    console.log("Got a private transaction", tx);
                } else {
                    return; // skip public transactions
                }

                //load smart contract
                web3.eth.getTransactionReceipt(tx.hash, function (err, receipt) {
                    if (err) {
                        console.log("Coult not getTransactionReceipt, ", err);
                        return
                    }
                    console.log(receipt);
                    const contract = new web3.eth.Contract(JSON.parse(abiDefinition), receipt.contractAddress);


                    contract.methods.get().call().then(function (val) {
                        console.log("****** Got a val", val);
                    }).catch(function (err) {
                        console.log("Could not load this contract, probably not the right one", err);
                    });
                })

            })


        }
    });

}


function doJob() {

    web3.eth.getBlockNumber().then(function (blockNumber) {
        if (!blockNumber) {
            console.log("Could not get blockNumber, are you connected ?", web3.eth);
        } else {
            if (blockNumber !== lastBlock) {
                processTransactions(blockNumber);
            }

            console.log("restarting");

            setTimeout(function () {
                doJob();
            }, 5000);

        }
    });
}

function processTransactions(blockNumber) {
    if (blockNumber !== lastBlock) {
        console.log("Scanning blockNumber, ", lastBlock);
        scanBlock(lastBlock);
        lastBlock = lastBlock + 1;

        processTransactions(blockNumber);
    }
}


//first run
doJob();

