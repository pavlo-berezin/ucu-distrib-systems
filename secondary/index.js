const finalhandler = require('finalhandler');
const http = require('http');
const Router = require('router');
const bodyParser = require('body-parser');
const grpc = require('grpc');
const messageProto = grpc.load(__dirname + '/../messages.proto');
const { promisify } = require('util');
const args = require('yargs').argv;
let health = require('grpc-health-check');

const messages = [];
const ids = new Set()

const router = Router();
const maxDelay = args.delay | 0;

const sleep = promisify(setTimeout);

router.use(bodyParser.json())

router.get('/messages', (req, res) => {
  const incosistentI = messages.findIndex((message, i, arr) => {
    return message.id - (i + 1) > 0; 
  });

  const messagesToReturn = incosistentI === -1 ? messages : messages.slice(0, incosistentI);

  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(messagesToReturn));
});

const server = http.createServer(function (req, res) {
  router(req, res, finalhandler(req, res))
})


server.listen(3001)
const grpcServer = new grpc.Server();

grpcServer.addService(messageProto.MessageService.service, {
  insert: (call, callback) => {
    let message = call.request;
    const delay = Math.random() * maxDelay;
    console.log(`Delay: ${delay}`);
    sleep(Math.random() * maxDelay).then(() => {
      if (!ids.has(message.id)) {
        ids.add(message.id);
        messages.push(message);
      }
  
      messages.sort((a, b) => a.time - b.time);
      console.log(`Insert message with id: ${message.id}`);
      callback(null, { status: 'ok' });
    });  
  },
  insertMany: (call, callback) => {
    let messageList = call.request;
    const delay = Math.random() * maxDelay;
    console.log(`Delay: ${delay}`);

    sleep(delay).then(() => {
      messageList.messages.forEach(message => {
        if (!ids.has(message.id)) {
          ids.add(message.id);
          messages.push(message);
        }
      })
      messages.sort((a, b) => a.time - b.time);
  
      console.log(`InsertMany messages with ids: ${messageList.messages.map(m => m.id)}`);
      callback(null, { status: 'ok' })
    });
  }
})

const statusMap = {
  "": proto.grpc.health.v1.HealthCheckResponse.ServingStatus.SERVING,
};
let healthImpl = new health.Implementation(statusMap);

grpcServer.addService(health.service, healthImpl);


grpcServer.bind(args.grpc, grpc.ServerCredentials.createInsecure());
grpcServer.start();