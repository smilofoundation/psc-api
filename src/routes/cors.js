module.exports.addCORS = function (request, reply) {
    var response;

    if (request.response.isBoom) {
        response = request.response.output;
    }
    if (!request.response.isBoom) {
        response = request.response;
    }
    response.headers['Access-Control-Allow-Origin'] = request.headers.origin;
    response.headers['Access-Control-Allow-Credentials'] = 'true';

    response.statusCode = 200;
    response.headers['Access-Control-Allow-Headers'] = 'content-type, content-length, etag, comentarismo-key';
    response.headers['Access-Control-Max-Age'] = 60 * 10;
    if (request.headers['Access-Control-Request-Headers']) {
        console.log("HEADERS")
        response.headers['Access-Control-Allow-Headers'] = request.headers['Access-Control-Request-Headers']
    }
    if (request.headers['Access-Control-Allow-Methods']) {
        console.log("METHODS")
        response.headers['Access-Control-Allow-Methods'] = request.headers['Access-Control-Request-Method'];
    }
    //response.headers['Access-Control-Request-Headers'] = 'content-type'
    // console.log("INFO: ", response.headers)
    return reply.continue;
};
