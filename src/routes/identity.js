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
                        if (!identities[i].biometrics || identities[i].biometrics.length === 0) {
                            continue
                        }
                        try {
                            result.push(new faceapi.LabeledFaceDescriptors(identities[i]._id, new Array(new Float32Array(identities[i].biometrics))));
                        } catch (e) {
                            log.error({err: err}, "Failed to process identity ");
                        }
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
            path: '/transactions/{contractAddress}',
            config: {
                validate: {
                    params: Joi.object().keys({
                        contractAddress: Joi.string().default(demodata.contractAddress).required()
                    }),

                },
                handler: async function (request, h) {

                    const contractAddress = encodeURIComponent(request.params.contractAddress);
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
                    try {

                        async function deleteTx(count, cb) {
                            const item = transactions[count];
                            if (!item) {
                                return cb(deletedTransactions);
                            }

                            count = count + 1;

                            try {

                                const buff = Buffer.from(item.input.split("0x")[1], 'hex');
                                let base64data = urlencode(buff) + "==";

                                const target = `${BLACKBOX_HOST}/transaction/${base64data}`;
                                log.info({target}, "Going to delete transaction, ");

                                const res = await superagent.del(target);
                                // res.body, res.headers, res.status
                                if (!res) {
                                    log.error({contractAddress: contractAddress}, "Failed to DELETE the transactions from blackbox, res is null");

                                    return deleteTx(count, cb);
                                } else {
                                    console.log({
                                        status: res.status,
                                        headers: res.headers
                                    }, "DELETE TRANSACTION OK, ");
                                    if (res.status === 204) {

                                        try {
                                            const wait = function (callback) {
                                                TRANSACTIONS_DB.remove({contractAddress: contractAddress}, {}, function (err, numRemoved) {
                                                    if (err) {
                                                        return callback(err);
                                                    }
                                                    return callback(null, numRemoved);
                                                });
                                            };
                                            const waitAsync = util.promisify(wait);
                                            transactions = await waitAsync();

                                            deletedTransactions.push(item.hash);
                                            return deleteTx(count, cb);

                                        } catch (err) {
                                            log.error({
                                                err: err,
                                                contractAddress: contractAddress
                                            }, "Failed to delete the IDENTITY in memory, ");
                                            return deleteTx(count, cb);
                                        }

                                    } else {
                                        log.error({
                                            contractAddress: contractAddress,
                                            transactions: transactions,
                                        }, "Could not properly delete the transactions from blackbox, will not delete from in memory db");
                                        return deleteTx(count, cb);

                                    }
                                }

                            } catch (err) {
                                log.error({
                                    err: err,
                                    contractAddress: contractAddress
                                }, "Failed to DELETE the transactions from blackbox, ");
                                // err.message, err.response
                                return deleteTx(count, cb);
                            }

                        }

                        const txs = await deleteTx(0, function (deletedTransactions) {
                            //done
                            log.info({deletedTransactions: deletedTransactions}, "Managed to get some transactions deleted ? ");
                            return deletedTransactions;
                        });


                    } catch (err) {
                        log.error({err: err}, "Failed to deletedTransactions ");
                        return {err: err};
                    }

                    if (deletedTransactions.length > 0) {
                        log.info({deletedTransactionslength: deletedTransactions.length}, "will delete IDENTITY_DB");

                        try {
                            const wait = function (callback) {
                                IDENTITY_DB.remove({_id: contractAddress}, {}, function (err, numRemoved) {
                                    if (err) {
                                        return callback(err);
                                    }
                                    return callback(null, numRemoved);
                                });
                            };
                            const waitAsync = util.promisify(wait);
                            const identitiesRemoved = await waitAsync();
                            log.info({identitiesRemoved: identitiesRemoved}, "Managed to delete some identities ? ");
                        } catch (err) {
                            log.error({
                                err: err,
                                contractAddress: contractAddress
                            }, "Failed to delete the IDENTITY in memory, ");
                            return {err: err};
                        }

                    } else {
                        log.warn({
                            contractAddress: contractAddress
                        }, "Could not find any deletedTransactions in the array, is this correct ? ");
                    }

                    log.info("Going to return deletedTransactions ...");
                    return {deletedTransactions};
                },
                description: 'Array properties',
                tags: ['api', 'identity']
            },
        },


    ];
}

// curl -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"eth_getVaultTransaction","params":["0x"],"id":67}' http://localhost:22000
