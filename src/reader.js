const Web3 = require('web3');
const fs = require('fs');
const Joi = require('joi');
const bunyan = require('bunyan');
const Datastore = require('nedb');
const util = require('util');

//face api
const faceapi = require('face-api.js');
require('@tensorflow/tfjs-node');


const log = bunyan.createLogger({name: "reader"});

const WEB3_HOST = process.env.WEB3_HOST || "http://localhost:22000";

let web3 = new Web3(new Web3.providers.HttpProvider(WEB3_HOST));

const SMART_CONTRACT_FILE = process.env.SMART_CONTRACT_FILE || "FlightPass";
const ACCOUNT_ADDRESS = process.env.ACCOUNT_ADDRESS || "0xecf7e57d01d3d155e5fc33dbc7a58355685ba39c";

let abiDefinition = process.env.READER_ABI || fs.readFileSync(`./psc/${SMART_CONTRACT_FILE}.abi`).toString();
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
let TRANSACTIONS_DB = null;

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
            log.info({"txhash": tx.hash, "v": tx.v, "tx": tx}, "Got a private transaction");
        } else {
            return parseBlock(i, b, cb); // skip public transactions
        }

        //load smart contract
        log.info({"tx": tx.hash}, "Found a private contract, will load receipt");

        let receipt = null;
        if (!tx.to) {

            try {
                receipt = await web3.eth.getTransactionReceipt(tx.hash)
            } catch (err) {
                log.error({
                    err: err,
                    "tx": tx.hash,
                }, "Coult not getTransactionReceipt");
                return parseBlock(i, b, cb);
            }

            if (!receipt) {

                log.error({
                    err: err,
                    "tx": tx.hash,
                }, "Coult not getTransactionReceipt");
                return parseBlock(i, b, cb);
            }
        } else {
            receipt = {
                contractAddress: tx.to
            }
        }

        log.info({
            "tx": tx.hash,
            "receipt.contractAddress": receipt.contractAddress,
        }, "Found a private contract, will load it, ");
        const contract = new web3.eth.Contract(abiDefinition, receipt.contractAddress);


        let identity = null;
        log.info({
            SMART_CONTRACT_FILE: SMART_CONTRACT_FILE,
            ACCOUNT_ADDRESS: ACCOUNT_ADDRESS
        }, "Will load smart contract");

        if (SMART_CONTRACT_FILE === "FlightPass") {
            log.info("Will load FlightPass smart contract steps ");

            let name = null;
            try {
                name = await contract.methods.getName().call({from: ACCOUNT_ADDRESS})
            } catch (err) {
                log.error({
                    err: err,
                    "receipt.contractAddress": receipt.contractAddress,
                    "tx": tx.hash,
                }, "Could not load getName at this contract, probably not the right one");
                return parseBlock(i, b, cb);
            }

            if (!name) {
                log.error({
                    "receipt.contractAddress": receipt.contractAddress,
                    "tx": tx.hash,
                }, "Could not load name on this contract, probably not the right one");
                return parseBlock(i, b, cb);
            }

            let biometrics = null;
            try {
                biometrics = await contract.methods.getVectors().call({from: ACCOUNT_ADDRESS});
            } catch (err) {
                log.error({
                    err: err,
                    "receipt.contractAddress": receipt.contractAddress,
                    "tx": tx.hash,
                }, "Could not load getVectors at this contract, probably not the right one");
                return parseBlock(i, b, cb);
            }
            if (!biometrics) {
                log.warn({
                    "receipt.contractAddress": receipt.contractAddress,
                    "tx": tx.hash,
                }, "Could not load biometrics on this contract, probably not the right one");
                // temp fix
                biometrics = [];
            } else {
                try {
                    biometrics = JSON.parse(biometrics);
                } catch (err) {
                    log.error({
                        err: err,
                        "receipt.contractAddress": receipt.contractAddress,
                        "tx": tx.hash,
                    }, "Could not parse biometrics from getVectors at this contract, probably not the right one");
                    return parseBlock(i, b, cb);
                }
            }

            identity = {
                name: name,
                biometrics: biometrics,
                version: "1",
            }

        } else {

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
        }


        if (!identity) {
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

        identity._id = receipt.contractAddress;

        //update with upsert true
        IDENTITY_DB.update({_id: identity._id}, identity, {upsert: true}, function (err) {
            if (err) {
                log.error({
                    err: err,
                    "receipt.contractAddress": receipt.contractAddress,
                    "tx": tx.hash,
                }, "Failed to update IDENTITY_DB data in memory ...");
            }

            tx.contractAddress = receipt.contractAddress;
            TRANSACTIONS_DB.update({_id: tx.hash}, tx, {upsert: true}, function (err) {
                if (err) {
                    log.error({
                        err: err,
                        "receipt.contractAddress": receipt.contractAddress,
                        "tx": tx.hash,
                    }, "Failed to update TRANSACTIONS_DB data in memory ...");
                }
                return parseBlock(i, b, cb);
            });
        });

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

        TRANSACTIONS_DB = new Datastore({
            inMemoryOnly: true
        });

        await faceapi.nets.ssdMobilenetv1.loadFromDisk('./src/face-api/models');
        await faceapi.nets.faceLandmark68Net.loadFromDisk('./src/face-api/models');
        await faceapi.nets.faceRecognitionNet.loadFromDisk('./src/face-api/models');
        console.log("Loaded face-api.js models");

        const routes = identityRoute.routes(IDENTITY_DB, TRANSACTIONS_DB, faceapi);
        server.route(routes);

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

