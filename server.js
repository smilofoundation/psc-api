const Hapi = require('hapi');
const Inert = require('inert');
const Vision = require('vision');
const HapiSwagger = require('hapi-swagger');
const Pack = require('./package');

const reader = require("./src/reader");
const bunyan = require('bunyan');

const schemes = /production/.test(process.env.NODE_ENV) ? 'https' : 'http';
const PORT = parseInt(process.env.PORT || "3000");

const log = bunyan.createLogger({name: "server"});

(async () => {
    const server = await new Hapi.Server({
        port: PORT,
    });

    const swaggerOptions = {
        basePath: '/',
        schemes: [schemes],
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
