const http = require("http");
const agent = new http.Agent({ maxSockets: 10 }); // <-- this is new


function sendHttpRequest(type, body, addr_port, route, contentType = 'application/json') {
    // sendHttpRequest('post',{'a':1},'123.123.123.23','/a')
    addr_port = addr_port.split(':');
    let host = addr_port[0];
    let port = addr_port[1];
    return new Promise((re, rj) => {
        try {
            body = typeof body === 'string' ? body : JSON.stringify(body);
            let post_options = {
                host: host,
                port: port,
                path: route,
                method: type,
                headers: {
                    'Content-Type': contentType,
                    'Content-Length': Buffer.byteLength(body)
                },
                agent: agent
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
            postReq.setNoDelay();
            postReq.write(body);
            postReq.end();
        } catch (e) {
            rj(e);
        }
    });
}

function sleep(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms)
    })
}


module.exports.sendHttpRequest = sendHttpRequest;
module.exports.sleep = sleep;