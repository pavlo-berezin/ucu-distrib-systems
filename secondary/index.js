const grpc = require('grpc')
const messageProto = grpc.load(__dirname + '/../messages.proto');

const messages = [];
const ids = new Set()

const server = new grpc.Server()
server.addService(messageProto.MessageService.service, {
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


server.bind('127.0.0.1:50051', grpc.ServerCredentials.createInsecure());
console.log('server running');
server.start();