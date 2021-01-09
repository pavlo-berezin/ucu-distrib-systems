const finalhandler = require('finalhandler');
const http = require('http');
const Router = require('router');
const bodyParser = require('body-parser');
const grpc = require('grpc');
const args = require('yargs').argv;
const { promisify } = require('util');
const health = require('grpc-health-check');
const RetryService = require('./retry');
const pRetry = require('p-retry');
const messageProto = grpc.load(__dirname + '/../messages.proto');
const secondaries = Array.isArray(args.secondary) ? args.secondary : [args.secondary];

const messages = [];

const idGenerator = (() => {
  let count = 1;
  return () => count++
})();

const retryService = new RetryService(messages);

const grpcClients = secondaries.map(url => ({
  url,
  messages: new messageProto.MessageService(url, grpc.credentials.createInsecure()),
  health: new health.Client(url, grpc.credentials.createInsecure())
}));

const DEFAULT_CONCERN = 2;

const getDeadline = (ttl = 30000) => new Date(Date.now() + ttl);

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
  const incosistentI = messages.findIndex((message, i, arr) => {
    if (i === 0) { return false }
  
    return message.id - arr[i - 1].id > 1; 
  });

  const messagesToReturn = incosistentI === -1 ? messages : messages.slice(0, incosistentI);

  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(messagesToReturn));
});

router.get('/health', (req, res) => {
  res.setHeader('Content-Type', 'application/json')
  Promise.all(
    grpcClients.map(async (client) => {
      const clientCheck = promisify(client.health.check.bind(client.health));

      try {
        await clientCheck(new health.messages.HealthCheckRequest())
        return { url: client.url, status: 'healthy' };
      } catch {
        return { url: client.url, status: 'unhealthy' };
      }
    })
  ).then(results => {
    res.end(JSON.stringify(results))
  })
});

router.post('/messages', async (req, res) => {
  const { text } = req.body;
  const concernN = req.headers.write_concern || DEFAULT_CONCERN;
  const total = 1 + grpcClients.length;

  if (concernN > total) {
    res.end('Concern cannot be reached');
    return;
  }

  let healthy = 1;

  for (let client of grpcClients) {
    const clientCheck = promisify(client.health.check.bind(client.health));

    try {
      await clientCheck(new health.messages.HealthCheckRequest())
      healthy++;
    } catch (e) { 
      retryService.check(client);
    }
  }


  if (healthy < Math.floor(total / 2) + 1) {
    res.setHeader('Content-Type', 'application/json');
    res.end('Quorum not reached');
    return;
  }

  const message = {
    id: idGenerator(),
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
