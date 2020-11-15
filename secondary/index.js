const finalhandler = require('finalhandler');
const http = require('http');
const Router = require('router');
const bodyParser = require('body-parser');
const grpc = require('grpc')
const messageProto = grpc.load(__dirname + '/../messages.proto');

const messages = [];
const ids = new Set()

const router = Router();

router.use(bodyParser.json())

router.get('/messages', (req, res) => {
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(messages));
});

const server = http.createServer(function(req, res) {
  router(req, res, finalhandler(req, res))
})
 
server.listen(3001)

const grpcServer = new grpc.Server();
grpcServer.addService(messageProto.MessageService.service, {
  insert: (call, callback) => {
    let message = call.request;

    if (!ids.has(message.id)) {
      ids.add(message.id);
      messages.push(message);
    }

    console.log(messages);
    callback(null, { status: 'ok' })
  }
})


grpcServer.bind('127.0.0.1:50051', grpc.ServerCredentials.createInsecure());
grpcServer.start();