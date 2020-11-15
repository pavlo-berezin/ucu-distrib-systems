const finalhandler = require('finalhandler');
const http = require('http');
const Router = require('router');
const bodyParser = require('body-parser');
const grpc = require('grpc');
const shortid = require('shortid');

const messageProto = grpc.load(__dirname + '/../messages.proto');
const client = new messageProto.MessageService('localhost:50051', grpc.credentials.createInsecure());

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

  client.insert(message, { deadline: getDeadline() }, (error, reply) => {
    if (!error) {
      console.log('success', reply);
    } else {
      console.log(error);
    }
  })


  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(message));
})

const server = http.createServer(function(req, res) {
  router(req, res, finalhandler(req, res))
})
 
server.listen(3000)

// let message = {
//   id: shortid.generate(),
//   text: 'Hello'
// }

// client.insert(message, { deadline: getDeadline() }, (error, reply) => {;
//   if (!error) {
//     console.log('success', reply);
//   } else {
//     console.log(error);
//   }
// })
