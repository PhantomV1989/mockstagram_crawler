const fs = require('fs');
let path = require('path');
const conf = require('../config');
let infraPath = path.dirname(process.argv[1]);
const util = require('../commonUtil').Util;

let storagePath = process.argv[2];
let prometheusStoragePath = storagePath + '/prometheus';
let objstoreStoragePath = storagePath + '/objstore';
let mongoStoragePath = storagePath + '/mongo';
let dockerNamePrefix = 'mockstagram_';

function mkdirIfNotExist(dir) {
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir);
}

async function initializeStorageFolders() {
    mkdirIfNotExist(storagePath);
    mkdirIfNotExist(prometheusStoragePath);
    mkdirIfNotExist(objstoreStoragePath);
    mkdirIfNotExist(mongoStoragePath);
}

class PrometheusNodeDockerScipts {
    static generatePrometheusPushgatewayCommand() {
        return 'sudo docker run -d --rm -p ' + conf.pushgatewayPort + ':9091 --name ' + dockerNamePrefix + 'pushgateway prom/pushgateway --web.enable-admin-api'
    }
    static generatePrometheusDockerCommand() {
        let content = [
            'sudo docker run -d --rm --network=host',
            '-v ' + infraPath + '/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml',
            '-v ' + infraPath + '/prometheus/targets.json:/etc/prometheus/targets.json',
            '-v ' + prometheusStoragePath + ':/prometheus',
            '--name ' + dockerNamePrefix + 'prometheus quay.io/prometheus/prometheus',
            '--config.file=/etc/prometheus/prometheus.yml',
            '--storage.tsdb.path=/prometheus',
            '--storage.tsdb.retention.time=2h',
            '--web.console.libraries=/usr/share/prometheus/console_libraries',
            '--web.console.templates=/usr/share/prometheus/consoles',
            '--web.enable-lifecycle',
            '--web.enable-admin-api',
            '--storage.tsdb.min-block-duration=1h',
            '--storage.tsdb.max-block-duration=1h'
        ];
        return content.join(' ');
    }
    static generateThanosSidecarDockerCommand() {
        let content = [
            'sudo docker run -d --rm --network=host',
            '-v ' + prometheusStoragePath + ':/var/prometheus',
            '-v ' + objstoreStoragePath + ':/objstore',
            '-v ' + infraPath + '/thanos/store.yml:/store.yml',
            '--name ' + dockerNamePrefix + 'thanos_sidecar docker.io/thanosio/thanos:master-2019-12-23-39f8623b sidecar',
            '--prometheus.url http://localhost:9090 ',
            '--http-address 0.0.0.0:19191',
            '--grpc-address 0.0.0.0:19090',
            '--objstore.config-file  "/store.yml"',
            '--tsdb.path /var/prometheus'
        ];
        return content.join(' ');
    }

    static generateThanosStorageDockerCommand() {
        let content = [
            'sudo docker run -d --rm --network=host',
            '-v ' + objstoreStoragePath + ':/objstore',
            '-v ' + infraPath + '/thanos/store.yml:/store.yml',
            '--name ' + dockerNamePrefix + 'thanos_store  docker.io/thanosio/thanos:master-2019-12-23-39f8623b store',
            '--grpc-address 0.0.0.0:19091',
            '--objstore.config-file "/store.yml"',
        ];
        return content.join(' ');
    }

    static generateScriptList() {
        return [
            this.generatePrometheusPushgatewayCommand(),
            this.generatePrometheusDockerCommand(),
            this.generateThanosSidecarDockerCommand(),
            this.generateThanosStorageDockerCommand()
        ]
    }
}

function generateThanosQuerierCommand() {
    let content = [
        'sudo docker run -d --rm --network=host',
        '--name ' + dockerNamePrefix + 'thanos_querier',
        'docker.io/thanosio/thanos:master-2019-12-23-39f8623b query',
        '--http-address 0.0.0.0:' + conf.thanosPort,
        '--store 0.0.0.0:19090', // for prometheus
        '--store 0.0.0.0:19091', // for sidecar store
    ];
    return content.join(' ');
}

function generateMongoDockerCommand() {
    let content = [
        'sudo docker run -d -p ' + conf.mongoPort + ':27017 --rm',
        '-v ' + mongoStoragePath + ':/data/db',
        '--name ' + dockerNamePrefix + 'mongodb  mongo:3.6',
    ];
    return content.join(' ');
}

function generatePushgatewayWiperCommand() {
    let tmpFile = infraPath + '/_tmp.sh';
    fs.writeFileSync(tmpFile, "while true; do curl -X PUT " + conf.pushgatewayService + "/api/v1/admin/wipe; sleep " + conf.crawlerIntervalSeconds * 3 + "; done");
    let content = [
        //sudo docker run --network=host --rm --entrypoint /bin/sh deleteme ./delme.sh
        'sudo docker run -d --rm --network=host',
        '-v ' + tmpFile + ':/usr/_tmp.sh',
        '--entrypoint /bin/sh',
        '--name ' + dockerNamePrefix + 'pushwiper  byrnedo/alpine-curl:0.1.8',
        '/usr/_tmp.sh'
    ];
    return content.join(' ');
}

function generateDockerRunScript() {
    let dockerCommands = PrometheusNodeDockerScipts.generateScriptList().concat([
        generateThanosQuerierCommand(),
        generateMongoDockerCommand(),
        generatePushgatewayWiperCommand()
    ]);
    return dockerCommands.join(' && ');
}

function generateDockerStopScript() {
    let content = [
        'pushgateway',
        'prometheus',
        'thanos_sidecar',
        'thanos_store',
        'thanos_querier',
        'mongodb',
        'pushwiper'
    ];
    content = content.map(x => dockerNamePrefix + x).join(' ');
    return 'sudo docker container stop ' + content;
}

(
    async () => {
        await initializeStorageFolders();
        console.log('Folders created. Please give rights for folders: \n\n\tsudo chmod -R 777 ' + storagePath + '\n\n');
        fs.writeFileSync(infraPath + '/autoGenDockerRunScript.sh', generateDockerRunScript());
        console.log('autoGenDockerRunScript.sh created.');
        fs.writeFileSync(infraPath + '/autoGenDockerStopScript.sh', generateDockerStopScript());
        console.log('autoGenDockerStopScript.sh created.');

        await util.startNewChildProcess('chmod', ['-R', '777', storagePath]);
        await util.startNewChildProcess('bash', [infraPath + '/autoGenDockerRunScript.sh']);
        //await util.startNewChildProcess('bash', [infraPath + '/infraSetup/autoGenDockerRunScript.sh']);
        console.log('Docker containers installed. To manage the containers related to this project, use the following commands:')
        console.log('Setup:\n\n\tbash ./infraSetup/autoGenDockerRunScript.sh\n\n.');
        console.log('List project containers\n\n\tsudo docker container ls|grep ' + dockerNamePrefix + '\n\n.');
        console.log('Uninstall containers:\n\n\tbash ./infraSetup/autoGenDockerStopScript.sh\n\n.');
    }
)()