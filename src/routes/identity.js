const bunyan = require('bunyan');
const log = bunyan.createLogger({name: "server"});
const util = require('util');
const demodata = require("./demodata");
const Joi = require('joi');
var superagent = require("superagent");
const Web3 = require('web3');

const BLACKBOX_HOST = process.env.BLACKBOX_HOST || "http://localhost:9001";
const WEB3_HOST = process.env.WEB3_HOST || "http://localhost:22000";

let web3 = new Web3(new Web3.providers.HttpProvider(WEB3_HOST));

var urlencode = require('base64url');

module.exports.routes = function routes(IDENTITY_DB, TRANSACTIONS_DB, faceapi) {
    return [
        {
            method: 'GET',
            path: '/identities',
            config: {
                handler: async function (request, h) {
                    let identities = 0;
                    try {
                        const wait = function (callback) {
                            IDENTITY_DB.find({}, function (err, results) {
                                if (err) {
                                    return callback(err);
                                }
                                return callback(null, results);
                            });
                        };
                        const waitAsync = util.promisify(wait);
                        identities = await waitAsync();
                    } catch (err) {
                        log.error({err: err}, "Failed to get the total of identities in memory, ");
                        return {err: err};
                    }
                    return {identities: identities};
                },
                description: 'Array properties',
                tags: ['api', 'identity']
            },
        },
        {
            method: 'POST',
            path: '/identities/biometrics',

            config: {
                validate: {
                    payload: Joi.object().keys({
                        biometrics: Joi.array().default(demodata.biometrics).required()
                    }),
                },
                handler: async function (request, h) {

                    const payload = request.payload;
                    const biometrics = payload.biometrics;

                    let identities = 0;
                    try {
                        const wait = function (callback) {
                            IDENTITY_DB.find({}, function (err, results) {
                                if (err) {
                                    return callback(err);
                                }
                                return callback(null, results);
                            });
                        };
                        const waitAsync = util.promisify(wait);
                        identities = await waitAsync();
                    } catch (err) {
                        log.error({err: err}, "Failed to get the total of identities in memory, ");
                        return {err: err};
                    }

                    const result = [];
                    for (let i = 0; i < identities.length; i++) {
                        result.push(new faceapi.LabeledFaceDescriptors(identities[i]._id, new Array(new Float32Array(identities[i].biometrics))));
                    }
                    log.info({count: identities.length}, "Loaded FACEAPI_DB", result.length);

                    const faceMatcher = new faceapi.FaceMatcher(result);
                    const bestMatch = faceMatcher.findBestMatch(biometrics);
                    if (bestMatch) {
                        log.info("Found bestMatch, ", bestMatch.toString())
                    }

                    return {identity: bestMatch};

                },
                description: 'Get identity by biometrics',
                tags: ['api', 'identity']
            },
        }, {
            method: 'GET',
            path: '/identities/count',
            config: {
                handler: async function (request, h) {
                    let count = 0;
                    try {
                        const wait = function (callback) {
                            IDENTITY_DB.count({}, function (err, count) {
                                if (err) {
                                    return callback(err);
                                }
                                return callback(null, count);
                            })
                        };
                        const waitAsync = util.promisify(wait);
                        count = await waitAsync();
                    } catch (err) {
                        log.error({err: err}, "Failed to get the total of identities in memory, ");
                        return {err: err};
                    }
                    return {count: count};
                },
                description: 'Count existing identities',
                tags: ['api', 'identity'],
            },
        },

        {
            method: 'GET',
            path: '/transactions/count',
            config: {
                handler: async function (request, h) {
                    let count = 0;
                    try {
                        const wait = function (callback) {
                            TRANSACTIONS_DB.count({}, function (err, count) {
                                if (err) {
                                    return callback(err);
                                }
                                return callback(null, count);
                            })
                        };
                        const waitAsync = util.promisify(wait);
                        count = await waitAsync();
                    } catch (err) {
                        log.error({err: err}, "Failed to get the total of TRANSACTIONS_DB in memory, ");
                        return {err: err};
                    }
                    return {count: count};
                },
                description: 'Count existing TRANSACTIONS_DB',
                tags: ['api', 'identity'],
            },
        },
        {
            method: 'GET',
            path: '/transactions',
            config: {
                validate: {
                    query: Joi.object().keys({
                        contractAddress: Joi.string().default(demodata.contractAddress).required()
                    }),
                },
                handler: async function (request, h) {

                    const payload = request.query;
                    const contractAddress = payload.contractAddress;


                    let transactions = [];
                    try {
                        const wait = function (callback) {
                            let target = {};
                            if (contractAddress) {
                                target = {contractAddress: contractAddress}
                            }
                            TRANSACTIONS_DB.find(target, function (err, results) {
                                if (err) {
                                    return callback(err);
                                }
                                return callback(null, results);
                            });
                        };
                        const waitAsync = util.promisify(wait);
                        transactions = await waitAsync();
                    } catch (err) {
                        log.error({err: err}, "Failed to get the transactions in memory, ");
                        return {err: err};
                    }

                    // get transactions from blackbox and validate found = true
                    let transactionsValid = [];

                    try {
                        const wait = function (callback) {
                            transactions.forEach(async (item) => {
                                try {

                                    let tx = null;
                                    try {
                                        tx = await web3.eth.getTransaction(item.hash);

                                        log.info("Got TX", tx);
                                        tx.found = true;

                                        transactionsValid.push(tx);

                                    } catch (err) {
                                        log.error({err: err, "tx": item.hash}, "Could not load getTransaction");
                                        tx.found = false
                                    }

                                } catch (err) {
                                    log.error({err: err}, "Failed to DELETE the transactions from blackbox, ");
                                }

                                callback(null, transactionsValid)
                            });

                        };

                        const waitAsync = util.promisify(wait);
                        transactionsValid = await waitAsync();

                    } catch (err) {
                        log.error({err: err}, "Failed to get the transactions in memory, ");
                        return {err: err};
                    }

                    return {transactions, transactionsValid};
                },
                description: 'Array properties',
                tags: ['api', 'identity']
            },
        },

        {
            method: 'DELETE',
            path: '/transactions',
            config: {
                validate: {
                    payload: Joi.object().keys({
                        contractAddress: Joi.string().default(demodata.contractAddress).required()
                    }),
                },
                handler: async function (request, h) {

                    const payload = request.payload;
                    const contractAddress = payload.contractAddress;
                    if (!contractAddress) {
                        const err = "Failed to get contractAddress from payload";
                        log.error({err: err});
                        return {err: err}
                    }

                    let transactions = [];
                    try {
                        const wait = function (callback) {
                            TRANSACTIONS_DB.find({contractAddress: contractAddress}, function (err, results) {
                                if (err) {
                                    return callback(err);
                                }
                                return callback(null, results);
                            });
                        };
                        const waitAsync = util.promisify(wait);
                        transactions = await waitAsync();
                    } catch (err) {
                        log.error({err: err}, "Failed to get the transactions in memory, ");
                        return {err: err};
                    }

                    //delete transactions on blackbox
                    let deletedTransactions = [];
                    transactions.forEach(async (item) => {
                        try {

                            const buff = Buffer.from(item.input.split("0x")[1], 'hex');
                            let base64data = urlencode(buff) + "==";

                            const target = `${BLACKBOX_HOST}/transaction/${base64data}`;
                            log.info({target}, "Going to delete transaction, ");

                            const res = await superagent.del(target);
                            // res.body, res.headers, res.status
                            console.log({status: res.status, headers: res.headers}, "DELETE TRANSACTION OK, ");

                            deletedTransactions.push(item.hash);
                        } catch (err) {
                            log.error({err: err}, "Failed to DELETE the transactions from blackbox, ");
                            // err.message, err.response
                        }
                    });

                    return {deletedTransactions};
                },
                description: 'Array properties',
                tags: ['api', 'identity']
            },
        },


    ];
}

// curl -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"eth_getVaultTransaction","params":["0x"],"id":67}' http://localhost:22000
