const Web3 = require('web3');
const fs = require('fs');
const Joi = require('joi');
const bunyan = require('bunyan');
const Datastore = require('nedb');
const util = require('util');

const log = bunyan.createLogger({name: "reader"});

const WEB3_HOST = process.env.WEB3_HOST || "http://localhost:22000";

let web3 = new Web3(new Web3.providers.HttpProvider(WEB3_HOST));

let abiDefinition = fs.readFileSync('./simplestorage_sol_SimpleStorage.abi').toString();
abiDefinition = JSON.parse(abiDefinition);

let ACTUAL_BLOCK = parseInt(process.env.ACTUAL_BLOCK || "0");
let TIMEOUT = parseInt(process.env.TIMEOUT || "5000");

let IDENTITY_TIMEOUT = parseInt(process.env.IDENTITY_TIMEOUT || "172800"); // 48h

const SCHEMA = Joi.object().keys({
    version: Joi.string().required(),
    name: Joi.string().required(),
    biometrics: Joi.array(),
    createdAt: Joi.date().required(),
});

let IDENTITY_DB = null;

const identityRoute = require("./routes/identity");


async function parseBlock(i, b, cb) {
    const txTarget = b.transactions[i];
    if (txTarget) {
        i = i + 1;

        let tx = null;
        try {
            tx = await web3.eth.getTransaction(txTarget);
        } catch (err) {
            log.error({err: err, "tx": txTarget}, "Could not load getTransaction");
            return parseBlock(i, b, cb);
        }
        // check if private
        if (tx.v == 37 || tx.v == 38) {
            log.info({"tx": tx.hash}, "Got a private transaction");
        } else {
            return parseBlock(i, b, cb); // skip public transactions
        }

        //load smart contract
        log.info({"tx": tx.hash}, "Found a private contract, will load receipt");

        let receipt = null;
        try {
            receipt = await web3.eth.getTransactionReceipt(tx.hash)
        } catch (err) {
            log.error({
                err: err,
                "tx": tx.hash,
            }, "Coult not getTransactionReceipt");
            return parseBlock(i, b, cb);
        }

        log.info({
            "tx": tx.hash,
            "receipt.contractAddress": receipt.contractAddress,
        }, "Found a private contract, will load it, ");
        const contract = new web3.eth.Contract(abiDefinition, receipt.contractAddress);

        let val = null;
        try {
            val = await contract.methods.get().call()
        } catch (err) {
            log.error({
                err: err,
                "receipt.contractAddress": receipt.contractAddress,
                "tx": tx.hash,
            }, "Could not load this contract, probably not the right one");
            return parseBlock(i, b, cb);
        }


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

        const wait = function (callback) {
            IDENTITY_DB.find({biometrics: identity.biometrics}, function (err, results) {
                if (err) {
                    return callback(err);
                }
                return callback(null, results);
            });
        };
        const waitAsync = util.promisify(wait);
        let identitiesList = await waitAsync();

        if (identitiesList && identitiesList.length > 0) {
            //update
            IDENTITY_DB.update({_id: identitiesList[0]._id}, identity, {upsert: true}, function (err, newDoc) {
                if (err) {
                    log.error({
                        err: err,
                        "receipt.contractAddress": receipt.contractAddress,
                        "tx": tx.hash,
                    }, "Failed to update data in memory ...");
                } else {
                    log.info({
                        "_id": newDoc._id,
                        "receipt.contractAddress": receipt.contractAddress,
                        "tx": tx.hash,
                    }, "Updated data in memory ...");
                }
                return parseBlock(i, b, cb);
            })
        } else {
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
                return parseBlock(i, b, cb);
            });
        }
    } else {
        log.info({"number": b.number}, "Finished processing block ");
        return cb();
    }
}

async function scanBlock(blockNumber, cb) {
    let b = null;
    try {
        b = await web3.eth.getBlock(blockNumber)
    } catch (err) {
        log.error({err: err}, "Could not load getBlock");
        return cb();
    }

    parseBlock(0, b, function () {
        return cb();
    });
}


function processTransactions(blockNumber) {
    if (ACTUAL_BLOCK <= blockNumber) {
        log.info({"ACTUAL_BLOCK": ACTUAL_BLOCK}, "Scanning blockNumber, ");
        scanBlock(ACTUAL_BLOCK, function () {

            ACTUAL_BLOCK = ACTUAL_BLOCK + 1;

            processTransactions(blockNumber);
        });
    }
}

module.exports.start = async function start(server) {

    if (server) {
        IDENTITY_DB = new Datastore({
            inMemoryOnly: true
        });
        IDENTITY_DB.ensureIndex({fieldName: 'createdAt', expireAfterSeconds: IDENTITY_TIMEOUT}, function (err) {
            if (err) {
                log.error({err: err}, "Could not create index");
            }
        });

        IDENTITY_DB.ensureIndex({fieldName: 'biometrics'}, function (err) {
            if (err) {
                log.error({err: err}, "Could not create index");
            }
        });

        server.route(identityRoute.routes(IDENTITY_DB));
    }


    IDENTITY_DB.count({}, function (err, count) {
        if (err) {
            log.error({err: err}, "Failed to get the total of identities in memory, ");
        } else {
            log.info({"count": count}, "Counting identities saved in memory ... ");
        }
    });

    let blockNumber = null;
    try {
        blockNumber = await web3.eth.getBlockNumber();
    } catch (err) {
        log.error({err: err}, "Could not load getBlockNumber");
        return await setTimeout(function () {
            return start();
        }, TIMEOUT);
    }

    if (ACTUAL_BLOCK <= blockNumber) {
        processTransactions(blockNumber);
    }

    log.info({"blockNumber": blockNumber, "ACTUAL_BLOCK": ACTUAL_BLOCK}, "Restarting ... ");

    setTimeout(function () {
        return start();
    }, TIMEOUT);
}

module.exports.IDENTITY_DB = IDENTITY_DB;

