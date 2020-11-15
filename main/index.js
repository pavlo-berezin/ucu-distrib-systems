const grpc = require('grpc');
const shortid = require('shortid');
const PROTO_PATH = '../messages.proto'

const messageProto = grpc.load(__dirname + '/../messages.proto');

const client = new messageProto.MessageService('localhost:50051', grpc.credentials.createInsecure());

const getDeadline = (ttl = 5000) => new Date(Date.now() + ttl);

let message = {
  id: shortid.generate(),
  text: 'Hello'
}

client.insert(message, { deadline: getDeadline() }, (error, reply) => {;
  if (!error) {
    console.log('success', reply);
  } else {
    console.log(error);
  }
})
