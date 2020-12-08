const finalhandler = require('finalhandler');
const http = require('http');
const Router = require('router');
const bodyParser = require('body-parser');
const grpc = require('grpc');
const shortid = require('shortid');
const args = require('yargs').argv;
const { promisify } = require('util');

const messageProto = grpc.load(__dirname + '/../messages.proto');
const secondaries = Array.isArray(args.secondary) ? args.secondary : [args.secondary];
const grpcClients = secondaries.map(url => new messageProto.MessageService(url, grpc.credentials.createInsecure()));

const DEFAULT_CONCERN = 2;

const getDeadline = (ttl = 50) => new Date(Date.now() + ttl);

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

const messages = [];
const ids = new Set();

const router = Router();

router.use(bodyParser.json())

router.get('/messages', (req, res) => {
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(messages));
});

router.post('/messages', (req, res) => {
  const { text } = req.body;
  const concernN = req.headers.write_concern || DEFAULT_CONCERN;

  const message = {
    id: shortid.generate(),
    text
  };

  ids.add(message.id);
  messages.push(message);

  promisesWithConcern(
    grpcClients
      .map(client => promisify(client.insert.bind(client)))
      .map(insert => insert(message, { deadline: getDeadline() }))
      .map(p => p.then(({ status }) => {
        if (status !== 'ok') {
          throw new Error('status not ok');
        }
      })),
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
