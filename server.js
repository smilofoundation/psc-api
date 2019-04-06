const Hapi = require('hapi');
const Inert = require('inert');
const Vision = require('vision');
const HapiSwagger = require('hapi-swagger');
const Pack = require('./package');

const reader = require("./src/reader");

const bunyan = require('bunyan');
const log = bunyan.createLogger({name: "server"});

(async () => {
    const server = await new Hapi.Server({
        host: 'localhost',
        port: 3000,
    });

    const swaggerOptions = {
        info: {
            title: 'API Documentation',
            version: Pack.version,
        },
    };

    await server.register([
        Inert,
        Vision,
        {
            plugin: HapiSwagger,
            options: swaggerOptions
        }
    ]);

    try {
        await server.start();
        log.info("==> 🌎  Listening on %s", server.info.uri)

    } catch (err) {
        log.error({err: err}, "Could not start server");
    }

    //start reader
    reader.start(server);

})();
