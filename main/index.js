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

const getDeadline = (ttl = 5000) => new Date(Date.now() + ttl);

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
  const message = {
    id: shortid.generate(),
    text
  };

  ids.add(message.id);
  messages.push(message);

  Promise.all(
    grpcClients
      .map(client => promisify(client.insert.bind(client)))
      .map(insert => insert(message, { deadline: getDeadline() }))
  ).then(() => {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(message));
  })
})

const server = http.createServer(function (req, res) {
  router(req, res, finalhandler(req, res))
})

server.listen(3000)
