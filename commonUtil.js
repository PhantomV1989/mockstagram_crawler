const http = require("http");

function sendHttpRequest(type, body, addr_port, route) {
    // sendHttpRequest('post',{'a':1},'123.123.123.23','/a')
    addr_port = addr_port.split(':');
    let host = addr_port[0];
    let port = addr_port[1];
    return new Promise((re, rj) => {
        try {
            body = JSON.stringify(body);
            let post_options = {
                host: host,
                port: port,
                path: route,
                method: type,
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body)
                }
            };
            let response = '';
            let postReq = http.request(post_options, function (res) {
                res.setEncoding('utf8');
                res.on('data', function (chunk) {
                    response += chunk;
                });
                res.on('end', () => {
                    try {
                        response = JSON.parse(response);
                        re(response);
                    } catch (e) {
                        re(response.toString());
                    }
                });
            }).on('error', (e) => {
                rj(e)
            })
            postReq.write(body);
            postReq.end();
        } catch (e) {
            rj(e);
        }

    });
}

module.exports.sendHttpRequest = sendHttpRequest;