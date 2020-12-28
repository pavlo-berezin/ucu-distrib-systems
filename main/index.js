const finalhandler = require('finalhandler');
const http = require('http');
const Router = require('router');
const bodyParser = require('body-parser');
const grpc = require('grpc');
const shortid = require('shortid');
const args = require('yargs').argv;
const { promisify } = require('util');
const health = require('grpc-health-check');
const RetryService = require('./retry');
const pRetry = require('p-retry');
const messageProto = grpc.load(__dirname + '/../messages.proto');
const secondaries = Array.isArray(args.secondary) ? args.secondary : [args.secondary];

const messages = [];

const retryService = new RetryService(messages);

const grpcClients = secondaries.map(url => ({
  url,
  messages: new messageProto.MessageService(url, grpc.credentials.createInsecure()),
  health: new health.Client(url, grpc.credentials.createInsecure())
}));

const DEFAULT_CONCERN = 2;

const getDeadline = (ttl = 200) => new Date(Date.now() + ttl);

const insertMessage = (client, message) => {
  const insert = promisify(client.messages.insert.bind(client.messages));

  return pRetry(() => {
    return insert(message, { deadline: getDeadline() })
      .then((message) => {
        if (message.status !== 'ok') {
          throw new Error('status not ok');
        }

        return message;
      }).catch(e => {
        console.log(`[Insert fail] ${e.code} - ${e.details}`);

        if (e.code == 4 || e.code == 14) {
          return retryService.check(client);
        }

        throw e;
      })
  }, {
    onFailedAttempt: error => {
      console.log(`[${message.id}] Attempt ${error.attemptNumber} failed.`);
    },
    maxTimeout: 60 * 1000,
    forever: true,
  })
}

const promisesWithConcern = (promises, concernN) => {
  return new Promise((resolve, reject) => {
    let completed = 0;
    let resolved = 0;

    for (let promise of promises) {
      promise.then(r => {
        resolved++;

        if (resolved >= concernN) {
          resolve(true);
        }
      }).catch(e => {
        console.log(e);
      }).finally(() => {
        completed++;

        if (completed === promises.length) {
          reject('All promises completed but concern not achieved');
        }
      })
    }

    if (concernN === 0) {
      resolve(true);
    }
  });
};

const ids = new Set();

const router = Router();

router.use(bodyParser.json())

router.get('/messages', (req, res) => {
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(messages));
});

router.get('/health', (req, res) => {
  res.setHeader('Content-Type', 'application/json')
  //promisify(client.messages.insert.bind(client.messages));

  Promise.all(grpcClients.map(x => x.health).map(x => promisify(x.check.bind(x.check))).map(check => check(new health.messages.HealthCheckRequest()))).then(x => console.log(x)).catch();
  res.end(JSON.stringify(grpcClients.map(x => x.health)));
}); 

router.post('/messages', (req, res) => {
  const { text } = req.body;
  const concernN = req.headers.write_concern || DEFAULT_CONCERN;

  const message = {
    id: shortid.generate(),
    time: Date.now(),
    text
  };

  ids.add(message.id);
  messages.push(message);
  messages.sort((a, b) => a.time - b.time);

  promisesWithConcern(
    grpcClients.map(client => insertMessage(client, message)),
    concernN - 1
  ).then(() => {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(message));
  }).catch((e) => {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(e));
  })
})

const server = http.createServer(function (req, res) {
  router(req, res, finalhandler(req, res))
})

server.listen(3000)
