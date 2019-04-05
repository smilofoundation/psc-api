const Web3 = require('web3');
const fs = require('fs');
const Joi = require('joi');
const bunyan = require('bunyan');
const log = bunyan.createLogger({name: "srv"});

let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:22000"));

let abiDefinition = fs.readFileSync('./simplestorage_sol_SimpleStorage.abi').toString();
abiDefinition = JSON.parse(abiDefinition);

let LASTBLOCK = parseInt(process.env.LASTBLOCK || "0");
let TIMEOUT = parseInt(process.env.TIMEOUT || "5000");

let IDENTITY_TIMEOUT = parseInt(process.env.IDENTITY_TIMEOUT || "172800"); // 48h

const SCHEMA = Joi.object().keys({
    version: Joi.string().required(),
    name: Joi.string().required(),
    biometrics: Joi.array(),
    createdAt: Joi.date().required(),
});

const Datastore = require('nedb');
const IDENTITY_DB = new Datastore({
    inMemoryOnly: true
});

IDENTITY_DB.ensureIndex({fieldName: 'createdAt', expireAfterSeconds: IDENTITY_TIMEOUT}, function (err) {
    log.error({err: err}, "Could not create index");
});

function parseBlock(i, b, cb) {
    const txTarget = b.transactions[i];
    if (txTarget) {
        i = i + 1;

        web3.eth.getTransaction(txTarget).then(function (tx) {
            // check if private
            if (tx.v == 37 || tx.v == 38) {
                log.info({"tx": tx.hash}, "Got a private transaction");
            } else {
                return parseBlock(i, b, cb); // skip public transactions
            }

            //load smart contract
            log.info({"tx": tx.hash}, "Found a private contract, will load receipt");
            web3.eth.getTransactionReceipt(tx.hash, function (err, receipt) {
                if (err) {
                    log.error({
                        err: err,
                        "receipt.contractAddress": receipt.contractAddress,
                        "tx": tx.hash,
                    }, "Coult not getTransactionReceipt");
                    return parseBlock(i, b, cb);
                }
                log.info({
                    "tx": tx.hash,
                    "receipt.contractAddress": receipt.contractAddress,
                }, "Found a private contract, will load it, ");
                const contract = new web3.eth.Contract(abiDefinition, receipt.contractAddress);

                contract.methods.get().call().then(function (val) {
                    log.info({
                        "receipt.contractAddress": receipt.contractAddress,
                        "tx": tx.hash,
                    }, "****** Got a val from private contract, ");

                    let identity = null;
                    try {
                        identity = JSON.parse(val);
                    } catch (err) {
                        log.error({
                            err: err,
                            "receipt.contractAddress": receipt.contractAddress,
                            "tx": tx.hash,
                        }, "Could not parse JSON inside this psc, ");
                        return parseBlock(i, b, cb);
                    }

                    identity.createdAt = new Date();

                    const isValid = SCHEMA.validate(identity);
                    if (!isValid) {
                        log.error({
                            err: err,
                            "receipt.contractAddress": receipt.contractAddress,
                            "tx": tx.hash,
                        }, "Could not validate JSON inside this psc, ");
                        return parseBlock(i, b, cb);
                    }

                    IDENTITY_DB.insert(identity, function (err, newDoc) {
                        if (err) {
                            log.error({
                                err: err,
                                "receipt.contractAddress": receipt.contractAddress,
                                "tx": tx.hash,
                            }, "Failed to save data in memory ...");
                        } else {
                            log.info({
                                "_id": newDoc._id,
                                "receipt.contractAddress": receipt.contractAddress,
                                "tx": tx.hash,
                            }, "Saved data in memory ...");
                        }
                    });

                    return parseBlock(i, b, cb);
                }).catch(function (err) {
                    log.error({
                        err: err,
                        "receipt.contractAddress": receipt.contractAddress,
                        "tx": tx.hash,
                    }, "Could not load this contract, probably not the right one");
                    return parseBlock(i, b, cb);
                });
            }).catch(function (err) {
                log.error({err: err, "tx": tx.hash}, "Could not load getTransactionReceipt");
                return parseBlock(i, b, cb);
            });

        }).catch(function (err) {
            log.error({err: err, "tx": txTarget}, "Could not load getTransaction");
            return parseBlock(i, b, cb);
        });
    } else {
        log.info({"number": b.number}, "Finished processing block ");
        return cb();
    }
}

function scanBlock(blockNumber, cb) {
    web3.eth.getBlock(blockNumber).then(function (b) {

        parseBlock(0, b, function () {
            return cb();
        });

    }).catch(function (err) {
        log.error({err: err}, "Could not load getBlock");
        return cb();
    });

}


function doJob() {

    IDENTITY_DB.count({}, function (err, count) {
        if (err) {
            log.error({err: err}, "Failed to get the total of identities in memory, ");
        } else {
            log.info({"count": count}, "Counting identities saved in memory ... ");
        }
    });

    web3.eth.getBlockNumber().then(function (blockNumber) {
        if (!blockNumber) {
            log.error("Could not get blockNumber, are you connected ?");
            setTimeout(function () {
                return doJob();
            }, TIMEOUT);
        } else {
            if (LASTBLOCK <= blockNumber) {
                processTransactions(blockNumber);
            }

            log.info({"blockNumber": blockNumber, "LASTBLOCK": LASTBLOCK}, "restarting, ");

            setTimeout(function () {
                return doJob();
            }, TIMEOUT);

        }
    }).catch(function (err) {
        log.error({err: err}, "Could not load getBlockNumber");
        setTimeout(function () {
            return doJob();
        }, TIMEOUT);
    });
}

function processTransactions(blockNumber) {
    if (LASTBLOCK <= blockNumber) {
        log.info({"LASTBLOCK": LASTBLOCK}, "Scanning blockNumber, ");
        scanBlock(LASTBLOCK, function () {

            LASTBLOCK = LASTBLOCK + 1;

            processTransactions(blockNumber);
        });
    }
}


//first run
doJob();

