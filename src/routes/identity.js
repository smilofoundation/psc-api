const bunyan = require('bunyan');
const log = bunyan.createLogger({name: "server"});
const util = require('util');
const demodata = require("./demodata");
const Joi = require('joi');

module.exports.routes = function routes(IDENTITY_DB) {
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
                                return callback(null,results);
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
                            IDENTITY_DB.find({biometrics:biometrics}, function (err, results) {
                                if (err) {
                                    return callback(err);
                                }
                                return callback(null,results);
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
                                return callback(null,count);
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
    ];
}

